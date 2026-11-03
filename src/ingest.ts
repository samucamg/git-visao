// Orquestra a raspagem: lê mensagens novas do grupo, filtra o que já se conhece,
// confere a licença e só então cataloga. Todas as chamadas externas entram por `deps`.

import {
  extractGitHubRepoLinks,
  isEvolutionConfigured,
  normalizeMessage,
  type EvolutionConfig,
  type EvolutionMessage,
  type EvolutionMessagesPage
} from './evolution.ts';
import { GitHubApiError, isOpenSourceLicense, type RepoProbeResult } from './github.ts';
import {
  MAX_ERROR_ATTEMPTS,
  acquireIngestLock,
  getIngestConfig,
  getIngestLogRow,
  getIngestState,
  lookupKnownKeys,
  releaseIngestLock,
  saveIngestState,
  upsertIngestLog,
  type IngestConfig,
  type IngestGroup,
  type IngestLogInput,
  type IngestRunSummary,
  type IngestState,
  type IngestStatus
} from './ingest-db.ts';
import type { Env, GeneratedVisaoSummary, GitHubRepoMetadata } from './types.ts';

export interface IngestDeps {
  fetchPage(
    config: EvolutionConfig,
    jid: string,
    page: number,
    pageSize: number
  ): Promise<EvolutionMessagesPage>;
  probe(fullName: string): Promise<RepoProbeResult>;
  fetchMeta(fullName: string): Promise<GitHubRepoMetadata>;
  summarize(meta: GitHubRepoMetadata): Promise<GeneratedVisaoSummary>;
  save(meta: GitHubRepoMetadata, summary: GeneratedVisaoSummary): Promise<unknown>;
  nowMs(): number;
}

export interface RunIngestOptions {
  trigger: 'cron' | 'manual';
  /** Lê o histórico inteiro do grupo (ignora o cursor). */
  fullBackfill?: boolean;
}

// Custos aproximados em "pontos" por candidato (cada ponto ~ uma subrequest do Worker).
const PROBE_COST = 1;
const FULL_COST = 3;
const BACKFILL_MAX_PAGES = 60;

function emptySummary(trigger: 'cron' | 'manual', startedAt: string): IngestRunSummary {
  return {
    trigger,
    startedAt,
    finishedAt: startedAt,
    groups: 0,
    messagesScanned: 0,
    candidates: 0,
    added: 0,
    pending: 0,
    ignored: 0,
    errors: 0,
    alreadyKnown: 0,
    truncated: false,
    gap: false,
    rateLimited: false,
    items: []
  };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runIngest(
  db: D1Database,
  env: Env | undefined,
  deps: IngestDeps,
  options: RunIngestOptions
): Promise<IngestRunSummary> {
  const summary = emptySummary(options.trigger, new Date(deps.nowMs()).toISOString());
  const config = await getIngestConfig(db, env);

  const skip = (reason: string): IngestRunSummary => {
    summary.skipped = reason;
    summary.finishedAt = new Date(deps.nowMs()).toISOString();
    return summary;
  };

  if (options.trigger === 'cron' && !config.enabled) return skip('Raspagem automática desativada.');
  if (!isEvolutionConfigured(config)) return skip('Evolution API ainda não configurada.');
  const groups = config.groups.filter((g) => g.enabled);
  if (groups.length === 0) return skip('Nenhum grupo selecionado para a raspagem.');

  if (!(await acquireIngestLock(db, deps.nowMs()))) {
    return skip('Já existe uma raspagem em andamento.');
  }

  const state = await getIngestState(db);
  const budget = { units: 0 };

  try {
    for (const group of groups) {
      if (summary.rateLimited || summary.truncated) break;
      summary.groups++;
      try {
        await processGroup(db, config, group, state, deps, summary, budget, options);
      } catch (err) {
        summary.errors++;
        summary.fatalError ||= describeError(err);
        summary.items.push({
          repo: `(grupo ${group.name})`,
          status: 'error',
          reason: describeError(err)
        });
      }
    }
  } finally {
    summary.finishedAt = new Date(deps.nowMs()).toISOString();
    state.lastRun = summary;
    try {
      await saveIngestState(db, state);
    } finally {
      await releaseIngestLock(db);
    }
  }
  return summary;
}

async function processGroup(
  db: D1Database,
  config: IngestConfig,
  group: IngestGroup,
  state: IngestState,
  deps: IngestDeps,
  summary: IngestRunSummary,
  budget: { units: number },
  options: RunIngestOptions
): Promise<void> {
  const evolution: EvolutionConfig = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    instance: config.instance
  };
  const nowSec = Math.floor(deps.nowMs() / 1000);
  const initialCursor = state.cursors[group.jid] ?? nowSec - config.lookbackDays * 86400;
  let cursor = options.fullBackfill ? 0 : initialCursor;
  const maxPages = options.fullBackfill ? BACKFILL_MAX_PAGES : config.maxPagesPerRun;

  // 1) Lê da mais nova para a mais antiga até cruzar o cursor.
  const collected = new Map<string, EvolutionMessage>();
  let reachedCursor = false;
  for (let page = 1; page <= maxPages; page++) {
    const res = await deps.fetchPage(evolution, group.jid, page, config.pageSize);
    let minTs = Infinity;
    for (const record of res.records) {
      const msg = normalizeMessage(record);
      if (!msg) continue;
      minTs = Math.min(minTs, msg.ts);
      if (msg.ts > cursor) collected.set(msg.id || `${msg.ts}:${msg.text.slice(0, 40)}`, msg);
    }
    if (res.records.length === 0 || page >= res.pages || minTs <= cursor) {
      reachedCursor = true;
      break;
    }
  }
  if (!reachedCursor) summary.gap = true;

  // 2) Processa em ordem cronológica, para o cursor avançar sem pular nada.
  const ordered = [...collected.values()].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  summary.messagesScanned += ordered.length;

  const perMessage = ordered.map((msg) => ({ msg, repos: extractGitHubRepoLinks(msg.text) }));
  const known = await lookupKnownKeys(
    db,
    perMessage.flatMap((m) => m.repos)
  );
  const seen = new Set<string>();

  for (const { msg, repos } of perMessage) {
    let blocked = false;

    for (const full of repos) {
      const key = full.toLowerCase();
      if (seen.has(key)) continue;

      if (known.catalog.has(key)) {
        summary.alreadyKnown++;
        seen.add(key);
        continue;
      }
      const logged = known.log.get(key);
      if (
        logged &&
        logged.status !== 'requested' &&
        (logged.status !== 'error' || logged.attempts >= MAX_ERROR_ATTEMPTS)
      ) {
        summary.alreadyKnown++;
        seen.add(key);
        continue;
      }

      if (budget.units >= config.maxUnitsPerRun) {
        summary.truncated = true;
        blocked = true;
        break;
      }

      summary.candidates++;
      seen.add(key);
      const outcome = await processCandidate(db, full, msg, group, deps, summary, budget);
      if (outcome === 'rate_limited') {
        summary.rateLimited = true;
        blocked = true;
        break;
      }
    }

    if (blocked) {
      // Relê esta mensagem na próxima execução (o que já foi decidido é pulado pelo log).
      cursor = Math.max(cursor, msg.ts - 1);
      break;
    }
    cursor = Math.max(cursor, msg.ts);
  }

  // Sem --fullBackfill o cursor nunca volta atrás.
  state.cursors[group.jid] = options.fullBackfill
    ? Math.max(cursor, state.cursors[group.jid] ?? 0)
    : Math.max(cursor, initialCursor);
}

function record(
  summary: IngestRunSummary,
  repo: string,
  status: IngestStatus,
  reason: string
): void {
  summary.items.push({ repo, status, reason });
  if (status === 'added') summary.added++;
  else if (status === 'pending') summary.pending++;
  else if (status === 'ignored') summary.ignored++;
  else summary.errors++;
}

async function processCandidate(
  db: D1Database,
  full: string,
  msg: EvolutionMessage,
  group: IngestGroup,
  deps: IngestDeps,
  summary: IngestRunSummary,
  budget: { units: number }
): Promise<'ok' | 'rate_limited'> {
  const key = full.toLowerCase();
  const log = async (
    status: IngestStatus,
    reason: string,
    extra: Partial<IngestLogInput> = {}
  ): Promise<void> => {
    await upsertIngestLog(db, {
      repoKey: key,
      fullName: full,
      status,
      reason,
      source: group.name,
      sender: msg.sender,
      messageTs: msg.ts,
      ...extra
    });
    record(summary, full, status, reason);
  };

  try {
    const probe = await deps.probe(full);
    budget.units += PROBE_COST;

    if (probe.kind === 'rate_limited') return 'rate_limited';
    if (probe.kind === 'not_found') {
      await log('ignored', 'Repositório não encontrado ou privado.');
      return 'ok';
    }
    if (probe.kind === 'blocked') {
      await log('ignored', `Acesso bloqueado pelo GitHub (HTTP ${probe.status}).`);
      return 'ok';
    }

    // Repositório renomeado/movido que já está no catálogo com o nome novo.
    if (probe.repoKey !== key) {
      const again = await lookupKnownKeys(db, [probe.repoKey]);
      if (again.catalog.has(probe.repoKey)) {
        await log('ignored', `Mesmo repositório de ${probe.fullName}, que já está no catálogo.`);
        return 'ok';
      }
    }

    let meta: GitHubRepoMetadata | null = null;
    let licenseType = probe.licenseType;
    let spdx = probe.licenseSpdx;

    // A API não informou licença: inspeciona LICENSE/README antes de decidir.
    if (licenseType === null) {
      meta = await deps.fetchMeta(probe.fullName);
      budget.units += FULL_COST;
      licenseType = meta.licenseType ?? 'unlicensed';
      spdx = meta.licenseSpdx || '';
    }

    const common: Partial<IngestLogInput> = {
      licenseSpdx: spdx,
      licenseType,
      stars: probe.stars,
      description: probe.description
    };

    if (licenseType === 'source-available') {
      await log('ignored', `Licença não aberta (${spdx || 'source-available'}).`, common);
      return 'ok';
    }
    if (!isOpenSourceLicense(licenseType)) {
      const label = spdx && spdx !== 'None' ? ` (${spdx})` : '';
      await log('pending', `Sem licença open source identificada${label}. Aguardando decisão.`, common);
      return 'ok';
    }

    if (!meta) {
      meta = await deps.fetchMeta(probe.fullName);
      budget.units += FULL_COST;
    }
    if (meta.isHarmful) {
      await log('ignored', 'harmful_content', common);
      return 'ok';
    }
    const generated = await deps.summarize(meta);
    await deps.save(meta, generated);
    await log('added', `Open source (${spdx || licenseType}).`, common);
    return 'ok';
  } catch (err) {
    if (err instanceof GitHubApiError && (err.status === 403 || err.status === 429)) {
      return 'rate_limited';
    }
    await log('error', describeError(err));
    return 'ok';
  }
}

// ---------------------------------------------------------------- revisão manual (admin)

export interface ReviewResult {
  ok: boolean;
  message: string;
  repoKey: string;
}

/**
 * Ações do admin sobre um item da raspagem:
 *  - approve: cataloga mesmo sem licença aberta (decisão humana);
 *  - dismiss: descarta;
 *  - retry: repete a análise normal (com o filtro de licença), útil para erros transitórios.
 */
export async function reviewIngestItem(
  db: D1Database,
  deps: IngestDeps,
  repoKey: string,
  action: 'approve' | 'dismiss' | 'retry'
): Promise<ReviewResult> {
  const key = repoKey.trim().toLowerCase();
  const row = await getIngestLogRow(db, key);
  if (!row) {
    return { ok: false, message: 'Repositório não encontrado na lista de raspagem.', repoKey: key };
  }

  if (action === 'retry') {
    const temp = emptySummary('manual', new Date(deps.nowMs()).toISOString());
    const outcome = await processCandidate(
      db,
      row.full_name,
      { id: '', ts: row.message_ts, sender: row.sender, text: '' },
      { jid: '', name: row.source, enabled: true },
      deps,
      temp,
      { units: 0 }
    );
    if (outcome === 'rate_limited') {
      return {
        ok: false,
        message: 'Limite da API do GitHub atingido. Tente de novo mais tarde.',
        repoKey: key
      };
    }
    const item = temp.items[0];
    return {
      ok: !item || item.status !== 'error',
      message: item ? item.reason : 'Sem alteração.',
      repoKey: key
    };
  }

  if (action === 'dismiss') {
    await upsertIngestLog(db, {
      repoKey: key,
      fullName: row.full_name,
      status: 'ignored',
      reason: 'Dispensado pelo admin.',
      source: row.source,
      sender: row.sender,
      messageTs: row.message_ts
    });
    return { ok: true, message: 'Repositório dispensado.', repoKey: key };
  }

  const meta = await deps.fetchMeta(row.full_name);
  const generated = await deps.summarize(meta);
  await deps.save(meta, generated);
  await upsertIngestLog(db, {
    repoKey: key,
    fullName: row.full_name,
    status: 'added',
    reason: 'Aprovado manualmente pelo admin.',
    licenseSpdx: meta.licenseSpdx || '',
    licenseType: meta.licenseType || '',
    stars: meta.stars,
    source: row.source,
    sender: row.sender,
    messageTs: row.message_ts
  });
  return { ok: true, message: 'Repositório catalogado.', repoKey: key };
}

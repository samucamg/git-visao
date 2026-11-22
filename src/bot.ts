// Bot do GitVisão no WhatsApp: responde no grupo com os repositórios que casam com a pergunta.
// Usa a mesma instância da Evolution da raspagem (ingest-db.ts). Persistência em app_settings (bot_config, bot_state).

import { getKV } from './db.ts';
import { extractMessageText, normalizeMessage, type EvolutionMessage } from './evolution.ts';
import { ensureIngestSchema, getIngestConfig, type IngestConfig } from './ingest-db.ts';
import type { Env } from './types.ts';

// ---------------------------------------------------------------- tipos

export interface BotConfig {
  enabled: boolean;
  secret: string;
  triggers: string[];
  ownerNumber: string;
  siteUrl: string;
  allowAllGroups: boolean;
  cooldownSeconds: number;
  maxResults: number;
}

export interface BotConfigPatch extends Partial<BotConfig> {
  /** true gera um novo segredo (o caminho do webhook muda; atualize-o na Evolution). */
  regenerateSecret?: boolean;
}

export interface BotSearchItem {
  full_name: string;
  fullName?: string;
  repo_key: string;
  repo_url: string;
  hook_title: string;
  stars: number;
  category: string;
  description: string;
}

export interface BotSearchResult {
  items: BotSearchItem[];
  total: number;
  query: { terms: string[] } | null;
}

export interface EvolutionTarget {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

export interface QuotedMessage {
  key: unknown;
  message: unknown;
}

export interface BotDeps {
  search: (db: D1Database, question: string, limit: number) => Promise<BotSearchResult>;
  sendText: (
    target: EvolutionTarget,
    jid: string,
    text: string,
    quoted?: QuotedMessage
  ) => Promise<void>;
  now: () => number;
}

export interface BotWebhookResult {
  ok: boolean;
  handled: boolean;
  reason: string;
}

export interface EvolutionWebhookRegistration {
  ok: boolean;
  previous?: unknown;
  response?: unknown;
  error?: string;
}

// ---------------------------------------------------------------- constantes

export const BOT_SIGNATURE = '🤖 *GitVisão*';
const CONFIG_KEY = 'bot_config';
const STATE_KEY = 'bot_state';
const KV_CONFIG_KEY = 'admin:bot';
const MAX_REPLY_CHARS = 1200;
const MAX_MESSAGE_AGE_S = 5 * 60;
const MAX_PROCESSED_IDS = 200;
const COOLDOWN_RETENTION_MS = 60 * 60 * 1000;
const TUTORIALS = 'youtube.com/@SamucaTutoriais';

export const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: false,
  secret: '',
  triggers: ['/vision', '!vision', '@vision', 'vision?'],
  ownerNumber: '',
  siteUrl: 'https://vision.24hs.eu.org',
  allowAllGroups: false,
  cooldownSeconds: 8,
  maxResults: 5
};

// ---------------------------------------------------------------- configuração

function randomSecret(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export function normalizeBotConfig(raw: unknown): BotConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const triggers = Array.isArray(src.triggers)
    ? src.triggers
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 12)
    : DEFAULT_BOT_CONFIG.triggers;
  const secret = typeof src.secret === 'string' && /^[a-f0-9]{16,64}$/i.test(src.secret)
    ? src.secret.toLowerCase()
    : '';
  const siteUrl =
    typeof src.siteUrl === 'string' && /^https?:\/\//i.test(src.siteUrl.trim())
      ? src.siteUrl.trim().replace(/\/+$/, '')
      : DEFAULT_BOT_CONFIG.siteUrl;
  return {
    enabled: src.enabled === true,
    secret,
    triggers,
    ownerNumber: typeof src.ownerNumber === 'string' ? src.ownerNumber.replace(/\D/g, '') : '',
    siteUrl,
    allowAllGroups: src.allowAllGroups === true,
    cooldownSeconds: clampInt(src.cooldownSeconds, 0, 3600, DEFAULT_BOT_CONFIG.cooldownSeconds),
    maxResults: clampInt(src.maxResults, 1, 10, DEFAULT_BOT_CONFIG.maxResults)
  };
}

async function readSetting(db: D1Database, key: string): Promise<string | null> {
  await ensureIngestSchema(db);
  const row = await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row ? String(row.value) : null;
}

async function writeSetting(db: D1Database, key: string, value: string): Promise<void> {
  await ensureIngestSchema(db);
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value)
    .run();
}

async function readRawConfig(db: D1Database, env?: Env): Promise<unknown> {
  const raw = await readSetting(db, CONFIG_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // cai para o espelho no KV
    }
  }
  const kv = getKV(env);
  if (kv) {
    try {
      const mirrored = await kv.get(KV_CONFIG_KEY);
      if (mirrored) return JSON.parse(mirrored);
    } catch {
      // ignora
    }
  }
  return null;
}

/** Lê a configuração; na primeira leitura gera e grava o segredo do webhook. */
export async function getBotConfig(db: D1Database, env?: Env): Promise<BotConfig> {
  const config = normalizeBotConfig(await readRawConfig(db, env));
  if (!config.secret) {
    config.secret = randomSecret();
    await persistBotConfig(db, config, env);
  }
  return config;
}

async function persistBotConfig(db: D1Database, config: BotConfig, env?: Env): Promise<void> {
  const json = JSON.stringify(config);
  await writeSetting(db, CONFIG_KEY, json);
  const kv = getKV(env);
  if (kv) {
    try {
      await kv.put(KV_CONFIG_KEY, json);
    } catch (err) {
      console.warn('Erro ao espelhar configuração do bot no KV:', err);
    }
  }
}

export async function saveBotConfig(
  db: D1Database,
  patch: BotConfigPatch,
  env?: Env
): Promise<BotConfig> {
  const current = await getBotConfig(db, env);
  const merged = { ...current, ...stripUndefined(patch) } as BotConfig;
  if (patch.regenerateSecret === true || !merged.secret) merged.secret = randomSecret();
  const normalized = normalizeBotConfig(merged);
  normalized.secret = merged.secret; // segredo já validado acima
  await persistBotConfig(db, normalized, env);
  return normalized;
}

function stripUndefined(patch: BotConfigPatch): Partial<BotConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k !== 'regenerateSecret' && v !== undefined) out[k] = v;
  }
  return out as Partial<BotConfig>;
}

/** Visão para o admin: o segredo aparece porque a tela é restrita ao administrador. */
export function maskBotConfig(config: BotConfig) {
  return { ...config, webhookPath: `/api/bot/webhook/${config.secret}` };
}

// ---------------------------------------------------------------- detecção

function boundaryOk(lower: string, end: number): boolean {
  const next = lower.charAt(end);
  return next === '' || !/[\p{L}\p{N}]/u.test(next);
}

function cleanQuestion(raw: string): string {
  return raw
    .replace(/@\d+/g, ' ')
    .replace(/\bvision\b/gi, ' ')
    .replace(/[/@]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s?!.,:;\-]+|[\s?!.,:;\-]+$/g, '')
    .trim();
}

/**
 * Pergunta do usuário quando a mensagem aciona o bot, ou null quando não aciona.
 * '' significa acionado sem pergunta (o bot responde com a ajuda).
 */
export function detectBotQuery(
  text: string,
  mentionedJids: string[],
  config: BotConfig
): string | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  // Loop: as respostas do próprio bot chegam como mensagens do dono (fromMe).
  if (raw.startsWith(BOT_SIGNATURE)) return null;

  const lower = raw.toLowerCase();
  let rest: string | null = null;

  for (const trigger of config.triggers) {
    const t = trigger.trim().toLowerCase();
    if (t && lower.startsWith(t) && boundaryOk(lower, t.length)) {
      rest = raw.slice(t.length);
      break;
    }
  }

  if (rest === null && config.ownerNumber) {
    const owner = config.ownerNumber;
    const mentioned =
      mentionedJids.some((j) => j === `${owner}@s.whatsapp.net` || j.endsWith('@lid')) ||
      raw.includes(`@${owner}`);
    // Menção sozinha não aciona: é preciso também a palavra "vision".
    if (mentioned && /\bvision\b/i.test(raw)) rest = raw;
  }

  if (rest === null) return null;
  return cleanQuestion(rest);
}

// ---------------------------------------------------------------- formatação

function formatStars(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1000) {
    const mil = (n / 1000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `⭐ ${mil} mil`;
  }
  return `⭐ ${Math.round(n)}`;
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function usageText(config: BotConfig): string {
  const example = config.triggers[0] || '/vision';
  return [
    `${BOT_SIGNATURE} — como perguntar`,
    '',
    'Mencione o número do GitVisão com a palavra *vision* ou comece com um comando:',
    `• ${example} segurança`,
    '• vision: automação com IA',
    '',
    `🔎 Catálogo: ${config.siteUrl}/`,
    `📺 Tutoriais: ${TUTORIALS}`
  ].join('\n');
}

/** Resposta em formato WhatsApp. Pergunta vazia devolve a ajuda. */
export function formatBotReply(
  question: string,
  result: BotSearchResult,
  config: BotConfig,
  _lang: string = 'pt'
): string {
  if (!question.trim()) return usageText(config);

  const site = config.siteUrl;
  const q = shorten(question, 80);
  const searchLink = `${site}/?q=${encodeURIComponent(question.trim())}`;
  const items = (result.items || []).slice(0, config.maxResults);

  if (items.length === 0) {
    return [
      `${BOT_SIGNATURE} — nada encontrado para: _${q}_`,
      '',
      'Tente outras palavras, por exemplo o tema, a linguagem ou a tecnologia (ex.: "segurança", "python", "automação").',
      '',
      '🔎 Busque no site:',
      searchLink,
      '',
      `📺 Tutoriais: ${TUTORIALS}`
    ].join('\n');
  }

  const total = Math.max(Number(result.total) || 0, items.length);
  const build = (withHooks: boolean, count: number): string => {
    const lines: string[] = [`${BOT_SIGNATURE} — resultado para: _${q}_`, ''];
    items.slice(0, count).forEach((item, i) => {
      const full = item.full_name || item.fullName || item.repo_key;
      const stars = formatStars(Number(item.stars));
      lines.push(`${i + 1}. *${full}*${stars ? ` ${stars}` : ''}`);
      const hook = withHooks ? shorten(item.hook_title || item.description || '', 90) : '';
      if (hook) lines.push(`   ${hook}`);
      lines.push(`   ${site}/?repo=${full}`);
    });
    lines.push('');
    lines.push(`🔎 Ver os ${total} resultados no site:`);
    lines.push(searchLink);
    lines.push('');
    lines.push(`📺 Tutoriais: ${TUTORIALS}`);
    return lines.join('\n');
  };

  let text = build(true, items.length);
  if (text.length > MAX_REPLY_CHARS) text = build(false, items.length);
  for (let count = items.length - 1; text.length > MAX_REPLY_CHARS && count >= 1; count--) {
    text = build(false, count);
  }
  return text;
}

// ---------------------------------------------------------------- Evolution

function evolutionUrl(target: EvolutionTarget, path: string): string {
  return `${target.baseUrl.trim().replace(/\/+$/, '')}${path}`;
}

function isEvolutionReady(config: Partial<EvolutionTarget>): config is EvolutionTarget {
  return Boolean(config.baseUrl?.trim() && config.apiKey?.trim() && config.instance?.trim());
}

async function sendEvolutionText(
  target: EvolutionTarget,
  jid: string,
  text: string,
  quoted?: QuotedMessage
): Promise<void> {
  const res = await fetch(evolutionUrl(target, `/message/sendText/${encodeURIComponent(target.instance)}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: target.apiKey },
    body: JSON.stringify({ number: jid, text, ...(quoted ? { quoted } : {}) }),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`Evolution sendText HTTP ${res.status}`);
}

async function evoCall(
  target: EvolutionTarget,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  try {
    const res = await fetch(evolutionUrl(target, path), {
      method,
      headers: { 'Content-Type': 'application/json', apikey: target.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function evolutionTargetFrom(db: D1Database, env?: Env): Promise<EvolutionTarget | null> {
  const ingest: IngestConfig = await getIngestConfig(db, env);
  const target = { baseUrl: ingest.baseUrl, apiKey: ingest.apiKey, instance: ingest.instance };
  return isEvolutionReady(target) ? target : null;
}

/** Webhook atual da instância na Evolution (somente leitura). */
export async function getEvolutionWebhook(
  db: D1Database,
  env?: Env
): Promise<{ ok: boolean; webhook?: unknown; error?: string }> {
  const target = await evolutionTargetFrom(db, env);
  if (!target) return { ok: false, error: 'Evolution não configurada (URL, chave ou instância).' };
  const res = await evoCall(target, 'GET', `/webhook/find/${encodeURIComponent(target.instance)}`);
  if (!res.ok) {
    return { ok: false, error: res.error || `Evolution respondeu HTTP ${res.status}.` };
  }
  return { ok: true, webhook: res.data };
}

/**
 * Aponta o webhook da instância para o bot. Chamada só por botão explícito do admin.
 * Lê o webhook atual antes (devolvido em `previous` para o admin avisar sobre substituição).
 */
export async function registerEvolutionWebhook(
  db: D1Database,
  env: Env,
  webhookUrl: string
): Promise<EvolutionWebhookRegistration> {
  const target = await evolutionTargetFrom(db, env);
  if (!target) return { ok: false, error: 'Evolution não configurada (URL, chave ou instância).' };
  const instance = encodeURIComponent(target.instance);

  const current = await evoCall(target, 'GET', `/webhook/find/${instance}`);
  const previous = current.ok ? current.data : undefined;

  const v2 = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT']
    }
  };
  let res = await evoCall(target, 'POST', `/webhook/set/${instance}`, v2);
  if (res.status === 400) {
    res = await evoCall(target, 'POST', `/webhook/set/${instance}`, {
      enabled: true,
      url: webhookUrl,
      webhook_by_events: false,
      events: ['MESSAGES_UPSERT']
    });
  }

  if (!res.ok) {
    return {
      ok: false,
      previous,
      response: res.data,
      error: res.error || `Evolution respondeu HTTP ${res.status} ao definir o webhook.`
    };
  }
  return { ok: true, previous, response: res.data };
}

// ---------------------------------------------------------------- estado (dedupe e cooldown)

interface BotState {
  processed: string[];
  lastReplyAt: Record<string, number>;
}

async function readBotState(db: D1Database): Promise<BotState> {
  const raw = await readSetting(db, STATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        processed: Array.isArray(parsed?.processed) ? parsed.processed.map(String) : [],
        lastReplyAt:
          parsed?.lastReplyAt && typeof parsed.lastReplyAt === 'object' ? parsed.lastReplyAt : {}
      };
    } catch {
      // estado corrompido: recomeça
    }
  }
  return { processed: [], lastReplyAt: {} };
}

async function writeBotState(db: D1Database, state: BotState, nowMs: number): Promise<void> {
  const lastReplyAt: Record<string, number> = {};
  for (const [jid, at] of Object.entries(state.lastReplyAt)) {
    if (nowMs - Number(at) < COOLDOWN_RETENTION_MS) lastReplyAt[jid] = Number(at);
  }
  await writeSetting(
    db,
    STATE_KEY,
    JSON.stringify({ processed: state.processed.slice(-MAX_PROCESSED_IDS), lastReplyAt })
  );
}

// ---------------------------------------------------------------- webhook

type AnyRecord = Record<string, any>;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function collectMentionedJids(message: unknown, depth = 0): string[] {
  if (!message || typeof message !== 'object' || depth > 5) return [];
  const m = message as AnyRecord;
  const out: string[] = [];
  for (const key of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage']) {
    const jids = m[key]?.contextInfo?.mentionedJid;
    if (Array.isArray(jids)) out.push(...jids.map(String));
  }
  for (const key of [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'documentWithCaptionMessage',
    'editedMessage'
  ]) {
    out.push(...collectMentionedJids(m[key]?.message, depth + 1));
  }
  return out;
}

const defaultDeps: BotDeps = {
  search: async (db, question, limit) => {
    // Importação dinâmica: os testes não dependem do módulo de busca.
    const specifier = './search.ts';
    const mod: AnyRecord = await import(specifier);
    return mod.searchRepositories(db, { q: question, limit, lang: 'pt' });
  },
  sendText: sendEvolutionText,
  now: () => Date.now()
};

async function processRecord(
  db: D1Database,
  env: Env,
  bot: BotConfig,
  ingest: IngestConfig,
  record: AnyRecord,
  deps: BotDeps
): Promise<BotWebhookResult> {
  const key = (record.key ?? {}) as AnyRecord;
  const jid = String(key.remoteJid || '');
  const skip = (reason: string): BotWebhookResult => ({ ok: true, handled: false, reason });

  if (!jid.endsWith('@g.us')) return skip('not_group');

  const allowed =
    bot.allowAllGroups || ingest.groups.some((g) => g.jid === jid && g.enabled !== false);
  if (!allowed) return skip('group_not_allowed');

  const question = detectBotQuery(
    extractMessageText(record),
    collectMentionedJids(record.message),
    bot
  );
  if (question === null) return skip('not_trigger');

  const parsed: EvolutionMessage | null = normalizeMessage(record);
  if (!parsed) return skip('no_timestamp');
  const nowMs = deps.now();
  if (nowMs / 1000 - parsed.ts > MAX_MESSAGE_AGE_S) return skip('too_old');

  const state = await readBotState(db);
  if (parsed.id && state.processed.includes(parsed.id)) return skip('duplicate');
  const last = Number(state.lastReplyAt[jid] || 0);
  if (last && nowMs - last < bot.cooldownSeconds * 1000) return skip('cooldown');

  // Marca antes de enviar: um reenvio do Evolution não gera segunda resposta.
  if (parsed.id) state.processed.push(parsed.id);
  state.lastReplyAt[jid] = nowMs;
  await writeBotState(db, state, nowMs);

  const target = await evolutionTargetFrom(db, env);
  if (!target) return skip('evolution_not_configured');

  let text: string;
  if (!question) {
    text = formatBotReply('', { items: [], total: 0, query: null }, bot);
  } else {
    try {
      const result = await deps.search(db, question, bot.maxResults);
      text = formatBotReply(question, result, bot);
    } catch (err) {
      console.error('Bot: falha na busca', err);
      text = `${BOT_SIGNATURE} — não consegui buscar agora. Tente de novo em instantes.\n🔎 ${bot.siteUrl}/?q=${encodeURIComponent(question)}`;
    }
  }

  await deps.sendText(target, jid, text, { key: record.key, message: record.message });
  return { ok: true, handled: true, reason: 'replied' };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/** POST /api/bot/webhook/<segredo>: recebe o evento da Evolution. Sempre responde rápido. */
export async function handleBotWebhook(
  request: Request,
  env: Env,
  deps: Partial<BotDeps> = {}
): Promise<Response> {
  const db = env.DB;
  const d: BotDeps = { ...defaultDeps, ...deps };

  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const secretFromUrl = segments[segments.length - 1] || '';
  const bot = await getBotConfig(db, env);
  if (!bot.secret || !constantTimeEqual(secretFromUrl, bot.secret)) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  let body: AnyRecord;
  try {
    body = (await request.json()) as AnyRecord;
  } catch {
    return jsonResponse({ ok: false, handled: false, reason: 'invalid_json' }, 400);
  }

  const event = String(body?.event || '').toUpperCase().replace(/[.\-\s]/g, '_');
  if (event !== 'MESSAGES_UPSERT') {
    return jsonResponse({ ok: true, handled: false, reason: 'event_ignored' });
  }
  if (!bot.enabled) {
    return jsonResponse({ ok: true, handled: false, reason: 'disabled' });
  }

  const records: AnyRecord[] = Array.isArray(body.data)
    ? body.data
    : body.data && typeof body.data === 'object'
      ? [body.data]
      : [];
  if (records.length === 0) {
    return jsonResponse({ ok: true, handled: false, reason: 'no_message' });
  }

  const ingest = await getIngestConfig(db, env);
  const reasons: string[] = [];
  let handled = false;
  for (const record of records.slice(0, 20)) {
    try {
      const result = await processRecord(db, env, bot, ingest, record, d);
      if (result.handled) handled = true;
      reasons.push(result.reason);
    } catch (err) {
      // Erro aqui não pode virar retry infinito do Evolution.
      console.error('Bot: erro ao processar mensagem', err);
      reasons.push('error');
    }
  }
  return jsonResponse({
    ok: true,
    handled,
    reason: [...new Set(reasons)].join(',')
  });
}

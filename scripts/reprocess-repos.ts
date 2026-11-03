#!/usr/bin/env node
/**
 * Script de Reprocessamento e Correção em Lote - Git-Visão
 * 
 * Objetivo:
 * - Corrigir repositórios salvos com títulos e intros repetitivas ou desatualizadas no banco D1.
 * - Iterar sobre todos os repositórios do catálogo (via GET /api/repos com paginação por cursor).
 * - Forçar a regeneração completa de metadados, categorias, templateType, hook_title, intro_text e resumos
 *   chamando o endpoint POST /api/repos com `force: true`.
 * - Sincronizar automaticamente as alterações no Cloudflare D1 e KV correspondente.
 * - Suporta --dry-run, --limit <n>, --delay <ms>, --force, --target <url>, --password <senha>.
 * - Mantém checkpoint em scripts/reprocess_progress.json para tolerância a interrupções.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CliConfig {
  targetUrl: string;
  adminPassword: string;
  limit?: number;
  delayMs: number;
  dryRun: boolean;
  force: boolean;
  progressFile: string;
  githubToken?: string;
}

export interface RemoteRepoItem {
  repo_key?: string;
  full_name?: string;
  name?: string;
  owner?: string;
  repo_url?: string;
  description?: string;
  stars?: number;
  category?: string;
  template_type?: string;
  hook_title?: string;
  intro_text?: string;
  [key: string]: unknown;
}

export interface ReprocessRecord {
  status: 'success' | 'error' | 'skipped';
  repo: string;
  category?: string;
  templateType?: string;
  hookTitle?: string;
  introText?: string;
  error?: string;
  updatedAt: string;
}

export interface ReprocessStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
  byCategory: Record<string, number>;
  byTemplate: Record<string, number>;
}

export interface ProgressStore {
  lastRunAt: string;
  targetUrl: string;
  records: Record<string, ReprocessRecord>;
}

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliConfig {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
    if (idx === -1) return undefined;
    const item = argv[idx];
    if (item.includes('=')) {
      return item.split('=')[1];
    }
    return argv[idx + 1];
  };

  const hasFlag = (flag: string): boolean => {
    return argv.some((a) => a === flag || a.startsWith(`${flag}=`));
  };

  const rawTarget =
    getArg('--target') ||
    process.env.TARGET_URL ||
    'http://localhost:8787';
  const targetUrl = rawTarget.replace(/\/+$/, '');

  const adminPassword =
    getArg('--password') || process.env.ADMIN_PASSWORD || '';

  const rawLimit = getArg('--limit') || process.env.LIMIT;
  const limit = rawLimit ? parseInt(rawLimit, 10) : undefined;

  const rawDelay = getArg('--delay') || process.env.DELAY_MS;
  const delayMs = rawDelay ? parseInt(rawDelay, 10) : 1200;

  const dryRun =
    hasFlag('--dry-run') || process.env.DRY_RUN === 'true' || false;

  const force =
    hasFlag('--force') || process.env.FORCE === 'true' || false;

  const progressFile =
    getArg('--progress') ||
    process.env.PROGRESS_FILE ||
    path.join(__dirname, 'reprocess_progress.json');

  const githubToken =
    getArg('--github-token') || process.env.GITHUB_TOKEN || undefined;

  return {
    targetUrl,
    adminPassword,
    limit: limit && !isNaN(limit) && limit > 0 ? limit : undefined,
    delayMs: isNaN(delayMs) || delayMs < 0 ? 1200 : delayMs,
    dryRun,
    force,
    progressFile,
    githubToken
  };
}

export function loadProgress(file: string, targetUrl: string): ProgressStore {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.records === 'object') {
        if (parsed.targetUrl === targetUrl) {
          return parsed as ProgressStore;
        }
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Não foi possível carregar arquivo de progresso (${file}): ${err.message}`);
  }

  return {
    lastRunAt: new Date().toISOString(),
    targetUrl,
    records: {}
  };
}

export function saveProgress(file: string, store: ProgressStore): void {
  try {
    store.lastRunAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`⚠️ Falha ao salvar progresso em ${file}: ${err.message}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAllCatalogRepos(config: CliConfig): Promise<RemoteRepoItem[]> {
  const allRepos: RemoteRepoItem[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  let page = 1;

  console.log(`📡 Consultando catálogo cadastrado em ${config.targetUrl}/api/repos...`);

  while (hasMore) {
    const url = new URL(`${config.targetUrl}/api/repos`);
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'git-visao-reprocess'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as {
        ok?: boolean;
        items?: RemoteRepoItem[];
        total?: number;
        hasMore?: boolean;
        nextCursor?: string | null;
      };

      if (!data.items || !Array.isArray(data.items)) {
        break;
      }

      for (const item of data.items) {
        allRepos.push(item);
        if (config.limit && allRepos.length >= config.limit) {
          hasMore = false;
          break;
        }
      }

      console.log(`   📄 Página ${page}: recuperados ${data.items.length} repos (Total acumulado: ${allRepos.length})`);

      if (data.hasMore && data.nextCursor && (!config.limit || allRepos.length < config.limit)) {
        cursor = data.nextCursor;
        page++;
        await sleep(300);
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Falha ao consultar /api/repos na página ${page}: ${err.message}`);
      break;
    }
  }

  return allRepos;
}

export async function reprocessSingleRepo(
  item: RemoteRepoItem,
  config: CliConfig
): Promise<{ success: boolean; record: ReprocessRecord; responseData?: any }> {
  const fullName = (item.full_name || item.name || item.repo_key || '').trim();
  const repoKey = fullName.toLowerCase();

  const record: ReprocessRecord = {
    status: 'success',
    repo: fullName,
    category: item.category || 'Outros',
    templateType: item.template_type || 'app-tool',
    hookTitle: item.hook_title,
    introText: item.intro_text,
    updatedAt: new Date().toISOString()
  };

  if (config.dryRun) {
    return { success: true, record };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Admin-Password': config.adminPassword
    };

    if (config.githubToken) {
      headers['X-GitHub-Token'] = config.githubToken;
    }

    const res = await fetch(`${config.targetUrl}/api/repos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        repo: fullName,
        password: config.adminPassword,
        force: true
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      record.status = 'error';
      record.error = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
      return { success: false, record };
    }

    const data = (await res.json()) as { ok?: boolean; repo?: any; error?: string };
    if (!data.ok) {
      record.status = 'error';
      record.error = data.error || 'Erro desconhecido ao reprocessar repositório';
      return { success: false, record, responseData: data };
    }

    if (data.repo) {
      record.category = data.repo.category;
      record.templateType = data.repo.template_type;
      record.hookTitle = data.repo.hook_title;
      record.introText = data.repo.intro_text;
    }

    return { success: true, record, responseData: data };
  } catch (err: any) {
    record.status = 'error';
    record.error = err.message || 'Falha de rede ao reprocessar repositório';
    return { success: false, record };
  }
}

export function printReport(stats: ReprocessStats, isDryRun: boolean): void {
  console.log(`\n======================================================================`);
  console.log(`📊 RELATÓRIO CONSOLIDADO DE REPROCESSAMENTO DE REPOSITÓRIOS`);
  console.log(`======================================================================`);
  console.log(`• Modo de execução     : ${isDryRun ? 'DRY-RUN (Simulação)' : 'PRODUÇÃO (D1 + KV atualizados)'}`);
  console.log(`• Total processados    : ${stats.total}`);
  console.log(`• Sucessos             : ${stats.success}`);
  console.log(`• Pulados (Checkpoint) : ${stats.skipped}`);
  console.log(`• Erros                : ${stats.errors}`);
  console.log(`----------------------------------------------------------------------`);

  console.log(`\n🏷️ DISTRIBUIÇÃO POR CATEGORIA ATUALIZADA:`);
  for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / (stats.total || 1)) * 100).toFixed(1);
    console.log(`   ${cat.padEnd(40)}: ${String(count).padStart(4)} (${pct}%)`);
  }

  console.log(`\n🧩 DISTRIBUIÇÃO POR TEMPLATE TYPE:`);
  for (const [tpl, count] of Object.entries(stats.byTemplate).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / (stats.total || 1)) * 100).toFixed(1);
    console.log(`   ${tpl.padEnd(30)}: ${String(count).padStart(4)} (${pct}%)`);
  }
  console.log(`======================================================================\n`);
}

export async function main(): Promise<void> {
  const config = parseCliArgs();

  console.log(`\n============================================================`);
  console.log(`🚀 SCRIPT DE REPROCESSAMENTO E CORREÇÃO - GIT-VISÃO`);
  console.log(`============================================================`);
  console.log(`• Alvo da API    : ${config.targetUrl}`);
  console.log(`• Modo Dry-Run   : ${config.dryRun ? 'SIM (Apenas simulação)' : 'NÃO (Gravação ativa no D1/KV)'}`);
  console.log(`• Limite         : ${config.limit ? config.limit : 'Todos'}`);
  console.log(`• Forçar tudo    : ${config.force ? 'SIM' : 'NÃO (Usa checkpoint)'}`);
  console.log(`• Checkpoint     : ${config.progressFile}`);
  console.log(`• Delay entre req: ${config.delayMs}ms`);
  console.log(`============================================================\n`);

  if (!config.dryRun && !config.adminPassword) {
    console.error(`❌ Erro: Senha de administrador obrigatória (--password ou ADMIN_PASSWORD).`);
    process.exit(1);
  }

  const progressStore = loadProgress(config.progressFile, config.targetUrl);

  process.on('SIGINT', () => {
    console.log(`\n\n⚠️ Interrupção detectada. Salvando progresso...`);
    saveProgress(config.progressFile, progressStore);
    process.exit(0);
  });

  const repos = await fetchAllCatalogRepos(config);
  const total = repos.length;

  if (total === 0) {
    console.error(`❌ Nenhum repositório encontrado para reprocessar.`);
    process.exit(1);
  }

  console.log(`\n📦 Total de repositórios no catálogo: ${total}\n`);

  const stats: ReprocessStats = {
    total,
    success: 0,
    skipped: 0,
    errors: 0,
    byCategory: {},
    byTemplate: {}
  };

  for (let i = 0; i < total; i++) {
    const item = repos[i];
    const fullName = (item.full_name || item.name || item.repo_key || '').trim();
    if (!fullName) continue;

    const repoKey = fullName.toLowerCase();
    const currentNum = i + 1;
    const pct = Math.round((currentNum / total) * 100);
    const prefix = `[${currentNum}/${total}] (${pct}%)`;

    const existing = progressStore.records[repoKey];
    if (!config.force && existing && existing.status === 'success') {
      console.log(`${prefix} ⏭️ Pulando ${fullName} (Já reprocessado anteriormente)`);
      stats.skipped++;
      const cat = existing.category || 'Outros';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
      const tpl = existing.templateType || 'app-tool';
      stats.byTemplate[tpl] = (stats.byTemplate[tpl] || 0) + 1;
      continue;
    }

    process.stdout.write(`${prefix} 🔄 Reprocessando ${fullName}... `);

    const { success, record } = await reprocessSingleRepo(item, config);

    progressStore.records[repoKey] = record;
    saveProgress(config.progressFile, progressStore);

    if (success) {
      stats.success++;
      const cat = record.category || 'Outros';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
      const tpl = record.templateType || 'app-tool';
      stats.byTemplate[tpl] = (stats.byTemplate[tpl] || 0) + 1;

      console.log(`✅ [Cat: ${cat}] [Tpl: ${tpl}]`);
    } else {
      stats.errors++;
      console.log(`❌ Erro: ${record.error}`);
    }

    if (config.delayMs > 0 && i < total - 1) {
      await sleep(config.delayMs);
    }
  }

  printReport(stats, config.dryRun);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('❌ Erro fatal no reprocessamento:', err);
    process.exit(1);
  });
}

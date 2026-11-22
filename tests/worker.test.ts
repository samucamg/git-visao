import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  parseGitHubRepoInput,
  classifyLicense,
  classifyDeployDifficulty,
  classifyCostModel,
  fetchGitHubRepoMetadata
} from '../src/github.ts';
import {
  TEMPLATE_VARIATIONS,
  buildWhatsAppText,
  detectCategory,
  detectTemplateType,
  formatDatePtBr,
  formatStarsPtBr
} from '../src/templates.ts';
import { generateFallbackSummary } from '../src/ai.ts';
import { extractAdminPassword, verifyAdminPassword } from '../src/auth.ts';
import { createSqliteD1, insertCatalogRepo } from './helpers/sqlite-d1.ts';
import worker from '../src/index.ts';
import type { Env, GitHubRepoMetadata, RepoRecord } from '../src/types.ts';
import {
  decodeCursor,
  encodeCursor,
  ensureDatabaseInitialized,
  findRepoByKey,
  getRuntimeSettings,
  invalidateSettingsCache,
  listRepositories,
  saveRuntimeSettings,
  type RepoCursor,
  type SerializedRepo
} from '../src/db.ts';
import {
  parseCliArgs,
  loadProgress,
  saveProgress
} from '../scripts/reclassify_repos.ts';

function createInMemoryKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    async get(key: string, type?: string) {
      const val = store.get(key);
      if (val === undefined) return null;
      if (type === 'json') {
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }
      return val;
    },
    async put(key: string, value: string) {
      store.set(key, String(value));
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return {
        keys,
        list_complete: true,
        cursor: ''
      };
    }
  } as unknown as KVNamespace;
}

function createInMemoryD1(): D1Database {
  const rows = new Map<string, RepoRecord>();
  const settings = new Map<string, string>();
  let autoId = 1;

  function buildPreparedStatement(sql: string, boundArgs: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    return {
      bind(...args: unknown[]) {
        return buildPreparedStatement(sql, args);
      },

      async run() {
        if (
          normalizedSql.startsWith('CREATE TABLE') ||
          normalizedSql.startsWith('CREATE INDEX')
        ) {
          return { success: true, meta: {} };
        }

        if (normalizedSql.includes('INTO app_settings')) {
          const isIgnore = normalizedSql.startsWith('INSERT OR IGNORE');
          const key = String(boundArgs[0] ?? '');
          const value = String(boundArgs[1] ?? '');
          if (isIgnore && settings.has(key)) {
            return { success: true, meta: { changes: 0 } };
          }
          if (key) {
            settings.set(key, value);
          }
          return { success: true, meta: { changes: 1 } };
        }

        if (
          normalizedSql.startsWith('INSERT OR IGNORE INTO repositories') ||
          normalizedSql.startsWith('INSERT INTO repositories')
        ) {
          const isIgnore = normalizedSql.startsWith('INSERT OR IGNORE');
          const repoKey = String(boundArgs[0] || '').toLowerCase();
          if (isIgnore && rows.has(repoKey)) {
            return { success: true, meta: { changes: 0 } };
          }

          const existing = rows.get(repoKey);
          const now = new Date().toISOString();
          const record: RepoRecord = {
            id: existing ? existing.id : autoId++,
            repo_key: repoKey,
            full_name: String(boundArgs[1] ?? ''),
            owner: String(boundArgs[2] ?? ''),
            name: String(boundArgs[3] ?? ''),
            repo_url: String(boundArgs[4] ?? ''),
            description: String(boundArgs[5] ?? ''),
            stars: Number(boundArgs[6] ?? 0),
            forks: Number(boundArgs[7] ?? 0),
            language: String(boundArgs[8] ?? ''),
            topics_json: String(boundArgs[9] ?? '[]'),
            last_commit_at: String(boundArgs[10] ?? ''),
            category: boundArgs[11] as RepoRecord['category'],
            template_type: boundArgs[12] as RepoRecord['template_type'],
            hook_title: String(boundArgs[13] ?? ''),
            intro_text: String(boundArgs[14] ?? ''),
            warning_note: String(boundArgs[15] ?? ''),
            features_json: String(boundArgs[16] ?? '[]'),
            scenario_title: String(boundArgs[17] ?? ''),
            scenario_intro: String(boundArgs[18] ?? ''),
            scenario_prompt: String(boundArgs[19] ?? ''),
            scenario_steps_json: String(boundArgs[20] ?? '[]'),
            scenario_outro: String(boundArgs[21] ?? ''),
            killer_title: String(boundArgs[22] ?? ''),
            killer_text: String(boundArgs[23] ?? ''),
            summary_text: String(boundArgs[24] ?? ''),
            punchline: String(boundArgs[25] ?? ''),
            whatsapp_text: String(boundArgs[26] ?? ''),
            license_spdx: boundArgs[27] ? String(boundArgs[27]) : '',
            license_type: boundArgs[28] as RepoRecord['license_type'],
            license_badge: boundArgs[29] ? String(boundArgs[29]) : '',
            is_free: boundArgs[30] !== undefined ? Number(boundArgs[30]) : 1,
            cost_model: boundArgs[31] as RepoRecord['cost_model'],
            cost_badge: boundArgs[32] ? String(boundArgs[32]) : '',
            cost_notes: boundArgs[33] ? String(boundArgs[33]) : '',
            deploy_difficulty: boundArgs[34] as RepoRecord['deploy_difficulty'],
            deploy_badge: boundArgs[35] ? String(boundArgs[35]) : '',
            deploy_method: boundArgs[36] ? String(boundArgs[36]) : '',
            created_at: existing ? existing.created_at : now,
            updated_at: now
          };

          rows.set(repoKey, record);
          return { success: true, meta: { changes: 1 } };
        }

        if (normalizedSql.startsWith('DELETE FROM repositories WHERE repo_key = ?')) {
          const key = String(boundArgs[0] || '').toLowerCase();
          const deleted = rows.delete(key);
          return { success: true, meta: { changes: deleted ? 1 : 0 } };
        }

        return { success: true, meta: {} };
      },

      async first<T = unknown>(): Promise<T | null> {
        if (
          normalizedSql.includes('SELECT COUNT(*) as total FROM repositories') ||
          normalizedSql.includes('SELECT COUNT(*) as count FROM repositories') ||
          normalizedSql.includes('SELECT COUNT(*) as cnt FROM repositories') ||
          normalizedSql.startsWith('SELECT COUNT(*)')
        ) {
          let list = Array.from(rows.values());
          let argIndex = 0;

          if (normalizedSql.includes('LOWER(full_name) LIKE ?')) {
            const rawLike = String(boundArgs[argIndex] || '').replace(/^%|%$/g, '').toLowerCase();
            argIndex += 7;
            list = list.filter((r) => {
              const hay = [
                r.full_name,
                r.description,
                r.hook_title,
                r.intro_text,
                r.features_json,
                r.summary_text,
                r.topics_json
              ]
                .join(' ')
                .toLowerCase();
              return hay.includes(rawLike);
            });
          }

          if (normalizedSql.includes('category = ?')) {
            const cat = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.category === cat);
          }

          if (normalizedSql.includes('template_type = ?')) {
            const tpl = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.template_type === tpl);
          }

          if (normalizedSql.includes('license_type = ?')) {
            const lic = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.license_type === lic);
          }

          if (normalizedSql.includes('cost_model = ?')) {
            const cst = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.cost_model === cst);
          }

          if (normalizedSql.includes('deploy_difficulty = ?')) {
            const dep = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.deploy_difficulty === dep);
          }

          return {
            total: list.length,
            count: list.length,
            cnt: list.length
          } as unknown as T;
        }

        if (normalizedSql.includes('FROM app_settings') && normalizedSql.includes('WHERE key = ?')) {
          const key = String(boundArgs[0] ?? '');
          if (!settings.has(key)) return null;
          return { key, value: settings.get(key)! } as unknown as T;
        }

        if (normalizedSql.startsWith('SELECT * FROM repositories WHERE repo_key = ?')) {
          const key = String(boundArgs[0] || '').toLowerCase();
          return (rows.get(key) ?? null) as unknown as T | null;
        }

        return null;
      },

      async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
        if (normalizedSql.includes('FROM app_settings')) {
          const results = Array.from(settings.entries()).map(([key, value]) => ({
            key,
            value
          })) as unknown as T[];
          return { results, success: true, meta: {} };
        }

        if (normalizedSql.startsWith('SELECT category, template_type')) {
          const results = Array.from(rows.values()).map((r) => ({
            category: r.category,
            template_type: r.template_type,
            license_type: r.license_type,
            cost_model: r.cost_model,
            deploy_difficulty: r.deploy_difficulty
          })) as unknown as T[];
          return { results, success: true, meta: {} };
        }

        // Consultas do motor de busca novo (src/search.ts)
        if (normalizedSql.startsWith('SELECT * FROM repositories WHERE id IN (')) {
          const ids = new Set(boundArgs.map((v) => Number(v)));
          const results = Array.from(rows.values()).filter((r) => ids.has(Number(r.id))) as unknown as T[];
          return { results, success: true, meta: {} };
        }
        if (normalizedSql.startsWith('SELECT category AS k') || normalizedSql.startsWith('SELECT language AS k')) {
          const field = normalizedSql.startsWith('SELECT category') ? 'category' : 'language';
          const counts = new Map<string, number>();
          for (const r of rows.values()) {
            const k = String((r as unknown as Record<string, unknown>)[field] || '');
            if (!k) continue;
            counts.set(k, (counts.get(k) || 0) + 1);
          }
          const results = Array.from(counts.entries()).map(([k, n]) => ({ k, n })) as unknown as T[];
          return { results, success: true, meta: {} };
        }
        if (normalizedSql.startsWith('SELECT id, repo_key')) {
          let list = Array.from(rows.values());
          let i = 0;
          if (normalizedSql.includes('category = ?')) {
            const cat = String(boundArgs[i++] || '');
            list = list.filter((r) => r.category === cat);
          }
          if (normalizedSql.includes('LOWER(language) = ?')) {
            const lang = String(boundArgs[i++] || '');
            list = list.filter((r) => String(r.language || '').toLowerCase() === lang);
          }
          if (normalizedSql.includes('stars >= ?')) {
            const min = Number(boundArgs[i++] || 0);
            list = list.filter((r) => Number(r.stars) >= min);
          }
          return { results: list as unknown as T[], success: true, meta: {} };
        }

        if (normalizedSql.startsWith('SELECT * FROM repositories')) {
          let list = Array.from(rows.values());
          let argIndex = 0;

          if (normalizedSql.includes('LOWER(full_name) LIKE ?')) {
            const rawLike = String(boundArgs[argIndex] || '').replace(/^%|%$/g, '').toLowerCase();
            argIndex += 7;
            list = list.filter((r) => {
              const hay = [
                r.full_name,
                r.description,
                r.hook_title,
                r.intro_text,
                r.features_json,
                r.summary_text,
                r.topics_json
              ]
                .join(' ')
                .toLowerCase();
              return hay.includes(rawLike);
            });
          }

          if (normalizedSql.includes('category = ?')) {
            const cat = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.category === cat);
          }

          if (normalizedSql.includes('template_type = ?')) {
            const tpl = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.template_type === tpl);
          }

          if (normalizedSql.includes('license_type = ?')) {
            const lic = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.license_type === lic);
          }

          if (normalizedSql.includes('cost_model = ?')) {
            const cst = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.cost_model === cst);
          }

          if (normalizedSql.includes('deploy_difficulty = ?')) {
            const dep = String(boundArgs[argIndex++] || '');
            list = list.filter((r) => r.deploy_difficulty === dep);
          }

          if (normalizedSql.includes('(updated_at < ? OR (updated_at = ? AND id < ?))')) {
            const cursorUpdatedAt = String(boundArgs[argIndex++] ?? '');
            argIndex++; // pula o segundo ? (mesmo updatedAt)
            const cursorId = Number(boundArgs[argIndex++] ?? 0);
            list = list.filter((r) => {
              if (r.updated_at < cursorUpdatedAt) return true;
              if (r.updated_at === cursorUpdatedAt && r.id < cursorId) return true;
              return false;
            });
          } else if (normalizedSql.includes('id < ?')) {
            const cursorId = Number(boundArgs[argIndex++] ?? 0);
            list = list.filter((r) => r.id < cursorId);
          } else if (normalizedSql.includes('(stars < ? OR (stars = ? AND id < ?))')) {
            const cursorStars = Number(boundArgs[argIndex++] ?? 0);
            argIndex++; // pula o segundo ? (mesmo stars)
            const cursorId = Number(boundArgs[argIndex++] ?? 0);
            list = list.filter((r) => {
              if (r.stars < cursorStars) return true;
              if (r.stars === cursorStars && r.id < cursorId) return true;
              return false;
            });
          } else if (normalizedSql.includes('(full_name > ? OR (full_name = ? AND id > ?))')) {
            const cursorName = String(boundArgs[argIndex++] ?? '');
            argIndex++; // pula o segundo ? (mesmo name)
            const cursorId = Number(boundArgs[argIndex++] ?? 0);
            list = list.filter((r) => {
              if (r.full_name > cursorName) return true;
              if (r.full_name === cursorName && r.id > cursorId) return true;
              return false;
            });
          }

          if (normalizedSql.includes('ORDER BY stars DESC')) {
            list.sort((a, b) => {
              if (b.stars !== a.stars) return b.stars - a.stars;
              return b.id - a.id;
            });
          } else if (normalizedSql.includes('ORDER BY full_name ASC')) {
            list.sort((a, b) => {
              const cmp = a.full_name.localeCompare(b.full_name);
              if (cmp !== 0) return cmp;
              return a.id - b.id;
            });
          } else {
            list.sort((a, b) => {
              if (a.updated_at && b.updated_at && a.updated_at !== b.updated_at) {
                return b.updated_at.localeCompare(a.updated_at);
              }
              return b.id - a.id;
            });
          }

          let limitArg = 100;
          const limitMatch = normalizedSql.match(/LIMIT\s+(\d+)/i);
          if (limitMatch) {
            limitArg = Number(limitMatch[1]);
          } else if (normalizedSql.includes('LIMIT ?')) {
            limitArg = Number(boundArgs[argIndex] ?? boundArgs[boundArgs.length - 1] ?? 100);
          }

          if (Number.isFinite(limitArg) && limitArg > 0) {
            list = list.slice(0, limitArg);
          }

          return { results: list as unknown as T[], success: true, meta: {} };
        }

        return { results: [], success: true, meta: {} };
      }
    };
  }

  return {
    prepare(sql: string) {
      return buildPreparedStatement(sql);
    }
  } as unknown as D1Database;
}

test('1. parseGitHubRepoInput faz parse de diferentes formatos de URL do GitHub', () => {
  const fullUrl = parseGitHubRepoInput('https://github.com/browseros-ai/BrowserOS');
  assert.ok(fullUrl);
  assert.equal(fullUrl.owner, 'browseros-ai');
  assert.equal(fullUrl.name, 'BrowserOS');
  assert.equal(fullUrl.repoKey, 'browseros-ai/browseros');
  assert.equal(fullUrl.repoUrl, 'https://github.com/browseros-ai/BrowserOS');

  const shortInput = parseGitHubRepoInput('ArnasDon/wacrm');
  assert.ok(shortInput);
  assert.equal(shortInput.fullName, 'ArnasDon/wacrm');
  assert.equal(shortInput.repoKey, 'arnasdon/wacrm');

  const gitSuffixAndBranch = parseGitHubRepoInput(
    'https://www.github.com/samucamg/veroroute-edge.git/tree/main?tab=readme#instalacao'
  );
  assert.ok(gitSuffixAndBranch);
  assert.equal(gitSuffixAndBranch.fullName, 'samucamg/veroroute-edge');
  assert.equal(gitSuffixAndBranch.repoKey, 'samucamg/veroroute-edge');

  assert.equal(parseGitHubRepoInput(''), null);
  assert.equal(parseGitHubRepoInput('apenas-um-nome'), null);
});

test('2. Detecção das 5 variações de template e formatação WhatsApp conforme INSTRUCOES.md', () => {
  assert.equal(formatStarsPtBr(14100), '14,1 mil');
  assert.equal(formatStarsPtBr(2600), '2,6 mil');
  assert.equal(formatStarsPtBr(12), '12');
  assert.equal(formatDatePtBr('2026-10-23T12:00:00Z'), '23/10/2026');

  const baseMeta: GitHubRepoMetadata = {
    repoKey: 'org/repo',
    fullName: 'org/repo',
    owner: 'org',
    name: 'repo',
    repoUrl: 'https://github.com/org/repo',
    description: '',
    stars: 14100,
    forks: 100,
    language: 'TypeScript',
    topics: [],
    lastCommitAt: '2026-10-23T00:00:00Z',
    readmeExcerpt: ''
  };

  assert.equal(
    detectTemplateType({ ...baseMeta, description: 'Autonomous AI agent with MCP server' }),
    'ai-agent-automation'
  );
  assert.equal(
    detectTemplateType({ ...baseMeta, description: 'Open source WhatsApp CRM self-hosted' }),
    'self-hosted-saas'
  );
  assert.equal(
    detectTemplateType({ ...baseMeta, description: 'Cloudflare Worker AI Gateway and failover proxy' }),
    'infra-gateway'
  );
  assert.equal(
    detectTemplateType({ ...baseMeta, description: 'TypeScript SDK library and CLI package for npm' }),
    'dev-lib-cli'
  );
  assert.equal(
    detectTemplateType({ ...baseMeta, description: 'Fast desktop note-taking productivity app' }),
    'app-tool'
  );

  // Valida que todas as 5 variações geram texto de WhatsApp no formato do INSTRUCOES.md
  const allTemplates = [
    'ai-agent-automation',
    'self-hosted-saas',
    'infra-gateway',
    'app-tool',
    'dev-lib-cli'
  ] as const;

  for (const tpl of allTemplates) {
    const summary = generateFallbackSummary(baseMeta, tpl);
    assert.equal(summary.templateType, tpl);
    assert.equal(summary.category, detectCategory(baseMeta, tpl));

    const text = buildWhatsAppText(baseMeta, summary);
    assert.ok(text.includes('🔗 https://github.com/org/repo'));
    assert.ok(text.includes('⭐ 14,1 mil estrelas no GitHub'));
    assert.ok(text.includes('🕒 Último commit em 23/10/2026'));
    assert.ok(text.includes('━━━━━━━━━━━━━━━━━━'));
    assert.ok(text.includes('📋 FICHA TÉCNICA'));
    assert.ok(text.includes('⚖️ Licença:'));
    assert.ok(text.includes('💰 Custo Real:'));
    assert.ok(text.includes('⚙️ Instalação:'));
    assert.ok(text.includes('🏷️ Categoria:'));
    assert.ok(text.includes('1️⃣ '));
    assert.ok(text.includes(TEMPLATE_VARIATIONS[tpl].summaryHeader));
    assert.ok(text.includes('🚀 '));
  }
});

test('3. Autenticação de admin (verifyAdminPassword e extractAdminPassword)', async () => {
  assert.equal(await verifyAdminPassword('senha-correta-123', 'senha-correta-123'), true);
  assert.equal(await verifyAdminPassword('senha-errada', 'senha-correta-123'), false);
  assert.equal(await verifyAdminPassword('', 'senha-correta-123'), false);
  assert.equal(await verifyAdminPassword('senha-correta-123', ''), false);

  const reqWithHeader = new Request('https://example.com/api/repos', {
    method: 'POST',
    headers: { 'x-admin-password': 'secret-header-pass' }
  });
  assert.equal(extractAdminPassword(reqWithHeader, 'body-pass'), 'secret-header-pass');

  const reqWithBearer = new Request('https://example.com/api/repos', {
    method: 'POST',
    headers: { Authorization: 'Bearer bearer-token-pass' }
  });
  assert.equal(extractAdminPassword(reqWithBearer), 'bearer-token-pass');
});

test('4. Rotas da API do Worker (/api/health, /api/repos, /api/check e POST /api/repos com cache e senha)', async () => {
  const env: Env = {
    DB: createInMemoryD1(),
    GITVISAO_KV: createInMemoryKV(),
    OMNI_KEYS: createInMemoryKV(),
    ADMIN_PASSWORD: 'admin-visao-secret',
    OMNIROUTE_MODEL: 'gemini-2.5-flash',
    PUBLIC_APP_TITLE: 'GitVisão Teste'
  };

  // GET /api/health
  const healthRes = await worker.fetch(new Request('https://gitvisao.local/api/health'), env);
  assert.equal(healthRes.status, 200);
  const healthData = (await healthRes.json()) as Record<string, unknown>;
  assert.equal(healthData.ok, true);
  // A saúde pública não expõe nada de configuração.
  for (const leaked of ['omnirouteModel', 'omnirouteConfigured', 'usingDefaultPassword', 'githubTokenConfigured']) {
    assert.equal(leaked in healthData, false, `/api/health não deve expor ${leaked}`);
  }

  // GET /api/repos (deve conter os 5 repositórios iniciais do seed)
  const listRes = await worker.fetch(new Request('https://gitvisao.local/api/repos'), env);
  assert.equal(listRes.status, 200);
  const listData = (await listRes.json()) as { ok: boolean; total: number; items: Array<{ repo_key: string }> };
  assert.equal(listData.ok, true);
  assert.ok(listData.total >= 5);

  // GET /api/check para repositório que JÁ EXISTE no seed (BrowserOS)
  const checkExistingRes = await worker.fetch(
    new Request('https://gitvisao.local/api/check?repo=https://github.com/browseros-ai/BrowserOS'),
    env
  );
  assert.equal(checkExistingRes.status, 200);
  const checkExistingData = (await checkExistingRes.json()) as {
    ok: boolean;
    exists: boolean;
    repo: { full_name: string; whatsapp_text: string };
  };
  assert.equal(checkExistingData.ok, true);
  assert.equal(checkExistingData.exists, true);
  assert.equal(checkExistingData.repo.full_name, 'browseros-ai/BrowserOS');
  assert.ok(checkExistingData.repo.whatsapp_text.includes('BrowserOS'));

  // GET /api/check para repositório INÉDITO
  const checkNewRes = await worker.fetch(
    new Request('https://gitvisao.local/api/check?repo=owner-inedito/repo-inedito'),
    env
  );
  assert.equal(checkNewRes.status, 200);
  const checkNewData = (await checkNewRes.json()) as { ok: boolean; exists: boolean };
  assert.equal(checkNewData.ok, true);
  assert.equal(checkNewData.exists, false);

  // Sem senha, as rotas de admin respondem 401.
  const noAuthItems = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/ingest/items'),
    env
  );
  assert.equal(noAuthItems.status, 401);

  // POST /api/repos exige senha de admin SEMPRE (inclusive para repositório já existente).
  const postNoPassRes = await worker.fetch(
    new Request('https://gitvisao.local/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'ArnasDon/wacrm' })
    }),
    env
  );
  assert.equal(postNoPassRes.status, 401);

  // Senha na URL não é mais aceita.
  const postQueryPassRes = await worker.fetch(
    new Request('https://gitvisao.local/api/repos?password=admin-visao-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'ArnasDon/wacrm' })
    }),
    env
  );
  assert.equal(postQueryPassRes.status, 401);

  // Com a senha, repositório existente devolve o cache (200).
  const postCachedRes = await worker.fetch(
    new Request('https://gitvisao.local/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'ArnasDon/wacrm', password: 'admin-visao-secret' })
    }),
    env
  );
  assert.equal(postCachedRes.status, 200);
  const postCachedData = (await postCachedRes.json()) as {
    ok: boolean;
    cached: boolean;
    repo: { repo_key: string };
  };
  assert.equal(postCachedData.ok, true);
  assert.equal(postCachedData.cached, true);
  assert.equal(postCachedData.repo.repo_key, 'arnasdon/wacrm');

  // POST /api/repos para repositório INÉDITO sem senha ou com senha errada deve retornar 401
  const postUnauthorizedRes = await worker.fetch(
    new Request('https://gitvisao.local/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'novo-org/novo-repo', password: 'senha-incorreta' })
    }),
    env
  );
  assert.equal(postUnauthorizedRes.status, 401);
  const postUnauthorizedData = (await postUnauthorizedRes.json()) as {
    ok: boolean;
    requiresPassword: boolean;
  };
  assert.equal(postUnauthorizedData.ok, false);
  assert.equal(postUnauthorizedData.requiresPassword, true);

  // POST /api/repos para repositório INÉDITO com senha correta (mockando fetch do GitHub)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.github.com/repos/novo-org/novo-repo/commits')) {
      return new Response(
        JSON.stringify([{ commit: { committer: { date: '2026-10-24T10:00:00Z' } } }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('api.github.com/repos/novo-org/novo-repo/readme')) {
      return new Response(
        '# Novo Repo\n- Integração rápida com agentes MCP\n- Execução segura local sem nuvem\n- Automação completa no navegador',
        { status: 200, headers: { 'Content-Type': 'text/plain' } }
      );
    }
    if (url.includes('api.github.com/repos/novo-org/novo-repo')) {
      return new Response(
        JSON.stringify({
          full_name: 'novo-org/novo-repo',
          name: 'novo-repo',
          owner: { login: 'novo-org' },
          html_url: 'https://github.com/novo-org/novo-repo',
          description: 'Agente autônomo de IA com suporte a MCP',
          stargazers_count: 3500,
          forks_count: 210,
          language: 'TypeScript',
          topics: ['ai-agent', 'mcp'],
          pushed_at: '2026-10-24T10:00:00Z'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const postAuthorizedRes = await worker.fetch(
      new Request('https://gitvisao.local/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: 'https://github.com/novo-org/novo-repo',
          password: 'admin-visao-secret',
          templateType: 'ai-agent-automation'
        })
      }),
      env
    );
    assert.equal(postAuthorizedRes.status, 200);
    const postAuthorizedData = (await postAuthorizedRes.json()) as {
      ok: boolean;
      cached: boolean;
      repo: { repo_key: string; template_type: string; whatsapp_text: string };
    };
    assert.equal(postAuthorizedData.ok, true);
    assert.equal(postAuthorizedData.cached, false);
    assert.equal(postAuthorizedData.repo.repo_key, 'novo-org/novo-repo');
    assert.equal(postAuthorizedData.repo.template_type, 'ai-agent-automation');
    assert.ok(postAuthorizedData.repo.whatsapp_text.includes('3,5 mil estrelas no GitHub'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5. Painel Zero-CLI (/api/settings): senha padrão "admin" inicial e persistência de senha + OmniRoute no D1', async () => {
  // Instalação limpa sem variáveis de ambiente (apenas banco D1 e KVs vazios)
  const cleanEnv: Env = {
    DB: createInMemoryD1(),
    GITVISAO_KV: createInMemoryKV(),
    OMNI_KEYS: createInMemoryKV()
  };

  // 1. Verifica que instalação limpa usa a senha padrão "admin" e omnirouteConfigured = false
  const initialStatusRes = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/status', {
      headers: { 'X-Admin-Password': 'admin' }
    }),
    cleanEnv
  );
  assert.equal(initialStatusRes.status, 200);
  const initialStatus = (await initialStatusRes.json()) as {
    ok: boolean;
    settings: { usingDefaultPassword: boolean; hasOmnirouteApiKey: boolean };
  };
  assert.equal(initialStatus.ok, true);
  assert.equal(initialStatus.settings.usingDefaultPassword, true);
  assert.equal(initialStatus.settings.hasOmnirouteApiKey, false);

  // 2. Verifica que GET /api/settings aceita a senha padrão "admin"
  const getSettingsInitialRes = await worker.fetch(
    new Request('https://gitvisao.local/api/settings', {
      headers: { 'X-Admin-Password': 'admin' }
    }),
    cleanEnv
  );
  assert.equal(getSettingsInitialRes.status, 200);

  // 3. POST /api/settings autenticado com "admin" altera a senha para "minha-nova-senha" e configura OmniRoute no D1
  const updateSettingsRes = await worker.fetch(
    new Request('https://gitvisao.local/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'admin',
        newPassword: 'minha-nova-senha',
        omnirouteBaseUrl: 'https://omniroute.seudominio.com/v1',
        omnirouteApiKey: 'sk-omniroute-secret-9999',
        omnirouteModel: 'gemini-2.5-flash',
        publicAppTitle: 'GitVisão Custom D1'
      })
    }),
    cleanEnv
  );
  assert.equal(updateSettingsRes.status, 200);
  const updateSettingsData = (await updateSettingsRes.json()) as {
    ok: boolean;
    usingDefaultPassword: boolean;
    hasOmnirouteApiKey: boolean;
    omnirouteBaseUrl: string;
    publicAppTitle: string;
  };
  assert.equal(updateSettingsData.ok, true);
  assert.equal(updateSettingsData.usingDefaultPassword, false);
  assert.equal(updateSettingsData.hasOmnirouteApiKey, true);
  assert.equal(updateSettingsData.omnirouteBaseUrl, 'https://omniroute.seudominio.com/v1');
  assert.equal(updateSettingsData.publicAppTitle, 'GitVisão Custom D1');

  // 4. Verifica que a senha antiga "admin" passa a ser recusada (401)
  const oldPasswordRes = await worker.fetch(
    new Request('https://gitvisao.local/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'admin',
        publicAppTitle: 'Tentativa Inválida'
      })
    }),
    cleanEnv
  );
  assert.equal(oldPasswordRes.status, 401);

  // 5. Verifica que a nova senha "minha-nova-senha" passa a ser aceita (200)
  const newPasswordRes = await worker.fetch(
    new Request('https://gitvisao.local/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'minha-nova-senha',
        omnirouteModel: 'gemini-2.5-pro'
      })
    }),
    cleanEnv
  );
  assert.equal(newPasswordRes.status, 200);
  const newPasswordData = (await newPasswordRes.json()) as {
    ok: boolean;
    omnirouteModel: string;
  };
  assert.equal(newPasswordData.ok, true);
  assert.equal(newPasswordData.omnirouteModel, 'gemini-2.5-pro');

  // 6. Healthcheck reflete OmniRoute configurado e senha definitiva ativa
  const finalStatusRes = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/status', {
      headers: { 'X-Admin-Password': 'minha-nova-senha' }
    }),
    cleanEnv
  );
  const finalStatus = (await finalStatusRes.json()) as {
    settings: { usingDefaultPassword: boolean; hasOmnirouteApiKey: boolean; omnirouteModel: string };
  };
  assert.equal(finalStatus.settings.usingDefaultPassword, false);
  assert.equal(finalStatus.settings.hasOmnirouteApiKey, true);
  assert.equal(finalStatus.settings.omnirouteModel, 'gemini-2.5-pro');
});

test('6. Persistência Híbrida (KV + D1): precedência do KV sobre env após reset e restauração de backup do KV para D1 vazio', async () => {
  // A. Precedência de RuntimeSettings no KV sobre env e sobrevivência a reset de variáveis
  const kv = createInMemoryKV();
  const d1 = createInMemoryD1();
  const envWithCustomVar: Env = {
    DB: d1,
    GITVISAO_KV: kv,
    OMNI_KEYS: createInMemoryKV(),
    ADMIN_PASSWORD: 'env-initial-pass',
    OMNIROUTE_MODEL: 'gemini-2.5-flash',
    PUBLIC_APP_TITLE: 'GitVisão Env Title'
  };

  await ensureDatabaseInitialized(envWithCustomVar.DB, envWithCustomVar);

  // Salva configurações personalizadas (deve persistir no D1 E no KV)
  await saveRuntimeSettings(
    envWithCustomVar.DB,
    {
      adminPassword: 'kv-super-secret-pass',
      omnirouteModel: 'gemini-2.5-pro',
      publicAppTitle: 'GitVisão Persistido no KV'
    },
    envWithCustomVar
  );

  // Valida que o KV gravou as chaves em 'admin:settings'
  const rawKvSettings = await kv.get('admin:settings');
  assert.ok(rawKvSettings, 'Configurações devem estar persistidas em admin:settings no KV');
  const parsedKvSettings = JSON.parse(rawKvSettings as string);
  assert.equal(parsedKvSettings.adminPassword, 'kv-super-secret-pass');
  assert.equal(parsedKvSettings.omnirouteModel, 'gemini-2.5-pro');
  assert.equal(parsedKvSettings.publicAppTitle, 'GitVisão Persistido no KV');

  // Simula um reset de variáveis de ambiente (ex: Deploy do GitHub / Sync Fork que restaura defaults no env)
  invalidateSettingsCache();
  const envAfterReset: Env = {
    DB: d1,
    GITVISAO_KV: kv,
    OMNI_KEYS: createInMemoryKV(),
    ADMIN_PASSWORD: 'admin', // Variável de ambiente resetada para default
    OMNIROUTE_MODEL: 'gemini-2.5-flash', // Resetada
    PUBLIC_APP_TITLE: 'GitVisão • Catálogo Pega a Visão' // Resetada
  };

  const resolved = await getRuntimeSettings(envAfterReset.DB, envAfterReset);
  assert.equal(
    resolved.adminPassword,
    'kv-super-secret-pass',
    'KV deve ter precedência máxima sobre o env resetado'
  );
  assert.equal(
    resolved.omnirouteModel,
    'gemini-2.5-pro',
    'Modelo no KV deve ter precedência sobre o env resetado'
  );
  assert.equal(
    resolved.publicAppTitle,
    'GitVisão Persistido no KV',
    'Título no KV deve ter precedência sobre o env resetado'
  );
  assert.equal(resolved.usingDefaultPassword, false);

  // Também verifica via chamada HTTP no Worker com as variáveis resetadas
  const statusRes = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/status', {
      headers: { 'X-Admin-Password': 'kv-super-secret-pass' }
    }),
    envAfterReset
  );
  assert.equal(statusRes.status, 200);
  const statusData = (await statusRes.json()) as {
    settings: { usingDefaultPassword: boolean; omnirouteModel: string };
  };
  assert.equal(statusData.settings.usingDefaultPassword, false);
  assert.equal(statusData.settings.omnirouteModel, 'gemini-2.5-pro');

  // B. Restauração de backup do KV para o D1 quando o D1 inicia vazio
  const backupKv = createInMemoryKV();
  const backedUpRepo: SerializedRepo = {
    id: 101,
    repo_key: 'acme/quantum-agent',
    full_name: 'acme/quantum-agent',
    owner: 'acme',
    name: 'quantum-agent',
    repo_url: 'https://github.com/acme/quantum-agent',
    description: 'Agente quântico recuperado do backup Cloudflare KV',
    stars: 8700,
    forks: 450,
    language: 'TypeScript',
    topics: ['quantum', 'agents', 'ai'],
    last_commit_at: '2026-10-24T18:00:00Z',
    category: 'Agentes & Automação IA',
    template_type: 'ai-agent-automation',
    hook_title: 'Como automatizar decisões quânticas na borda',
    intro_text: 'Framework de agentes quânticos integrado a MCP e Cloudflare',
    warning_note: 'Necessita Node 20+',
    features: ['Execução ultra-rápida', 'Failover distribuído', 'MCP nativo'],
    scenario_title: 'Automação Quântica em Produção',
    scenario_intro: 'Configure em menos de 2 minutos',
    scenario_prompt: 'Explique a arquitetura',
    scenario_steps: ['npm install quantum-agent', 'Configure as chaves', 'Execute o worker'],
    scenario_outro: 'Pronto para uso.',
    killer_title: 'O Diferencial Matador',
    killer_text: 'Zero latência e total soberania dos dados locais',
    summary_text: 'Resumo completo restaurado do Cloudflare KV.',
    punchline: 'Decisões quânticas em milissegundos.',
    whatsapp_text: 'WhatsApp post formatado restaurado do KV',
    created_at: '2026-10-24T10:00:00Z',
    updated_at: '2026-10-24T18:00:00Z'
  };

  // Simula repositório previamente salvo e espelhado no KV
  await backupKv.put('repo:acme/quantum-agent', JSON.stringify(backedUpRepo));
  await backupKv.put('repos:keys', JSON.stringify(['acme/quantum-agent']));

  // Cria um banco D1 novo e 100% vazio (sem nenhuma tabela ou linha)
  const freshEmptyD1 = createInMemoryD1();
  const freshEnv: Env = {
    DB: freshEmptyD1,
    GITVISAO_KV: backupKv,
    OMNI_KEYS: createInMemoryKV()
  };

  // ensureDatabaseInitialized detecta total === 0 e restaura do KV automaticamente
  await ensureDatabaseInitialized(freshEnv.DB, freshEnv);

  // Verifica que o repositório do KV foi restaurado no banco D1 com todos os dados íntegros
  const restoredRepo = await findRepoByKey(freshEmptyD1, 'acme/quantum-agent');
  assert.ok(restoredRepo, 'Repositório deve ter sido restaurado com sucesso do KV para o D1');
  assert.equal(restoredRepo.full_name, 'acme/quantum-agent');
  assert.equal(restoredRepo.stars, 8700);
  assert.equal(restoredRepo.category, 'Agentes & Automação IA');
  assert.equal(restoredRepo.template_type, 'ai-agent-automation');
  assert.equal(restoredRepo.summary_text, 'Resumo completo restaurado do Cloudflare KV.');
  assert.deepEqual(restoredRepo.topics, ['quantum', 'agents', 'ai']);
  assert.deepEqual(restoredRepo.features, ['Execução ultra-rápida', 'Failover distribuído', 'MCP nativo']);

  // Verifica listagem via API do Worker no D1 restaurado
  const apiListRes = await worker.fetch(
    new Request('https://gitvisao.local/api/repos'),
    freshEnv
  );
  assert.equal(apiListRes.status, 200);
  const apiListData = (await apiListRes.json()) as {
    ok: boolean;
    total: number;
    items: Array<{ repo_key: string }>;
  };
  assert.equal(apiListData.ok, true);
  assert.ok(
    apiListData.items.some((item) => item.repo_key === 'acme/quantum-agent'),
    'Item restaurado do KV deve aparecer na listagem da API'
  );
});

test('7. Paginação com cursor no D1 e API (/api/repos com limit, hasMore e nextCursor)', async () => {
  // 1. Testa encode/decode de cursor para 'recent', 'stars' e 'name'
  const recentCursor: RepoCursor = {
    sort: 'recent',
    id: 42,
    updatedAt: '2026-10-24T18:00:00.000Z'
  };
  const encodedRecent = encodeCursor(recentCursor);
  assert.equal(typeof encodedRecent, 'string');
  assert.ok(encodedRecent.length > 0);
  const decodedRecent = decodeCursor(encodedRecent);
  assert.deepEqual(decodedRecent, recentCursor);

  const starsCursor: RepoCursor = {
    sort: 'stars',
    id: 10,
    stars: 12500
  };
  const encodedStars = encodeCursor(starsCursor);
  assert.equal(typeof encodedStars, 'string');
  assert.ok(encodedStars.length > 0);
  const decodedStars = decodeCursor(encodedStars);
  assert.deepEqual(decodedStars, starsCursor);

  const nameCursor: RepoCursor = {
    sort: 'name',
    id: 5,
    name: 'browseros-ai/BrowserOS'
  };
  const encodedName = encodeCursor(nameCursor);
  assert.equal(typeof encodedName, 'string');
  assert.ok(encodedName.length > 0);
  const decodedName = decodeCursor(encodedName);
  assert.deepEqual(decodedName, nameCursor);

  // Casos extremos de cursor inválido
  assert.equal(decodeCursor(''), null);
  assert.equal(decodeCursor('invalid-cursor-base64!'), null);
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(undefined), null);

  // 2. Popula ou usa o mock com os repositórios de seed
  const env: Env = {
    DB: createInMemoryD1(),
    GITVISAO_KV: createInMemoryKV(),
    OMNI_KEYS: createInMemoryKV(),
    ADMIN_PASSWORD: 'admin'
  };

  await ensureDatabaseInitialized(env.DB, env);

  // 3. Faz chamada a worker.fetch(new Request('http://localhost/api/repos?limit=2'), env)
  const res1 = await worker.fetch(new Request('http://localhost/api/repos?limit=2'), env);
  assert.equal(res1.status, 200);

  const data1 = (await res1.json()) as {
    ok: boolean;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
    items: Array<{ id: number; repo_key: string }>;
  };

  assert.equal(data1.ok, true);
  assert.equal(data1.items.length, 2);
  assert.equal(data1.hasMore, true);
  assert.equal(typeof data1.nextCursor, 'string');
  assert.ok(data1.nextCursor!.length > 0);

  const firstPageIds = data1.items.map((i) => i.id);

  // 4. Faz a segunda chamada passando o cursor: worker.fetch(new Request('http://localhost/api/repos?limit=2&cursor=' + data.nextCursor), env)
  const res2 = await worker.fetch(
    new Request('http://localhost/api/repos?limit=2&cursor=' + data1.nextCursor),
    env
  );
  assert.equal(res2.status, 200);

  const data2 = (await res2.json()) as {
    ok: boolean;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
    items: Array<{ id: number; repo_key: string }>;
  };

  assert.equal(data2.ok, true);
  assert.equal(data2.items.length, 2);
  // Valida que os itens retornados são da página seguinte (IDs diferentes dos da primeira página)
  const secondPageIds = data2.items.map((i) => i.id);
  assert.equal(secondPageIds.length, 2);
  for (const id of secondPageIds) {
    assert.ok(
      !firstPageIds.includes(id),
      `ID ${id} da segunda página não deve estar na primeira página (${firstPageIds.join(', ')})`
    );
  }
});

test('8. GitHub Extractor: Heurísticas de Licença, Dificuldade de Instalação e Modelo de Custo', async () => {
  // --- 1. Licenças ---
  // API direta
  const mitApi = classifyLicense({ spdx_id: 'MIT', key: 'mit' });
  assert.equal(mitApi.licenseType, 'permissive');
  assert.equal(mitApi.licenseBadge, '🟢 MIT (Open Source Permissivo)');

  const apacheApi = classifyLicense({ spdx_id: 'Apache-2.0', key: 'apache-2.0' });
  assert.equal(apacheApi.licenseType, 'permissive');
  assert.equal(apacheApi.licenseBadge, '🟢 Apache-2.0 (Open Source Permissivo)');

  const agplApi = classifyLicense({ spdx_id: 'AGPL-3.0', key: 'agpl-3.0' });
  assert.equal(agplApi.licenseType, 'copyleft');
  assert.equal(agplApi.licenseBadge, '🟡 Copyleft (AGPL/GPL)');

  // Fallback em texto (LICENSE / README)
  const mitFallback = classifyLicense(null, 'Licensed under the MIT License.');
  assert.equal(mitFallback.licenseType, 'permissive');
  assert.equal(mitFallback.licenseSpdx, 'MIT');
  assert.equal(mitFallback.licenseBadge, '🟢 MIT (Open Source Permissivo)');

  const apacheFallback = classifyLicense({ spdx_id: 'NOASSERTION', key: 'other' }, 'Apache License, Version 2.0');
  assert.equal(apacheFallback.licenseType, 'permissive');
  assert.equal(apacheFallback.licenseSpdx, 'Apache-2.0');

  const fairFallback = classifyLicense(null, 'Sustainable Use License');
  assert.equal(fairFallback.licenseType, 'source-available');
  assert.equal(fairFallback.licenseBadge, '🔴 Source-Available (Não-OSI)');

  const unlic = classifyLicense(null, '');
  assert.equal(unlic.licenseType, 'unlicensed');
  assert.equal(unlic.licenseBadge, '⚪ Sem Licença (All Rights Reserved)');

  // --- 2. Dificuldade de Instalação ---
  // Nível 1 - Fácil / Plug & Play
  const dep1Click = classifyDeployDifficulty(['wrangler.toml', 'src/index.ts']);
  assert.equal(dep1Click.deployDifficulty, 'easy');
  assert.equal(dep1Click.deployBadge, '🟢 Fácil (Plug & Play / 1-Click)');
  assert.equal(dep1Click.deployMethod, '1-Click Deploy / Binário');

  const depExtension = classifyDeployDifficulty(['manifest.json']);
  assert.equal(depExtension.deployDifficulty, 'easy');

  const depPip = classifyDeployDifficulty(['setup.py'], 'Install with pip install mycli');
  assert.equal(depPip.deployDifficulty, 'easy');
  assert.equal(depPip.deployBadge, '🟢 Fácil (Plug & Play / 1-Click)');

  // Nível 2 - Médio
  const depDocker = classifyDeployDifficulty(['docker-compose.yml', '.env.example']);
  assert.equal(depDocker.deployDifficulty, 'medium');
  assert.equal(depDocker.deployBadge, '🟡 Médio (Docker / Configuração .env)');
  assert.equal(depDocker.deployMethod, 'Docker Compose / Local');

  // Nível 3 - Avançado
  const depK8s = classifyDeployDifficulty(['k8s/service.yaml', 'Chart.yaml']);
  assert.equal(depK8s.deployDifficulty, 'advanced');
  assert.equal(depK8s.deployBadge, '🔴 Avançado (K8s / Compilação / GPU)');
  assert.equal(depK8s.deployMethod, 'Cluster / Compilação Nativa');

  const depCuda = classifyDeployDifficulty(['train.py'], 'Requires NVIDIA GPU and CUDA');
  assert.equal(depCuda.deployDifficulty, 'advanced');

  // --- 3. Sinais de Custo & Chaves ---
  // 100% Grátis & Local
  const costLocal = classifyCostModel('Run completely offline on localhost with ollama and sqlite');
  assert.equal(costLocal.costModel, 'free-local');
  assert.equal(costLocal.isFree, true);
  assert.equal(costLocal.costBadge, '🟢 100% Grátis & Local');
  assert.equal(costLocal.costNotes, 'Roda offline no seu computador sem chaves de API nem assinaturas.');

  // BYOK
  const costByok = classifyCostModel('Configure OPENAI_API_KEY and ANTHROPIC_API_KEY');
  assert.equal(costByok.costModel, 'byok');
  assert.equal(costByok.isFree, true);
  assert.equal(costByok.costBadge, '🟡 Grátis (BYOK Chaves de IA)');
  assert.equal(costByok.costNotes, 'Código grátis; consome créditos de API de IA contratados separadamente.');

  // Freemium / Open Core
  const costFreemium = classifyCostModel('Open core edition. Enterprise edition and cloud pricing available.');
  assert.equal(costFreemium.costModel, 'freemium');
  assert.equal(costFreemium.isFree, false);
  assert.equal(costFreemium.costBadge, '🟠 Freemium / Open Core');
  assert.equal(costFreemium.costNotes, 'Uso básico/pessoal grátis; recursos corporativos exigem plano pago.');

  // Infraestrutura Paga
  const costPaid = classifyCostModel('Requires Meta WhatsApp Cloud API credentials');
  assert.equal(costPaid.costModel, 'paid-external');
  assert.equal(costPaid.isFree, false);
  assert.equal(costPaid.costBadge, '🔴 Custos Externos Obrigatórios');
  assert.equal(costPaid.costNotes, 'Exige serviços de nuvem ou APIs pagas de terceiros.');
});

test('9. QA & Batch Reclassification: Validação da Ficha Técnica no WhatsApp, filtros D1 e script reclassify_repos', async () => {
  // 1. Validação da Ficha Técnica completa no buildWhatsAppText
  const sampleMeta: GitHubRepoMetadata = {
    repoKey: 'sample/agent-craft',
    fullName: 'sample/agent-craft',
    owner: 'sample',
    name: 'agent-craft',
    repoUrl: 'https://github.com/sample/agent-craft',
    description: 'Framework para agentes autônomos locais',
    stars: 5400,
    forks: 320,
    language: 'Python',
    topics: ['ai-agent', 'mcp', 'ollama'],
    lastCommitAt: '2026-10-25T12:00:00Z',
    readmeExcerpt: 'Run with ollama offline',
    licenseSpdx: 'MIT',
    licenseType: 'permissive',
    licenseBadge: '🟢 MIT (Open Source Permissivo)',
    isFree: true,
    costModel: 'free-local',
    costBadge: '🟢 100% Grátis & Local',
    costNotes: 'Roda offline no seu computador sem chaves de API nem assinaturas.',
    deployDifficulty: 'easy',
    deployBadge: '🟢 Fácil (Plug & Play / 1-Click)',
    deployMethod: '1-Click Deploy / Binário'
  };

  const sampleSummary = generateFallbackSummary(sampleMeta, 'ai-agent-automation');
  const renderedText = buildWhatsAppText(sampleMeta, sampleSummary);

  // Verificações da Ficha Técnica
  assert.ok(renderedText.includes('📋 FICHA TÉCNICA'), 'Deve conter o cabeçalho FICHA TÉCNICA');
  assert.ok(renderedText.includes('⚖️ Licença: 🟢 MIT (Open Source Permissivo)'), 'Deve exibir a licença formatada com badge');
  assert.ok(renderedText.includes('💰 Custo Real: 🟢 100% Grátis & Local'), 'Deve exibir o custo real');
  assert.ok(renderedText.includes('⚙️ Instalação: 🟢 Fácil (Plug & Play / 1-Click)'), 'Deve exibir a facilidade de instalação');
  assert.ok(renderedText.includes('🏷️ Categoria: Agentes & Automação IA'), 'Deve exibir a categoria correta');
  assert.ok(renderedText.includes('🔗 https://github.com/sample/agent-craft'), 'Deve conter link do repo');
  assert.ok(renderedText.includes('⭐ 5,4 mil estrelas no GitHub'), 'Deve formatar estrelas em milhares');

  // 2. Validação da listagem no D1
  const db = createInMemoryD1();
  await ensureDatabaseInitialized(db);

  const initialList = await listRepositories(db, { limit: 10 });
  assert.ok(initialList.total >= 5, 'Deve listar ao menos 5 repositórios do seed');
  assert.ok(initialList.items.length >= 5, 'Deve retornar os repositórios');

  // 3. Validação do parse de argumentos do script reclassify_repos
  const cli1 = parseCliArgs(['--dry-run', '--limit=50', '--target=http://localhost:8787', '--password=minhasenha']);
  assert.equal(cli1.dryRun, true);
  assert.equal(cli1.limit, 50);
  assert.equal(cli1.targetUrl, 'http://localhost:8787');
  assert.equal(cli1.adminPassword, 'minhasenha');

  const cliDefault = parseCliArgs([]);
  assert.equal(cliDefault.dryRun, false);
  assert.equal(cliDefault.targetUrl, 'http://localhost:8787');
  assert.equal(cliDefault.adminPassword, '');

  // 4. Validação de checkpoint do reclassify_repos (loadProgress / saveProgress)
  const testCheckpointFile = path.join(__dirname, 'test_reclassify_progress.json');
  try {
    const freshStore = loadProgress(testCheckpointFile, 'https://test.local');
    assert.deepEqual(freshStore.records, {});
    freshStore.records['owner/test-repo'] = {
      status: 'success',
      repo: 'owner/test-repo',
      licenseType: 'permissive',
      updatedAt: new Date().toISOString()
    };
    saveProgress(testCheckpointFile, freshStore);

    const reloadedStore = loadProgress(testCheckpointFile, 'https://test.local');
    assert.equal(reloadedStore.records['owner/test-repo']?.status, 'success');
  } finally {
    if (fs.existsSync(testCheckpointFile)) {
      fs.unlinkSync(testCheckpointFile);
    }
  }
});

test('10. Única porta de entrada: POST /api/repos só com senha de admin (X-API-Key aceito); rotas antigas de webhook foram removidas', async () => {
  const env: Env = {
    DB: createInMemoryD1(),
    GITVISAO_KV: createInMemoryKV(),
    OMNI_KEYS: createInMemoryKV(),
    ADMIN_PASSWORD: 'senha-bot-secreta',
    PUBLIC_APP_TITLE: 'GitVisão Bot API'
  };

  const msgFromChat = 'Galera, recomendo muito dar uma olhada neste projeto: https://github.com/browseros-ai/BrowserOS - muito rápido!';
  const parsedFromMsg = parseGitHubRepoInput(msgFromChat);
  assert.ok(parsedFromMsg);
  assert.equal(parsedFromMsg.fullName, 'browseros-ai/BrowserOS');
  assert.equal(parsedFromMsg.repoKey, 'browseros-ai/browseros');

  for (const route of ['/api/webhook', '/api/ingest', '/api/telegram-webhook']) {
    const res = await worker.fetch(
      new Request('https://gitvisao.local' + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msgFromChat })
      }),
      env
    );
    assert.equal(res.status, 404, route + ' deve responder 404');
  }

  const noPass = await worker.fetch(
    new Request('https://gitvisao.local/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: msgFromChat })
    }),
    env
  );
  assert.equal(noPass.status, 401);

  const apiKeyRes = await worker.fetch(
    new Request('https://gitvisao.local/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'senha-bot-secreta' },
      body: JSON.stringify({ repo: msgFromChat })
    }),
    env
  );
  assert.equal(apiKeyRes.status, 200);
  const apiKeyData = (await apiKeyRes.json()) as { ok: boolean; cached: boolean };
  assert.equal(apiKeyData.ok, true);
  assert.equal(apiKeyData.cached, true);
});

test('11. Consulta pública de repo inédito vira pedido para o admin (sem gerar resumo e sem sobrescrever o que já existe)', async () => {
  const { db, raw } = createSqliteD1();
  insertCatalogRepo(raw, 'acme/ja-no-catalogo');
  const env: Env = { DB: db, ADMIN_PASSWORD: 'senha-fila-teste' };
  const check = (repo: string) =>
    worker.fetch(new Request('https://gitvisao.local/api/check?repo=' + encodeURIComponent(repo)), env);

  const known = (await (await check('acme/ja-no-catalogo')).json()) as { exists: boolean };
  assert.equal(known.exists, true);
  const unknown = (await (await check('https://github.com/Acme/Inedito')).json()) as { exists: boolean; repo: unknown };
  assert.equal(unknown.exists, false);
  assert.equal(unknown.repo == null, true);
  await check('acme/inedito'); // repetir não duplica

  const list = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/ingest/items?status=requested', {
      headers: { 'X-Admin-Password': 'senha-fila-teste' }
    }),
    env
  );
  assert.equal(list.status, 200);
  const data = (await list.json()) as { items: Array<{ repo_key: string; status: string; source: string }> };
  assert.deepEqual(
    data.items.map((i) => [i.repo_key, i.status, i.source]),
    [['acme/inedito', 'requested', 'visitante']]
  );

  // Excluir: remove do catálogo e marca como ignorado (a raspagem não reinclui).
  const del = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/ingest/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': 'senha-fila-teste' },
      body: JSON.stringify({ repoKey: 'acme/ja-no-catalogo', action: 'delete' })
    }),
    env
  );
  assert.equal(del.status, 200);
  const afterDel = (await (await check('acme/ja-no-catalogo')).json()) as { exists: boolean };
  assert.equal(afterDel.exists, false);
  const ignored = await worker.fetch(
    new Request('https://gitvisao.local/api/admin/ingest/items?status=ignored', {
      headers: { 'X-Admin-Password': 'senha-fila-teste' }
    }),
    env
  );
  const ignoredData = (await ignored.json()) as { items: Array<{ repo_key: string; reason: string }> };
  assert.deepEqual(
    ignoredData.items.map((i) => [i.repo_key, i.reason]),
    [['acme/ja-no-catalogo', 'Excluído pelo admin.']]
  );

  const anon = await worker.fetch(new Request('https://gitvisao.local/api/admin/ingest/items'), env);
  assert.equal(anon.status, 401);
});

test('12. Rota /admin e Verificação de Senha (/api/auth/verify)', async () => {
  const env: Env = {
    DB: createInMemoryD1(),
    GITVISAO_KV: createInMemoryKV(),
    OMNI_KEYS: createInMemoryKV(),
    ADMIN_PASSWORD: 'admin-password-teste',
    PUBLIC_APP_TITLE: 'GitVisão Admin Test'
  };

  // 1. GET /admin deve retornar HTML SPA
  const adminPageRes = await worker.fetch(
    new Request('https://gitvisao.local/admin'),
    env
  );
  assert.equal(adminPageRes.status, 200);
  assert.ok((adminPageRes.headers.get('content-type') || '').includes('text/html'));
  const html = await adminPageRes.text();
  assert.ok(html.includes('login-form'));
  assert.ok(html.includes('tab-scrape'));
  assert.ok(!html.includes('check-not-found-panel'));

  const homeRes = await worker.fetch(new Request('https://gitvisao.local/'), env);
  assert.equal(homeRes.status, 200);
  const home = await homeRes.text();
  assert.ok(home.includes('check-panel'));
  for (const adminOnly of ['admin-password-input', 'settings-modal', 'generate-submit-btn', 'Área Administrativa']) {
    assert.ok(!home.includes(adminOnly), 'home pública não deve conter ' + adminOnly);
  }

  // 2. POST /api/auth/verify com senha incorreta
  const failRes = await worker.fetch(
    new Request('https://gitvisao.local/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'senha-errada' })
    }),
    env
  );
  assert.equal(failRes.status, 401);
  const failData = (await failRes.json()) as { ok: boolean; error: string };
  assert.equal(failData.ok, false);

  // 3. POST /api/auth/verify com senha correta
  const okRes = await worker.fetch(
    new Request('https://gitvisao.local/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin-password-teste' })
    }),
    env
  );
  assert.equal(okRes.status, 200);
  const okData = (await okRes.json()) as { ok: boolean; message: string };
  assert.equal(okData.ok, true);
});

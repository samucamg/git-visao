import { detectTemplateType, detectCategory } from './templates.ts';
import { generateFallbackSummary } from './ai.ts';
import { isHarmfulRepository } from './github.ts';
import { SEED_REPOSITORIES } from './seed.ts';
import type {
  Env,
  GeneratedVisaoSummary,
  GitHubRepoMetadata,
  RepoRecord,
  RuntimeSettings
} from './types.ts';

export interface RepoCursor {
  sort: 'recent' | 'stars' | 'name';
  id: number;
  updatedAt?: string;
  stars?: number;
  name?: string;
}

export function encodeCursor(cursor: RepoCursor): string {
  try {
    const json = JSON.stringify(cursor);
    if (typeof btoa === 'function') {
      try {
        return btoa(unescape(encodeURIComponent(json)));
      } catch {
        return btoa(json);
      }
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(json, 'utf-8').toString('base64');
    }
    return '';
  } catch {
    return '';
  }
}

export function decodeCursor(raw: string | null | undefined): RepoCursor | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    let json = '';
    if (typeof atob === 'function') {
      const decoded = atob(trimmed);
      try {
        json = decodeURIComponent(escape(decoded));
      } catch {
        json = decoded;
      }
    } else if (typeof Buffer !== 'undefined') {
      json = Buffer.from(trimmed, 'base64').toString('utf-8');
    } else {
      return null;
    }

    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'number' &&
      (parsed.sort === 'recent' || parsed.sort === 'stars' || parsed.sort === 'name')
    ) {
      return parsed as RepoCursor;
    }
  } catch {
    return null;
  }

  return null;
}

export interface RepoSearchFilters {
  q?: string;
  category?: string;
  templateType?: string;
  sort?: 'recent' | 'stars' | 'name';
  limit?: number;
  cursor?: string;
}

export interface SerializedRepo
  extends Omit<RepoRecord, 'topics_json' | 'features_json' | 'scenario_steps_json'> {
  topics: string[];
  features: string[];
  scenario_steps: string[];
  fullName?: string;
  updatedAt?: string;
}

export function getKV(env?: Env): KVNamespace | null {
  if (!env) return null;
  return env.GITVISAO_KV || env.OMNI_KEYS || null;
}

interface SettingsCacheEntry {
  settings: RuntimeSettings;
  expiresAt: number;
}

let settingsCache = new WeakMap<object, SettingsCacheEntry>();
const SETTINGS_CACHE_TTL_MS = 5000;

export function invalidateSettingsCache(): void {
  settingsCache = new WeakMap<object, SettingsCacheEntry>();
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}

export function serializeRepoRecord(row: RepoRecord): SerializedRepo {
  const { topics_json, features_json, scenario_steps_json, ...rest } = row;
  return {
    ...rest,
    fullName: row.full_name,
    updatedAt: row.updated_at,
    stars: Number(row.stars ?? 0),
    forks: Number(row.forks ?? 0),
    topics: safeParseStringArray(topics_json),
    features: safeParseStringArray(features_json),
    scenario_steps: safeParseStringArray(scenario_steps_json)
  };
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS repositories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_key TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    description TEXT DEFAULT '',
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    language TEXT DEFAULT '',
    topics_json TEXT DEFAULT '[]',
    last_commit_at TEXT DEFAULT '',
    category TEXT NOT NULL,
    template_type TEXT NOT NULL,
    hook_title TEXT NOT NULL,
    intro_text TEXT NOT NULL,
    warning_note TEXT DEFAULT '',
    features_json TEXT NOT NULL,
    scenario_title TEXT NOT NULL,
    scenario_intro TEXT NOT NULL,
    scenario_prompt TEXT NOT NULL,
    scenario_steps_json TEXT NOT NULL,
    scenario_outro TEXT DEFAULT '',
    killer_title TEXT NOT NULL,
    killer_text TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    punchline TEXT NOT NULL,
    whatsapp_text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
)`;

const CREATE_SETTINGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
)`;

const CREATE_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_repositories_repo_key ON repositories(repo_key)',
  'CREATE INDEX IF NOT EXISTS idx_repositories_category ON repositories(category)',
  'CREATE INDEX IF NOT EXISTS idx_repositories_template_type ON repositories(template_type)',
  'CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC)',
  'CREATE INDEX IF NOT EXISTS idx_repositories_created_at ON repositories(created_at DESC)'
];

export async function ensureDatabaseInitialized(db: D1Database, env?: Env): Promise<void> {
  await db.prepare(CREATE_TABLE_SQL).run();
  await db.prepare(CREATE_SETTINGS_TABLE_SQL).run();
  for (const indexSql of CREATE_INDEXES_SQL) {
    await db.prepare(indexSql).run();
  }

  // Auto-healing de dados v2: exclusão de repos maliciosos e regeneração dinâmica de copies
  await runDataAutoHealing(db, env);

  const countRow = await db
    .prepare('SELECT COUNT(*) as total FROM repositories')
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  if (total === 0) {
    const kv = getKV(env);
    let restoredCount = 0;

    if (kv) {
      try {
        let repoKeys: string[] = [];
        const rawKeys = await kv.get('repos:keys');
        if (rawKeys) {
          try {
            const parsed = JSON.parse(rawKeys);
            if (Array.isArray(parsed)) {
              repoKeys = parsed.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
            }
          } catch {
            repoKeys = [];
          }
        }

        if (repoKeys.length === 0 && typeof kv.list === 'function') {
          try {
            const listResult = await kv.list({ prefix: 'repo:' });
            if (listResult && Array.isArray(listResult.keys)) {
              repoKeys = listResult.keys
                .map((k) => k.name.replace(/^repo:/, '').trim().toLowerCase())
                .filter(Boolean);
            }
          } catch (e) {
            console.warn('Erro ao listar chaves repo: no KV:', e);
          }
        }

        if (repoKeys.length > 0) {
          const insertSql = `
            INSERT OR IGNORE INTO repositories (
              repo_key, full_name, owner, name, repo_url, description,
              stars, forks, language, topics_json, last_commit_at,
              category, template_type, hook_title, intro_text, warning_note,
              features_json, scenario_title, scenario_intro, scenario_prompt,
              scenario_steps_json, scenario_outro, killer_title, killer_text,
              summary_text, punchline, whatsapp_text, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          for (const key of repoKeys) {
            try {
              const rawRepo = await kv.get(`repo:${key}`);
              if (rawRepo) {
                const item = JSON.parse(rawRepo);
                if (item && item.repo_key) {
                  const topicsJson = Array.isArray(item.topics)
                    ? JSON.stringify(item.topics)
                    : typeof item.topics_json === 'string'
                      ? item.topics_json
                      : '[]';
                  const featuresJson = Array.isArray(item.features)
                    ? JSON.stringify(item.features)
                    : typeof item.features_json === 'string'
                      ? item.features_json
                      : '[]';
                  const scenarioStepsJson = Array.isArray(item.scenario_steps)
                    ? JSON.stringify(item.scenario_steps)
                    : typeof item.scenario_steps_json === 'string'
                      ? item.scenario_steps_json
                      : '[]';

                  await db
                    .prepare(insertSql)
                    .bind(
                      item.repo_key.trim().toLowerCase(),
                      item.full_name,
                      item.owner,
                      item.name,
                      item.repo_url,
                      item.description || '',
                      Number(item.stars ?? 0),
                      Number(item.forks ?? 0),
                      item.language || '',
                      topicsJson,
                      item.last_commit_at || '',
                      item.category,
                      item.template_type,
                      item.hook_title,
                      item.intro_text,
                      item.warning_note || '',
                      featuresJson,
                      item.scenario_title,
                      item.scenario_intro,
                      item.scenario_prompt,
                      scenarioStepsJson,
                      item.scenario_outro || '',
                      item.killer_title,
                      item.killer_text,
                      item.summary_text,
                      item.punchline,
                      item.whatsapp_text,
                      item.created_at || new Date().toISOString(),
                      item.updated_at || new Date().toISOString()
                    )
                    .run();
                  restoredCount++;
                }
              }
            } catch (e) {
              console.warn(`Erro ao restaurar repositório ${key} do KV:`, e);
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao verificar repositórios no KV durante inicialização:', err);
      }
    }

    if (restoredCount === 0 && SEED_REPOSITORIES.length > 0) {
      const insertSql = `
        INSERT OR IGNORE INTO repositories (
          repo_key, full_name, owner, name, repo_url, description,
          stars, forks, language, topics_json, last_commit_at,
          category, template_type, hook_title, intro_text, warning_note,
          features_json, scenario_title, scenario_intro, scenario_prompt,
          scenario_steps_json, scenario_outro, killer_title, killer_text,
          summary_text, punchline, whatsapp_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const seedKeys: string[] = [];

      for (const item of SEED_REPOSITORIES) {
        const repoKey = item.repo_key.trim().toLowerCase();
        seedKeys.push(repoKey);
        await db
          .prepare(insertSql)
          .bind(
            repoKey,
            item.full_name,
            item.owner,
            item.name,
            item.repo_url,
            item.description || '',
            Number(item.stars ?? 0),
            Number(item.forks ?? 0),
            item.language || '',
            item.topics_json || '[]',
            item.last_commit_at || '',
            item.category,
            item.template_type,
            item.hook_title,
            item.intro_text,
            item.warning_note || '',
            item.features_json || '[]',
            item.scenario_title,
            item.scenario_intro,
            item.scenario_prompt,
            item.scenario_steps_json || '[]',
            item.scenario_outro || '',
            item.killer_title,
            item.killer_text,
            item.summary_text,
            item.punchline,
            item.whatsapp_text
          )
          .run();
      }

      if (kv) {
        try {
          for (const item of SEED_REPOSITORIES) {
            const repoKey = item.repo_key.trim().toLowerCase();
            const saved = await findRepoByKey(db, repoKey);
            if (saved) {
              await kv.put(`repo:${repoKey}`, JSON.stringify(saved));
            }
          }
          await kv.put('repos:keys', JSON.stringify(seedKeys));
        } catch (e) {
          console.warn('Erro ao salvar seeds no KV:', e);
        }
      }
    }
  }
}

export async function findRepoByKey(
  db: D1Database,
  repoKey: string,
  env?: Env
): Promise<SerializedRepo | null> {
  const normalizedKey = repoKey.trim().toLowerCase();
  if (!normalizedKey) return null;

  try {
    const row = await db
      .prepare('SELECT * FROM repositories WHERE repo_key = ? LIMIT 1')
      .bind(normalizedKey)
      .first<RepoRecord>();

    if (row) return serializeRepoRecord(row);
  } catch (err) {
    console.warn(`Erro ao buscar repo no D1 (${normalizedKey}):`, err);
  }

  const kv = getKV(env);
  if (kv) {
    try {
      const raw = await kv.get(`repo:${normalizedKey}`);
      if (raw) {
        const item = JSON.parse(raw);
        if (item && item.repo_key) {
          return item as SerializedRepo;
        }
      }
    } catch {
      // ignore KV error
    }
  }

  return null;
}

export async function listRepositories(
  db: D1Database,
  filters: RepoSearchFilters = {}
): Promise<{
  items: SerializedRepo[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
  byCategory: Record<string, number>;
  byTemplate: Record<string, number>;
}> {
  const limit = Math.min(Math.max(Number(filters.limit) || 30, 1), 100);

  const baseWhereClauses: string[] = [];
  const baseParams: unknown[] = [];

  if (filters.q && filters.q.trim()) {
    const q = `%${filters.q.trim().toLowerCase()}%`;
    baseWhereClauses.push(
      `(
        LOWER(full_name) LIKE ? OR
        LOWER(language) LIKE ? OR
        LOWER(description) LIKE ? OR
        LOWER(hook_title) LIKE ? OR
        LOWER(intro_text) LIKE ? OR
        LOWER(features_json) LIKE ? OR
        LOWER(summary_text) LIKE ? OR
        LOWER(topics_json) LIKE ?
      )`
    );
    baseParams.push(q, q, q, q, q, q, q, q);
  }

  if (
    filters.category &&
    filters.category.trim() &&
    filters.category !== 'all' &&
    filters.category !== 'Todas'
  ) {
    baseWhereClauses.push('category = ?');
    baseParams.push(filters.category.trim());
  }

  if (
    filters.templateType &&
    filters.templateType.trim() &&
    filters.templateType !== 'all' &&
    filters.templateType !== 'Todos'
  ) {
    baseWhereClauses.push('template_type = ?');
    baseParams.push(filters.templateType.trim());
  }

  const whereClauses: string[] = [...baseWhereClauses];
  const params: unknown[] = [...baseParams];

  const sort =
    filters.sort === 'stars' || filters.sort === 'name' || filters.sort === 'recent'
      ? filters.sort
      : 'recent';

  const cursor = decodeCursor(filters.cursor);

  if (cursor) {
    if (sort === 'stars' && cursor.stars !== undefined) {
      whereClauses.push('(stars < ? OR (stars = ? AND id < ?))');
      params.push(cursor.stars, cursor.stars, cursor.id);
    } else if (sort === 'name' && cursor.name !== undefined) {
      whereClauses.push('(full_name > ? OR (full_name = ? AND id > ?))');
      params.push(cursor.name, cursor.name, cursor.id);
    } else {
      if (cursor.updatedAt) {
        whereClauses.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
        params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
      } else {
        whereClauses.push('id < ?');
        params.push(cursor.id);
      }
    }
  }

  let orderBySql = 'ORDER BY updated_at DESC, id DESC';
  if (sort === 'stars') {
    orderBySql = 'ORDER BY stars DESC, id DESC';
  } else if (sort === 'name') {
    orderBySql = 'ORDER BY full_name ASC, id ASC';
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const fetchLimit = limit + 1;
  const querySql = `SELECT * FROM repositories ${whereSql} ${orderBySql} LIMIT ?`;

  const result = await db
    .prepare(querySql)
    .bind(...params, fetchLimit)
    .all<RepoRecord>();

  const rawRows = result?.results ?? [];
  const hasMore = rawRows.length > limit;
  const items = (hasMore ? rawRows.slice(0, limit) : rawRows).map(serializeRepoRecord);

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    if (sort === 'stars') {
      nextCursor = encodeCursor({
        sort: 'stars',
        id: last.id,
        stars: last.stars
      });
    } else if (sort === 'name') {
      nextCursor = encodeCursor({
        sort: 'name',
        id: last.id,
        name: last.fullName || last.full_name
      });
    } else {
      nextCursor = encodeCursor({
        sort: 'recent',
        id: last.id,
        updatedAt: last.updatedAt || last.updated_at
      });
    }
  }

  const allStatsResult = await db
    .prepare('SELECT category, template_type FROM repositories')
    .all<{ category: string; template_type: string }>();

  const byCategory: Record<string, number> = {};
  const byTemplate: Record<string, number> = {};

  for (const r of allStatsResult?.results ?? []) {
    if (r.category) {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    }
    if (r.template_type) {
      byTemplate[r.template_type] = (byTemplate[r.template_type] || 0) + 1;
    }
  }

  const globalTotal = (allStatsResult?.results ?? []).length;
  let total = globalTotal;

  if (baseWhereClauses.length > 0) {
    const baseWhereSql = `WHERE ${baseWhereClauses.join(' AND ')}`;
    const countSql = `SELECT COUNT(*) as count FROM repositories ${baseWhereSql}`;
    const countResult = await db
      .prepare(countSql)
      .bind(...baseParams)
      .first<{ count: number }>();
    total = Number(countResult?.count ?? 0);
  }

  return {
    items,
    total,
    hasMore,
    nextCursor,
    limit,
    byCategory,
    byTemplate
  };
}

export async function upsertRepository(
  db: D1Database,
  meta: GitHubRepoMetadata,
  summary: GeneratedVisaoSummary,
  env?: Env
): Promise<SerializedRepo> {
  const repoKey = (meta.repoKey || meta.fullName).trim().toLowerCase();
  const topicsJson = JSON.stringify(meta.topics ?? []);
  const featuresJson = JSON.stringify(summary.features ?? []);
  const scenarioStepsJson = JSON.stringify(summary.scenarioSteps ?? []);

  const sql = `
    INSERT INTO repositories (
      repo_key, full_name, owner, name, repo_url, description,
      stars, forks, language, topics_json, last_commit_at,
      category, template_type, hook_title, intro_text, warning_note,
      features_json, scenario_title, scenario_intro, scenario_prompt,
      scenario_steps_json, scenario_outro, killer_title, killer_text,
      summary_text, punchline, whatsapp_text, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(repo_key) DO UPDATE SET
      full_name = excluded.full_name,
      owner = excluded.owner,
      name = excluded.name,
      repo_url = excluded.repo_url,
      description = excluded.description,
      stars = excluded.stars,
      forks = excluded.forks,
      language = excluded.language,
      topics_json = excluded.topics_json,
      last_commit_at = excluded.last_commit_at,
      category = excluded.category,
      template_type = excluded.template_type,
      hook_title = excluded.hook_title,
      intro_text = excluded.intro_text,
      warning_note = excluded.warning_note,
      features_json = excluded.features_json,
      scenario_title = excluded.scenario_title,
      scenario_intro = excluded.scenario_intro,
      scenario_prompt = excluded.scenario_prompt,
      scenario_steps_json = excluded.scenario_steps_json,
      scenario_outro = excluded.scenario_outro,
      killer_title = excluded.killer_title,
      killer_text = excluded.killer_text,
      summary_text = excluded.summary_text,
      punchline = excluded.punchline,
      whatsapp_text = excluded.whatsapp_text,
      updated_at = datetime('now')
  `;

  await db
    .prepare(sql)
    .bind(
      repoKey,
      meta.fullName,
      meta.owner,
      meta.name,
      meta.repoUrl,
      meta.description || '',
      Number(meta.stars ?? 0),
      Number(meta.forks ?? 0),
      meta.language || '',
      topicsJson,
      meta.lastCommitAt || '',
      summary.category,
      summary.templateType,
      summary.hookTitle,
      summary.introText,
      summary.warningNote || '',
      featuresJson,
      summary.scenarioTitle,
      summary.scenarioIntro,
      summary.scenarioPrompt,
      scenarioStepsJson,
      summary.scenarioOutro || '',
      summary.killerTitle,
      summary.killerText,
      summary.summaryText,
      summary.punchline,
      summary.whatsappText
    )
    .run();

  const saved = await findRepoByKey(db, repoKey);
  if (!saved) {
    throw new Error(`Falha ao recuperar repositório salvo: ${repoKey}`);
  }

  const kv = getKV(env);
  if (kv) {
    try {
      await kv.put(`repo:${repoKey}`, JSON.stringify(saved));

      let keys: string[] = [];
      const rawKeys = await kv.get('repos:keys');
      if (rawKeys) {
        try {
          const parsed = JSON.parse(rawKeys);
          if (Array.isArray(parsed)) {
            keys = parsed.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
          }
        } catch {
          keys = [];
        }
      }
      if (!keys.includes(repoKey)) {
        keys.push(repoKey);
        await kv.put('repos:keys', JSON.stringify(keys));
      }
    } catch (err) {
      console.warn(`Erro ao salvar backup no KV para ${repoKey}:`, err);
    }
  }

  return saved;
}

export async function deleteRepository(
  db: D1Database,
  repoKey: string,
  env?: Env
): Promise<boolean> {
  const normalizedKey = repoKey.trim().toLowerCase();
  if (!normalizedKey) return false;

  const existing = await findRepoByKey(db, normalizedKey);
  const kv = getKV(env);

  let existsInKv = false;
  if (kv) {
    try {
      const kvData = await kv.get(`repo:${normalizedKey}`);
      if (kvData) existsInKv = true;
    } catch {
      // ignore
    }
  }

  if (!existing && !existsInKv) {
    return false;
  }

  if (existing) {
    await db.prepare('DELETE FROM repositories WHERE repo_key = ?').bind(normalizedKey).run();
  }

  if (kv) {
    try {
      await kv.delete(`repo:${normalizedKey}`);
      const rawKeys = await kv.get('repos:keys');
      if (rawKeys) {
        try {
          const keys = JSON.parse(rawKeys);
          if (Array.isArray(keys)) {
            const filtered = keys.filter(
              (k: string) => String(k).trim().toLowerCase() !== normalizedKey
            );
            await kv.put('repos:keys', JSON.stringify(filtered));
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn(`Erro ao deletar ${normalizedKey} do KV:`, err);
    }
  }

  return true;
}

export interface RuntimeSettingsUpdates {
  adminPassword?: string;
  omnirouteBaseUrl?: string;
  omnirouteApiKey?: string;
  omnirouteModel?: string;
  githubToken?: string;
  publicAppTitle?: string;
}

const SETTING_KEY_MAP: Record<keyof RuntimeSettingsUpdates, string> = {
  adminPassword: 'admin_password',
  omnirouteBaseUrl: 'omniroute_base_url',
  omnirouteApiKey: 'omniroute_api_key',
  omnirouteModel: 'omniroute_model',
  githubToken: 'github_token',
  publicAppTitle: 'public_app_title'
};

export async function saveRuntimeSettings(
  db: D1Database,
  updates: Partial<RuntimeSettingsUpdates>,
  env?: Env
): Promise<void> {
  await db.prepare(CREATE_SETTINGS_TABLE_SQL).run();

  const upsertSql = `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `;

  for (const [propKey, dbKey] of Object.entries(SETTING_KEY_MAP) as Array<
    [keyof RuntimeSettingsUpdates, string]
  >) {
    const val = updates[propKey];
    if (val !== undefined) {
      await db.prepare(upsertSql).bind(dbKey, String(val)).run();
    }
  }

  const kv = getKV(env);
  if (kv) {
    try {
      let currentKvSettings: Record<string, string> = {};
      const raw = await kv.get('admin:settings');
      if (raw) {
        try {
          currentKvSettings = JSON.parse(raw);
        } catch {
          currentKvSettings = {};
        }
      }

      for (const [propKey, val] of Object.entries(updates) as Array<
        [keyof RuntimeSettingsUpdates, string | undefined]
      >) {
        if (val !== undefined) {
          currentKvSettings[propKey] = String(val);
          const dbKey = SETTING_KEY_MAP[propKey];
          if (dbKey) {
            currentKvSettings[dbKey] = String(val);
          }
        }
      }

      await kv.put('admin:settings', JSON.stringify(currentKvSettings));
    } catch (err) {
      console.warn('Erro ao salvar settings no KV:', err);
    }
  }

  invalidateSettingsCache();
}

export async function getRuntimeSettings(
  db: D1Database,
  env: Env
): Promise<RuntimeSettings> {
  const cached = typeof db === 'object' && db !== null ? settingsCache.get(db) : null;
  if (cached && Date.now() < cached.expiresAt) {
    return cached.settings;
  }

  const kv = getKV(env);
  let kvSettings: Record<string, unknown> | null = null;
  if (kv) {
    try {
      const raw = await kv.get('admin:settings');
      if (raw) {
        kvSettings = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Erro ao ler admin:settings do KV:', err);
    }
  }

  await db.prepare(CREATE_SETTINGS_TABLE_SQL).run();

  const rowsResult = await db
    .prepare('SELECT key, value FROM app_settings')
    .all<{ key: string; value: string }>();

  const d1SettingsMap = new Map<string, string>();
  for (const row of rowsResult?.results ?? []) {
    if (row && typeof row.key === 'string') {
      d1SettingsMap.set(row.key, String(row.value ?? ''));
    }
  }

  const readKvKey = (...candidates: string[]): string | undefined => {
    if (!kvSettings || typeof kvSettings !== 'object') return undefined;
    for (const k of candidates) {
      if (k in kvSettings) {
        const val = (kvSettings as Record<string, unknown>)[k];
        if (val !== undefined && val !== null) {
          return String(val);
        }
      }
    }
    return undefined;
  };

  const readD1Key = (...candidates: string[]): string | undefined => {
    for (const k of candidates) {
      if (d1SettingsMap.has(k)) {
        return d1SettingsMap.get(k);
      }
    }
    return undefined;
  };

  let kvAdminPass = readKvKey('adminPassword', 'admin_password', 'ADMIN_PASSWORD');
  let d1AdminPass = readD1Key('admin_password', 'adminPassword', 'ADMIN_PASSWORD');
  const envAdminPass = (env.ADMIN_PASSWORD || '').trim();

  let kvBaseUrl = readKvKey('omnirouteBaseUrl', 'omniroute_base_url', 'OMNIROUTE_BASE_URL');
  let d1BaseUrl = readD1Key('omniroute_base_url', 'omnirouteBaseUrl', 'OMNIROUTE_BASE_URL');
  const envBaseUrl = (env.OMNIROUTE_BASE_URL || '').trim();

  let kvApiKey = readKvKey('omnirouteApiKey', 'omniroute_api_key', 'OMNIROUTE_API_KEY');
  let d1ApiKey = readD1Key('omniroute_api_key', 'omnirouteApiKey', 'OMNIROUTE_API_KEY');
  const envApiKey = (env.OMNIROUTE_API_KEY || '').trim();

  let kvModel = readKvKey('omnirouteModel', 'omniroute_model', 'OMNIROUTE_MODEL');
  let d1Model = readD1Key('omniroute_model', 'omnirouteModel', 'OMNIROUTE_MODEL');
  const envModel = (env.OMNIROUTE_MODEL || '').trim();

  let kvGhToken = readKvKey('githubToken', 'github_token', 'GITHUB_TOKEN');
  let d1GhToken = readD1Key('github_token', 'githubToken', 'GITHUB_TOKEN');
  const envGhToken = (env.GITHUB_TOKEN || '').trim();

  let kvTitle = readKvKey('publicAppTitle', 'public_app_title', 'PUBLIC_APP_TITLE');
  let d1Title = readD1Key('public_app_title', 'publicAppTitle', 'PUBLIC_APP_TITLE');
  const envTitle = (env.PUBLIC_APP_TITLE || '').trim();

  // Auto-persist não-padrão do env para KV e D1
  const autoPersistUpdates: Partial<RuntimeSettingsUpdates> = {};

  if (
    kvAdminPass === undefined &&
    d1AdminPass === undefined &&
    envAdminPass &&
    envAdminPass !== 'admin'
  ) {
    autoPersistUpdates.adminPassword = envAdminPass;
    d1AdminPass = envAdminPass;
  }

  if (kvBaseUrl === undefined && d1BaseUrl === undefined && envBaseUrl) {
    autoPersistUpdates.omnirouteBaseUrl = envBaseUrl;
    d1BaseUrl = envBaseUrl;
  }

  if (kvApiKey === undefined && d1ApiKey === undefined && envApiKey) {
    autoPersistUpdates.omnirouteApiKey = envApiKey;
    d1ApiKey = envApiKey;
  }

  if (
    kvModel === undefined &&
    d1Model === undefined &&
    envModel &&
    envModel !== 'gemini-2.5-flash'
  ) {
    autoPersistUpdates.omnirouteModel = envModel;
    d1Model = envModel;
  }

  if (kvGhToken === undefined && d1GhToken === undefined && envGhToken) {
    autoPersistUpdates.githubToken = envGhToken;
    d1GhToken = envGhToken;
  }

  if (
    kvTitle === undefined &&
    d1Title === undefined &&
    envTitle &&
    envTitle !== 'GitVisão • Catálogo Pega a Visão'
  ) {
    autoPersistUpdates.publicAppTitle = envTitle;
    d1Title = envTitle;
  }

  if (Object.keys(autoPersistUpdates).length > 0) {
    await saveRuntimeSettings(db, autoPersistUpdates, env);
  }

  // Precedência máxima: 1º KV -> 2º D1 -> 3º env -> 4º Defaults de fábrica
  const adminPassword =
    (kvAdminPass !== undefined && kvAdminPass.trim()) ||
    (d1AdminPass !== undefined && d1AdminPass.trim()) ||
    envAdminPass ||
    'admin';

  const omnirouteBaseUrl =
    kvBaseUrl !== undefined
      ? kvBaseUrl.trim()
      : d1BaseUrl !== undefined
        ? d1BaseUrl.trim()
        : envBaseUrl;

  const omnirouteApiKey =
    kvApiKey !== undefined
      ? kvApiKey.trim()
      : d1ApiKey !== undefined
        ? d1ApiKey.trim()
        : envApiKey;

  const omnirouteModel =
    (kvModel !== undefined && kvModel.trim()) ||
    (d1Model !== undefined && d1Model.trim()) ||
    envModel ||
    'gemini-2.5-flash';

  const githubToken =
    kvGhToken !== undefined
      ? kvGhToken.trim()
      : d1GhToken !== undefined
        ? d1GhToken.trim()
        : envGhToken;

  const publicAppTitle =
    (kvTitle !== undefined && kvTitle.trim()) ||
    (d1Title !== undefined && d1Title.trim()) ||
    envTitle ||
    'GitVisão • Catálogo Pega a Visão';

  // Sincroniza D1 para KV se KV ainda não possuía configurações salvas
  if (kv && !kvSettings && d1SettingsMap.size > 0) {
    try {
      await kv.put(
        'admin:settings',
        JSON.stringify({
          adminPassword,
          omnirouteBaseUrl,
          omnirouteApiKey,
          omnirouteModel,
          githubToken,
          publicAppTitle
        })
      );
    } catch (err) {
      console.warn('Erro ao sincronizar D1 -> KV:', err);
    }
  }

  const resolved: RuntimeSettings = {
    adminPassword,
    usingDefaultPassword: adminPassword === 'admin',
    omnirouteBaseUrl,
    omnirouteApiKey,
    omnirouteModel,
    githubToken,
    publicAppTitle
  };

  if (typeof db === 'object' && db !== null) {
    settingsCache.set(db, {
      settings: resolved,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS
    });
  }

  return resolved;
}

export async function runDataAutoHealing(db: D1Database, env?: Env): Promise<void> {
  try {
    const healingCheck = await db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .bind('data_auto_healing_v3')
      .first<{ value: string }>();

    if (healingCheck && healingCheck.value === 'applied') {
      return;
    }

    const kv = getKV(env);

    // 1. Deletar repositórios maliciosos/danosos/scam
    const maliciousKeys = [
      'shadowhackrs/gmail-account-creator',
      'snailsploit/claude-red',
      'evogix/evil-ollama'
    ];

    for (const key of maliciousKeys) {
      await db
        .prepare("DELETE FROM repositories WHERE repo_key = ? OR LOWER(full_name) LIKE ?")
        .bind(key, `%${key}%`)
        .run();
      if (kv) {
        try { await kv.delete(`repo:${key}`); } catch {}
      }
    }

    // 2. Buscar repositórios no D1 para corrigir
    const rows = await db
      .prepare('SELECT id, repo_key, full_name, owner, name, repo_url, description, stars, forks, language, topics_json, last_commit_at, category, template_type, hook_title, intro_text FROM repositories')
      .all<RepoRecord>();

    if (rows && Array.isArray(rows.results)) {
      for (const r of rows.results) {
        let topics: string[] = [];
        try {
          topics = JSON.parse(r.topics_json || '[]');
        } catch {
          topics = [];
        }

        const meta: GitHubRepoMetadata = {
          fullName: r.full_name,
          owner: r.owner,
          name: r.name,
          repoUrl: r.repo_url,
          description: r.description || '',
          stars: Number(r.stars || 0),
          forks: Number(r.forks || 0),
          language: r.language || '',
          topics,
          openIssues: 0,
          updatedAt: r.last_commit_at || new Date().toISOString(),
          readmeExcerpt: ''
        };

        // Verifica se é malicioso
        const safety = isHarmfulRepository(meta);
        if (safety.isHarmful) {
          await db.prepare('DELETE FROM repositories WHERE id = ?').bind(r.id).run();
          if (kv) {
            try { await kv.delete(`repo:${r.repo_key}`); } catch {}
          }
          continue;
        }

        const hook = (r.hook_title || '').toUpperCase();
        const intro = (r.intro_text || '').toLowerCase();

        const needsHealing =
          intro.includes('gargalo') ||
          intro.includes('resili') ||
          hook.includes('VAZASSE') ||
          hook.includes('GATEWAY QUE SALVA') ||
          hook.includes('EXECUÇÃO NA BORDA') ||
          hook.includes('EXECUCAO NA BORDA') ||
          hook.includes('SERVIDOR MCP QUE FALTAVA') ||
          hook.includes('GERENCIAMENTO E EXECU') ||
          (r.template_type === 'infra-gateway' && r.category !== 'Infra, Gateways & Edge');

        if (needsHealing) {
          const newTemplate = detectTemplateType(meta);
          const newCategory = detectCategory(meta, newTemplate);
          const newSummary = generateFallbackSummary(meta, newTemplate);

          await db
            .prepare(`
              UPDATE repositories
              SET category = ?,
                  template_type = ?,
                  hook_title = ?,
                  intro_text = ?,
                  features_json = ?,
                  scenario_title = ?,
                  scenario_intro = ?,
                  scenario_prompt = ?,
                  scenario_steps_json = ?,
                  killer_title = ?,
                  killer_text = ?,
                  summary_text = ?,
                  punchline = ?,
                  whatsapp_text = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `)
            .bind(
              newCategory,
              newTemplate,
              newSummary.hookTitle,
              newSummary.introText,
              JSON.stringify(newSummary.features),
              newSummary.scenarioTitle,
              newSummary.scenarioIntro,
              newSummary.scenarioPrompt,
              JSON.stringify(newSummary.scenarioSteps),
              newSummary.killerTitle,
              newSummary.killerText,
              newSummary.summaryText,
              newSummary.punchline,
              newSummary.whatsappText,
              r.id
            )
            .run();

          if (kv) {
            try {
              await kv.delete(`repo:${r.repo_key}`);
            } catch {}
          }
        }
      }
    }

    // 3. Marca como aplicado para não reexecutar
    await db
      .prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('data_auto_healing_v3', 'applied', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = 'applied', updated_at = datetime('now')
      `)
      .run();

    await db
      .prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('data_auto_healing_v1', 'applied', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = 'applied', updated_at = datetime('now')
      `)
      .run();

    console.log('[AutoHealing] data_auto_healing_v3 aplicado com sucesso.');
  } catch (err) {
    console.error('[AutoHealing] Erro ao executar auto-healing v3:', err);
  }
}

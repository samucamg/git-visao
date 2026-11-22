import { generateRepoVisaoSummary } from './ai.ts';
import { extractAdminPassword, verifyAdminPassword } from './auth.ts';
import {
  deleteRepository,
  ensureDatabaseInitialized,
  findRepoByKey,
  getRuntimeSettings,
  listRepositories,
  saveRuntimeSettings,
  type RuntimeSettingsUpdates,
  upsertRepository
} from './db.ts';
import { EvolutionError, fetchEvolutionGroups, isEvolutionConfigured } from './evolution.ts';
import { fetchGitHubRepoMetadata, parseGitHubRepoInput } from './github.ts';
import {
  countIngestLog,
  getIngestConfig,
  getIngestLogRow,
  getIngestState,
  listIngestLog,
  maskIngestConfig,
  recordVisitorRequest,
  saveIngestConfig,
  upsertIngestLog,
  type IngestConfigPatch,
  type IngestStatus
} from './ingest-db.ts';
import { createIngestDeps } from './ingest-deps.ts';
import { reviewIngestItem, runIngest } from './ingest.ts';
import type { Env, RuntimeSettings, TemplateType } from './types.ts';
import { renderAdminHtml } from './ui-admin.ts';
import { renderPublicHtml, type PublicPageMeta } from './ui-public.ts';
import { searchRepositories } from './search.ts';
import {
  getBotConfig,
  getEvolutionWebhook,
  handleBotWebhook,
  maskBotConfig,
  registerEvolutionWebhook,
  saveBotConfig,
  type BotConfigPatch
} from './bot.ts';
import { getPromoConfig, savePromoConfig, type PromoConfigPatch } from './promo.ts';
import { testAiConnection, testGithubToken } from './bot-ai.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password'
};

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY'
};

const INGEST_STATUSES: IngestStatus[] = ['requested', 'pending', 'error', 'ignored', 'added'];

function jsonResponse(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra }
  });
}

// Proteções "best effort" por isolate (sem custo de D1/KV): limita tentativas de senha e
// pedidos de visitantes gravados no banco. Reinicia quando o isolate é reciclado.
const hits = new Map<string, { n: number; until: number }>();
function tooMany(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.until < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { n: 1, until: now + windowMs });
    return false;
  }
  cur.n += 1;
  return cur.n > max;
}
function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clip(text: string, max: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function safeParseRepo(input: string) {
  try {
    return parseGitHubRepoInput(input);
  } catch {
    return null;
  }
}

function maskSecret(secret: string): string {
  const clean = (secret || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function buildSettingsView(settings: RuntimeSettings) {
  return {
    usingDefaultPassword: settings.usingDefaultPassword,
    publicAppTitle: settings.publicAppTitle,
    omnirouteBaseUrl: settings.omnirouteBaseUrl,
    omnirouteModel: settings.omnirouteModel,
    hasOmnirouteApiKey: Boolean(settings.omnirouteApiKey),
    omnirouteApiKeyMasked: maskSecret(settings.omnirouteApiKey),
    hasGithubToken: Boolean(settings.githubToken),
    githubTokenMasked: maskSecret(settings.githubToken)
  };
}

interface EffectiveContext {
  settings: RuntimeSettings;
  effectiveEnv: Env;
}

async function loadEffectiveContext(env: Env): Promise<EffectiveContext> {
  await ensureDatabaseInitialized(env.DB, env);
  const settings = await getRuntimeSettings(env.DB, env);
  const effectiveEnv: Env = {
    ...env,
    ADMIN_PASSWORD: settings.adminPassword,
    OMNIROUTE_BASE_URL: settings.omnirouteBaseUrl,
    OMNIROUTE_API_KEY: settings.omnirouteApiKey,
    OMNIROUTE_MODEL: settings.omnirouteModel,
    GITHUB_TOKEN: settings.githubToken,
    PUBLIC_APP_TITLE: settings.publicAppTitle
  };
  return { settings, effectiveEnv };
}

async function readJson<T extends object>(request: Request): Promise<T> {
  try {
    return ((await request.json()) as T) ?? ({} as T);
  } catch {
    return {} as T;
  }
}

const UNAUTHORIZED = {
  ok: false,
  requiresPassword: true,
  error: 'Senha de administrador inválida ou ausente.'
};

async function handleAdminApi(
  request: Request,
  env: Env,
  pathname: string,
  searchParams: URLSearchParams,
  ctx: EffectiveContext
): Promise<Response | null> {
  const { settings, effectiveEnv } = ctx;

  if (request.method === 'GET' && pathname === '/api/admin/status') {
    const [ingestConfig, state, counts] = await Promise.all([
      getIngestConfig(env.DB, env),
      getIngestState(env.DB),
      countIngestLog(env.DB)
    ]);
    const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM repositories').first<{
      total: number;
    }>();
    return jsonResponse({
      ok: true,
      settings: buildSettingsView(settings),
      ingest: maskIngestConfig(ingestConfig),
      lastRun: state.lastRun,
      counts,
      catalogTotal: Number(total?.total || 0)
    });
  }

  if (request.method === 'POST' && pathname === '/api/admin/ingest/config') {
    const body = await readJson<IngestConfigPatch>(request);
    const saved = await saveIngestConfig(env.DB, body, env);
    return jsonResponse({ ok: true, ingest: maskIngestConfig(saved) });
  }

  if (request.method === 'POST' && pathname === '/api/admin/ingest/groups') {
    const config = await getIngestConfig(env.DB, env);
    if (!isEvolutionConfigured(config)) {
      return jsonResponse(
        {
          ok: false,
          error: 'Salve URL, chave e instância da Evolution API antes de listar os grupos.'
        },
        400
      );
    }
    try {
      const groups = await fetchEvolutionGroups(config);
      return jsonResponse({ ok: true, groups });
    } catch (err) {
      const status = err instanceof EvolutionError ? 502 : 500;
      return jsonResponse(
        { ok: false, error: err instanceof Error ? err.message : 'Falha ao listar grupos.' },
        status
      );
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/ingest/run') {
    const body = await readJson<{ fullBackfill?: boolean }>(request);
    const summary = await runIngest(env.DB, env, createIngestDeps(env, effectiveEnv), {
      trigger: 'manual',
      fullBackfill: body.fullBackfill === true
    });
    return jsonResponse({ ok: true, summary });
  }

  if (request.method === 'GET' && pathname === '/api/admin/ingest/items') {
    const raw = searchParams.get('status') as IngestStatus | null;
    const status = raw && INGEST_STATUSES.includes(raw) ? raw : undefined;
    const items = await listIngestLog(env.DB, { status, limit: 200 });
    return jsonResponse({ ok: true, items });
  }

  if (request.method === 'POST' && pathname === '/api/admin/ingest/review') {
    const body = await readJson<{ repoKey?: string; action?: string }>(request);
    if (
      !body.repoKey ||
      (body.action !== 'approve' &&
        body.action !== 'dismiss' &&
        body.action !== 'retry' &&
        body.action !== 'delete')
    ) {
      return jsonResponse(
        { ok: false, error: 'Informe repoKey e action (approve, dismiss, retry ou delete).' },
        400
      );
    }

    // Excluir: tira do catálogo (se estiver lá) e marca como ignorado, para a raspagem
    // não reincluir o mesmo link se ele aparecer de novo no grupo.
    if (body.action === 'delete') {
      const key = body.repoKey.trim().toLowerCase();
      const removed = await deleteRepository(env.DB, key, env);
      const row = await getIngestLogRow(env.DB, key);
      await upsertIngestLog(env.DB, {
        repoKey: key,
        fullName: row?.full_name || key,
        status: 'ignored',
        reason: 'Excluído pelo admin.',
        source: row?.source,
        sender: row?.sender,
        messageTs: row?.message_ts
      });
      return jsonResponse({
        ok: true,
        message: removed ? 'Removido do catálogo e marcado como ignorado.' : 'Marcado como ignorado.',
        repoKey: key
      });
    }
    const result = await reviewIngestItem(
      env.DB,
      createIngestDeps(env, effectiveEnv),
      body.repoKey,
      body.action
    );
    return jsonResponse(result, result.ok ? 200 : 422);
  }

  // Bot do grupo (WhatsApp)
  if (pathname === '/api/admin/bot/config') {
    if (request.method === 'POST') {
      const body = await readJson<BotConfigPatch>(request);
      const saved = await saveBotConfig(env.DB, body, env);
      return jsonResponse({ ok: true, bot: maskBotConfig(saved) });
    }
    const bot = await getBotConfig(env.DB, env);
    return jsonResponse({ ok: true, bot: maskBotConfig(bot) });
  }
  if (request.method === 'GET' && pathname === '/api/admin/bot/webhook') {
    return jsonResponse(await getEvolutionWebhook(env.DB, env));
  }
  if (request.method === 'POST' && pathname === '/api/admin/bot/webhook/register') {
    const body = await readJson<{ url?: string }>(request);
    const bot = await getBotConfig(env.DB, env);
    const origin = new URL(request.url).origin;
    const url =
      typeof body.url === 'string' && /^https:\/\//.test(body.url.trim())
        ? body.url.trim()
        : `${origin}/api/bot/webhook/${bot.secret}`;
    const result = await registerEvolutionWebhook(env.DB, env, url);
    return jsonResponse({ ...result, url }, result.ok ? 200 : 502);
  }

  // Teste da IA (OmniRoute) com o endereço, a chave e o modelo salvos
  if (request.method === 'POST' && pathname === '/api/admin/ai/test') {
    const [test, github] = await Promise.all([testAiConnection(env.DB, env), testGithubToken(env.DB, env)]);
    return jsonResponse({ ok: true, test, github });
  }

  // Divulgação (canal + vídeos em destaque)
  if (pathname === '/api/admin/promo') {
    if (request.method === 'POST') {
      const body = await readJson<PromoConfigPatch>(request);
      const promo = await savePromoConfig(env.DB, body, env);
      return jsonResponse({ ok: true, promo });
    }
    return jsonResponse({ ok: true, promo: await getPromoConfig(env.DB, env) });
  }

  // `settings` fica referenciado para futuras rotas que precisem dele.
  void settings;
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    try {
      // 1. Páginas: home pública (só consulta) e /admin (toda a gestão)
      if (request.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        let title = env.PUBLIC_APP_TITLE;
        let promo = null;
        let meta: PublicPageMeta | undefined;
        if (env.DB) {
          try {
            title = (await loadEffectiveContext(env)).effectiveEnv.PUBLIC_APP_TITLE;
            promo = await getPromoConfig(env.DB, env);
            // Link de um repositório (?repo=owner/name): prévia própria no WhatsApp/redes.
            const repoParam = safeParseRepo(searchParams.get('repo') || '');
            if (repoParam) {
              const repo = await findRepoByKey(env.DB, repoParam.repoKey, env, 'pt');
              if (repo) {
                const canonical = `${url.origin}/?repo=${repo.full_name}`;
                meta = {
                  pageTitle: `${repo.full_name} • GitVisão`,
                  description: clip(`${repo.hook_title} — ${repo.intro_text || repo.description}`, 220),
                  url: canonical,
                  jsonLd: {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareSourceCode',
                    name: repo.full_name,
                    description: clip(repo.description || repo.intro_text, 300),
                    codeRepository: repo.repo_url,
                    programmingLanguage: repo.language || undefined,
                    url: canonical
                  }
                };
              }
            }
          } catch {
            // usa o valor do ambiente
          }
        }
        return new Response(renderPublicHtml(title, { promo, meta, origin: url.origin }), {
          status: 200,
          headers: HTML_HEADERS
        });
      }

      if (request.method === 'GET' && pathname === '/robots.txt') {
        return new Response(
          `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`,
          { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }
        );
      }

      if (request.method === 'GET' && pathname === '/sitemap.xml') {
        await ensureDatabaseInitialized(env.DB, env);
        const rows = await env.DB
          .prepare('SELECT full_name, updated_at FROM repositories ORDER BY updated_at DESC LIMIT 5000')
          .all<{ full_name: string; updated_at: string }>();
        const urls = [`<url><loc>${escapeXml(url.origin)}/</loc><changefreq>daily</changefreq></url>`].concat(
          (rows.results ?? []).map((r) => {
            const day = String(r.updated_at || '').slice(0, 10);
            const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `<lastmod>${day}</lastmod>` : '';
            return `<url><loc>${escapeXml(`${url.origin}/?repo=${r.full_name}`)}</loc>${lastmod}</url>`;
          })
        );
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
          { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }
        );
      }

      // Divulgação pública (canal + vídeos) para clientes externos
      if (request.method === 'GET' && pathname === '/api/promo') {
        await ensureDatabaseInitialized(env.DB, env);
        return jsonResponse({ ok: true, promo: await getPromoConfig(env.DB, env) }, 200, {
          'Cache-Control': 'public, max-age=300'
        });
      }

      // Webhook do bot do grupo (Evolution API). O segredo no caminho autentica a chamada.
      if (request.method === 'POST' && pathname.startsWith('/api/bot/webhook/')) {
        await ensureDatabaseInitialized(env.DB, env);
        return handleBotWebhook(request, env, {}, ctx);
      }
      if (request.method === 'GET' && pathname === '/admin') {
        return new Response(renderAdminHtml(env.OMNIROUTE_MODEL), {
          status: 200,
          headers: { ...HTML_HEADERS, 'X-Robots-Tag': 'noindex, nofollow' }
        });
      }

      // 2. Saúde (pública, sem detalhes de configuração)
      if (request.method === 'GET' && pathname === '/api/health') {
        const { settings } = await loadEffectiveContext(env);
        return jsonResponse({ ok: true, publicAppTitle: settings.publicAppTitle });
      }

      // 3. Listagem pública do catálogo
      if (request.method === 'GET' && pathname === '/api/repos') {
        const lang = searchParams.get('lang') || 'pt';
        const cacheUrl = new URL(request.url);
        if (!cacheUrl.searchParams.has('lang')) {
          cacheUrl.searchParams.set('lang', lang);
        }
        const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
        const cache = typeof caches !== 'undefined' ? caches.default : null;
        if (cache) {
          const cachedResponse = await cache.match(cacheKey);
          if (cachedResponse) {
            return cachedResponse;
          }
        }

        // Só garante o banco; as configurações (senha, chaves) não são necessárias aqui.
        await ensureDatabaseInitialized(env.DB, env);
        const sortParam = searchParams.get('sort');
        const sort =
          sortParam === 'stars' || sortParam === 'name' || sortParam === 'recent' || sortParam === 'relevance'
            ? sortParam
            : undefined;
        const limitParam = searchParams.get('limit');
        const templateType = searchParams.get('template') || searchParams.get('templateType');
        const data = templateType
          ? await listRepositories(env.DB, {
              q: searchParams.get('q') || undefined,
              category: searchParams.get('category') || undefined,
              templateType,
              sort: sort === 'relevance' || !sort ? 'recent' : sort,
              limit: limitParam ? Number(limitParam) : 30,
              cursor: searchParams.get('cursor') || undefined,
              lang
            })
          : await searchRepositories(env.DB, {
              q: searchParams.get('q') || undefined,
              category: searchParams.get('category') || undefined,
              language: searchParams.get('language') || undefined,
              minStars: Number(searchParams.get('minStars') || 0) || undefined,
              recentDays: Number(searchParams.get('recentDays') || 0) || undefined,
              sort,
              limit: limitParam ? Number(limitParam) : 30,
              cursor: searchParams.get('cursor') || undefined,
              lang
            });
        // Cache curto na borda: catálogo novo aparece em no máximo 2 minutos.
        const resp = jsonResponse({ ok: true, ...data }, 200, {
          'Cache-Control': 'public, max-age=30, s-maxage=120'
        });
        if (cache && ctx) {
          ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        }
        return resp;
      }

      // 4. Consulta pública: só diz se existe. Se não existir, guarda o pedido para o admin.
      if (request.method === 'GET' && pathname === '/api/check') {
        const parsed = safeParseRepo(searchParams.get('repo') || '');
        if (!parsed) {
          return jsonResponse(
            {
              ok: false,
              error:
                'Informe um repositório GitHub válido (ex: owner/repo ou https://github.com/owner/repo).'
            },
            400
          );
        }
        const lang = searchParams.get('lang') || 'pt';
        await ensureDatabaseInitialized(env.DB, env);
        const existing = await findRepoByKey(env.DB, parsed.repoKey, env, lang);
        // Só anota o pedido para a curadoria dentro de um limite por IP (evita encher a fila).
        if (!existing && !tooMany(`check:${clientIp(request)}`, 15, 60 * 60 * 1000)) {
          await recordVisitorRequest(env.DB, parsed.repoKey, parsed.fullName);
        }
        return jsonResponse({
          ok: true,
          exists: Boolean(existing),
          fullName: parsed.fullName,
          repo: existing
        });
      }

      // 5. Tudo que escreve ou configura exige senha de admin (somente cabeçalhos/corpo, nunca URL)
      const isAdminRoute =
        pathname === '/api/auth/verify' ||
        pathname === '/api/settings' ||
        pathname.startsWith('/api/admin/') ||
        (pathname === '/api/repos' && request.method === 'POST') ||
        (pathname.startsWith('/api/repos/') && request.method === 'DELETE');

      if (isAdminRoute) {
        const ctx = await loadEffectiveContext(env);
        const { settings, effectiveEnv } = ctx;

        let body: Record<string, unknown> = {};
        if (request.method === 'POST' || request.method === 'PUT') {
          body = await readJson<Record<string, unknown>>(request.clone());
        }
        const bodyPassword =
          typeof (body.currentPassword ?? body.password) === 'string'
            ? String(body.currentPassword ?? body.password)
            : undefined;
        const ipKey = `auth:${clientIp(request)}`;
        const lock = hits.get(ipKey);
        if (lock && lock.n >= 8 && lock.until > Date.now()) {
          return jsonResponse(
            { ok: false, error: 'Muitas tentativas de senha. Aguarde 15 minutos.' },
            429,
            { 'Cache-Control': 'no-store' }
          );
        }
        const providedPassword = extractAdminPassword(request, bodyPassword);
        const authorized = await verifyAdminPassword(providedPassword, settings.adminPassword);
        // Conta só tentativas com senha enviada (chamadas sem senha não são força bruta).
        if (authorized) hits.delete(ipKey);
        else if (providedPassword) tooMany(ipKey, 8, 15 * 60 * 1000);

        if (pathname === '/api/auth/verify') {
          return authorized
            ? jsonResponse({ ok: true })
            : jsonResponse({ ok: false, error: 'Senha de administrador incorreta.' }, 401);
        }
        if (!authorized) {
          return jsonResponse(UNAUTHORIZED, 401);
        }

        if (request.method === 'GET' && pathname === '/api/settings') {
          const view = buildSettingsView(settings);
          return jsonResponse({ ok: true, ...view, settings: view });
        }

        if ((request.method === 'POST' || request.method === 'PUT') && pathname === '/api/settings') {
          const b = body as {
            newPassword?: string;
            omnirouteBaseUrl?: string;
            omnirouteApiKey?: string;
            omnirouteModel?: string;
            githubToken?: string;
            publicAppTitle?: string;
            clearOmnirouteApiKey?: boolean;
            clearGithubToken?: boolean;
          };
          const updates: Partial<RuntimeSettingsUpdates> = {};
          if (typeof b.newPassword === 'string' && b.newPassword.trim()) {
            updates.adminPassword = b.newPassword.trim();
          }
          if (typeof b.omnirouteBaseUrl === 'string') {
            updates.omnirouteBaseUrl = b.omnirouteBaseUrl.trim();
          }
          if (b.clearOmnirouteApiKey === true) {
            updates.omnirouteApiKey = '';
          } else if (
            typeof b.omnirouteApiKey === 'string' &&
            b.omnirouteApiKey.trim() &&
            !b.omnirouteApiKey.includes('...')
          ) {
            updates.omnirouteApiKey = b.omnirouteApiKey.trim();
          }
          if (typeof b.omnirouteModel === 'string' && b.omnirouteModel.trim()) {
            updates.omnirouteModel = b.omnirouteModel.trim();
          }
          if (b.clearGithubToken === true) {
            updates.githubToken = '';
          } else if (
            typeof b.githubToken === 'string' &&
            b.githubToken.trim() &&
            !b.githubToken.includes('...')
          ) {
            updates.githubToken = b.githubToken.trim();
          }
          if (typeof b.publicAppTitle === 'string' && b.publicAppTitle.trim()) {
            updates.publicAppTitle = b.publicAppTitle.trim();
          }
          await saveRuntimeSettings(env.DB, updates, env);
          const view = buildSettingsView(await getRuntimeSettings(env.DB, env));
          return jsonResponse({ ok: true, ...view, settings: view });
        }

        if (pathname.startsWith('/api/admin/')) {
          const response = await handleAdminApi(request, env, pathname, searchParams, ctx);
          if (response) return response;
        }

        // Inclusão manual de repositório (única porta de entrada de novos itens, só admin)
        if (request.method === 'POST' && pathname === '/api/repos') {
          const b = body as { repo?: string; templateType?: TemplateType; force?: boolean };
          const parsed = safeParseRepo(b.repo || '');
          if (!parsed) {
            return jsonResponse(
              { ok: false, error: 'Repositório inválido. Use owner/repo ou o link do GitHub.' },
              400
            );
          }
          const existing = await findRepoByKey(env.DB, parsed.repoKey, env);
          if (existing && !b.force) {
            return jsonResponse({ ok: true, cached: true, repo: existing });
          }
          const meta = await fetchGitHubRepoMetadata(parsed.fullName, effectiveEnv.GITHUB_TOKEN);
          if (meta.isHarmful) {
            return jsonResponse(
              {
                ok: false,
                error: 'Repositório bloqueado por conter conteúdo potencialmente danoso ou malicioso'
              },
              400
            );
          }
          const summary = await generateRepoVisaoSummary(meta, effectiveEnv, b.templateType);
          const saved = await upsertRepository(env.DB, meta, summary, env);
          return jsonResponse({ ok: true, cached: false, repo: saved });
        }

        if (request.method === 'DELETE' && pathname.startsWith('/api/repos/')) {
          const parts = pathname.replace(/^\/api\/repos\//, '').split('/').filter(Boolean);
          if (parts.length < 2) {
            return jsonResponse({ ok: false, error: 'Use /api/repos/:owner/:name.' }, 400);
          }
          const repoKey = `${decodeURIComponent(parts[0])}/${decodeURIComponent(parts[1])}`.toLowerCase();
          const deleted = await deleteRepository(env.DB, repoKey, env);
          if (!deleted) {
            return jsonResponse({ ok: false, error: 'Repositório não encontrado no catálogo.' }, 404);
          }
          return jsonResponse({ ok: true, deleted: true, repoKey });
        }
      }

      return jsonResponse({ ok: false, error: 'Rota não encontrada.' }, 404);
    } catch (err) {
      const requestId = crypto.randomUUID().slice(0, 8);
      const message = err instanceof Error ? err.message : 'Erro interno no Worker.';
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          method: request.method,
          pathname,
          error: message,
          stack: err instanceof Error ? err.stack : undefined
        })
      );
      // Detalhe só para rotas administrativas; o público recebe mensagem genérica.
      const isAdmin = pathname.startsWith('/api/admin/') || pathname === '/api/settings';
      return jsonResponse(
        { ok: false, error: isAdmin ? message : 'Erro interno. Tente novamente.', requestId },
        500,
        { 'X-Request-Id': requestId }
      );
    }
  },

  // Cron Trigger (a cada 30 min): lê os grupos configurados e cataloga o que for open source.
  async scheduled(
    _event: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const { effectiveEnv } = await loadEffectiveContext(env);
          const started = Date.now();
          const summary = await runIngest(env.DB, env, createIngestDeps(env, effectiveEnv), {
            trigger: 'cron'
          });
          const { items: _items, ...counts } = (summary || {}) as unknown as Record<string, unknown>;
          void _items;
          console.log(JSON.stringify({ event: 'ingest_cron', durationMs: Date.now() - started, ...counts }));
        } catch (err) {
          console.error('Falha na raspagem agendada:', err);
        }
      })()
    );
  }
};

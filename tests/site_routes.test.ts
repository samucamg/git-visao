// Rotas da home nova: prévia por repositório (Open Graph), robots/sitemap, divulgação e painel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1, insertCatalogRepo } from './helpers/sqlite-d1.ts';
import worker from '../src/index.ts';
import { invalidateSettingsCache } from '../src/db.ts';
import {
  DEFAULT_PROMO_CONFIG,
  normalizePromoConfig,
  parseYouTubeInput,
  resetPromoMemo,
  savePromoConfig
} from '../src/promo.ts';
import { renderPublicHtml } from '../src/ui-public.ts';
import type { Env } from '../src/types.ts';

function makeEnv() {
  invalidateSettingsCache();
  resetPromoMemo();
  const { db, raw } = createSqliteD1();
  insertCatalogRepo(raw, 'acme/Scanner-Pro');
  const env = { DB: db, ADMIN_PASSWORD: 'segredo-forte' } as unknown as Env;
  return { env, raw };
}

test('promo: parseYouTubeInput entende links, IDs e tempo inicial', () => {
  assert.deepEqual(parseYouTubeInput('https://www.youtube.com/watch?v=2jr48gSxMwg'), { id: '2jr48gSxMwg' });
  assert.deepEqual(parseYouTubeInput('https://www.youtube.com/watch?v=ZhZCv8ZlHfc&t=33s'), { id: 'ZhZCv8ZlHfc', start: 33 });
  assert.deepEqual(parseYouTubeInput('https://youtu.be/N2cWgTEGz9k?t=1m5s'), { id: 'N2cWgTEGz9k', start: 65 });
  assert.deepEqual(parseYouTubeInput('https://www.youtube.com/watch?v=N2cWgTEGz9k&pp=abc'), { id: 'N2cWgTEGz9k' });
  assert.deepEqual(parseYouTubeInput('nTdKghDnF4o'), { id: 'nTdKghDnF4o' });
  assert.equal(parseYouTubeInput('https://example.com/watch?v=nTdKghDnF4o'), null);
  assert.equal(parseYouTubeInput('lixo'), null);
});

test('promo: padrão tem o canal e os 4 vídeos pedidos; normalização descarta lixo', () => {
  assert.equal(DEFAULT_PROMO_CONFIG.channelUrl, 'https://www.youtube.com/@SamucaTutoriais');
  assert.deepEqual(
    DEFAULT_PROMO_CONFIG.videos.map((v) => v.id),
    ['2jr48gSxMwg', 'nTdKghDnF4o', 'ZhZCv8ZlHfc', 'N2cWgTEGz9k']
  );
  const n = normalizePromoConfig({ videos: [{ id: 'bad' }, { id: 'nTdKghDnF4o', title: 'ok' }], channelUrl: 'javascript:alert(1)' });
  assert.equal(n.videos.length, 1);
  assert.equal(n.channelUrl, DEFAULT_PROMO_CONFIG.channelUrl);
});

test('promo: savePromoConfig busca título no oEmbed só para vídeo novo', async () => {
  const { env } = makeEnv();
  await worker.fetch(new Request('https://vision.test/api/health'), env); // cria tabelas
  const calls: string[] = [];
  const fakeFetch = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ title: 'Vídeo novo' }), { status: 200 });
  };
  const saved = await savePromoConfig(
    env.DB,
    { videoUrls: ['https://youtu.be/2jr48gSxMwg', 'https://www.youtube.com/watch?v=abcdefghijk&t=10s'] },
    env,
    fakeFetch as never
  );
  assert.equal(saved.videos.length, 2);
  assert.equal(saved.videos[0].title, DEFAULT_PROMO_CONFIG.videos[0].title, 'título conhecido é mantido');
  assert.equal(saved.videos[1].title, 'Vídeo novo');
  assert.equal(saved.videos[1].start, 10);
  assert.equal(calls.length, 1);
});

test('home: injeta divulgação e Open Graph próprio para ?repo=', async () => {
  const { env } = makeEnv();
  const home = await (await worker.fetch(new Request('https://vision.test/'), env)).text();
  assert.ok(home.includes('/app.js?v='), 'carrega o JS estático');
  assert.ok(home.includes('2jr48gSxMwg'), 'vídeos da divulgação no boot');
  assert.ok(home.includes('og:image" content="https://vision.test/img/og.jpg'));

  const res = await worker.fetch(new Request('https://vision.test/?repo=acme/scanner-pro'), env);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  const page = await res.text();
  assert.ok(page.includes('<title>acme/Scanner-Pro • GitVisão</title>'));
  assert.ok(page.includes('og:url" content="https://vision.test/?repo=acme/Scanner-Pro'));
  assert.ok(page.includes('SoftwareSourceCode'));
});

test('home: boot JSON não permite fechar a tag <script>', () => {
  const html = renderPublicHtml('t', {
    promo: { ...DEFAULT_PROMO_CONFIG, channelTagline: '</script><script>alert(1)</script>' }
  });
  assert.ok(!html.includes('</script><script>alert(1)'));
});

test('robots.txt e sitemap.xml', async () => {
  const { env } = makeEnv();
  const robots = await (await worker.fetch(new Request('https://vision.test/robots.txt'), env)).text();
  assert.ok(robots.includes('Disallow: /admin'));
  assert.ok(robots.includes('Sitemap: https://vision.test/sitemap.xml'));
  const sm = await (await worker.fetch(new Request('https://vision.test/sitemap.xml'), env)).text();
  assert.ok(sm.includes('<loc>https://vision.test/?repo=acme/Scanner-Pro</loc>'));
});

test('admin: rotas de bot e divulgação exigem senha e funcionam com ela', async () => {
  const { env } = makeEnv();
  const anon = await worker.fetch(new Request('https://vision.test/api/admin/promo'), env);
  assert.equal(anon.status, 401);
  const headers = { 'X-Admin-Password': 'segredo-forte', 'Content-Type': 'application/json' };
  const promo = await (await worker.fetch(new Request('https://vision.test/api/admin/promo', { headers }), env)).json();
  assert.equal(promo.ok, true);
  assert.equal(promo.promo.videos.length, 4);
  const bot = await (await worker.fetch(new Request('https://vision.test/api/admin/bot/config', { headers }), env)).json();
  assert.equal(bot.ok, true);
  assert.match(bot.bot.webhookPath, /^\/api\/bot\/webhook\/[0-9a-f]{24}$/);
  // webhook com segredo errado é recusado
  const wrong = await worker.fetch(
    new Request('https://vision.test/api/bot/webhook/errado', { method: 'POST', body: '{}' }),
    env
  );
  assert.equal(wrong.status, 403);
});

test('admin: bloqueia após várias senhas erradas do mesmo IP', async () => {
  const { env } = makeEnv();
  const ip = { 'CF-Connecting-IP': '203.0.113.9', 'Content-Type': 'application/json' };
  let last = 0;
  for (let i = 0; i < 10; i++) {
    const r = await worker.fetch(
      new Request('https://vision.test/api/auth/verify', { method: 'POST', headers: ip, body: JSON.stringify({ password: 'x' + i }) }),
      env
    );
    last = r.status;
  }
  assert.equal(last, 429);
  // outro IP segue liberado
  const ok = await worker.fetch(
    new Request('https://vision.test/api/auth/verify', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.10', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'segredo-forte' })
    }),
    env
  );
  assert.equal(ok.status, 200);
});

test('api/repos: busca em linguagem natural via rota pública', async () => {
  const { env, raw } = makeEnv();
  raw
    .prepare("UPDATE repositories SET description = 'Scanner de vulnerabilidades e pentest', category = 'Cibersegurança & Pentest' WHERE repo_key = 'acme/scanner-pro'")
    .run();
  const data = await (
    await worker.fetch(new Request('https://vision.test/api/repos?q=' + encodeURIComponent('temos repositórios voltados a segurança?')), env)
  ).json();
  assert.equal(data.ok, true);
  assert.equal(data.items[0].full_name, 'acme/Scanner-Pro');
  assert.ok(data.byLanguage && typeof data.byLanguage === 'object');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BOT_CONFIG,
  detectBotQuery,
  formatBotReply,
  getBotConfig,
  handleBotWebhook,
  saveBotConfig,
  type BotConfig,
  type BotDeps,
  type BotSearchResult
} from '../src/bot.ts';
import { saveIngestConfig } from '../src/ingest-db.ts';
import { createSqliteD1 } from './helpers/sqlite-d1.ts';

const OWNER = '5531999999999';
const GROUP = '120363000000000001@g.us'; // identificador fictício
const OTHER_GROUP = '120363000000000002@g.us';
const SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const NOW_MS = Date.UTC(2026, 10, 22, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

function config(patch: Partial<BotConfig> = {}): BotConfig {
  return { ...DEFAULT_BOT_CONFIG, secret: SECRET, ownerNumber: OWNER, ...patch };
}

function item(full: string, stars: number, hook = 'Ferramenta de exemplo') {
  return {
    full_name: full,
    repo_key: full.toLowerCase(),
    repo_url: `https://github.com/${full}`,
    hook_title: hook,
    stars,
    category: 'Segurança',
    description: 'desc'
  };
}

// ------------------------------------------------------------------ detectBotQuery

test('detectBotQuery: menção ao dono + "vision" aciona e remove o ruído', () => {
  const q = detectBotQuery(
    `@${OWNER} vision temos repositórios voltados a segurança?`,
    [`${OWNER}@s.whatsapp.net`],
    config()
  );
  assert.equal(q, 'temos repositórios voltados a segurança');
});

test('detectBotQuery: menção via JID @lid também aciona com "vision"', () => {
  const q = detectBotQuery('@123 vision segurança', ['123@lid'], config());
  assert.equal(q, 'segurança');
});

test('detectBotQuery: menção sem a palavra "vision" não aciona', () => {
  assert.equal(
    detectBotQuery(`oi @${OWNER}, tudo bem?`, [`${OWNER}@s.whatsapp.net`], config()),
    null
  );
});

test('detectBotQuery: "/vision x" aciona com a pergunta x', () => {
  assert.equal(detectBotQuery('/vision segurança', [], config()), 'segurança');
  assert.equal(detectBotQuery('!VISION automação com IA', [], config()), 'automação com IA');
  assert.equal(detectBotQuery('vision? python', [], config()), 'python');
});

test('detectBotQuery: gatilho exige fronteira de palavra (/visionario não aciona)', () => {
  assert.equal(detectBotQuery('/visionario de Python', [], config()), null);
});

test('detectBotQuery: só o gatilho vira pergunta vazia (ajuda)', () => {
  assert.equal(detectBotQuery('/vision', [], config()), '');
});

test('detectBotQuery: resposta do próprio bot é ignorada (anti-loop)', () => {
  const reply = `🤖 *GitVisão* — resultado para: _segurança_\n\n1. *owner/repo*`;
  assert.equal(detectBotQuery(reply, [`${OWNER}@s.whatsapp.net`], config()), null);
  assert.equal(detectBotQuery(reply + ' vision', [], config()), null);
});

test('detectBotQuery: mensagem comum no grupo não aciona', () => {
  assert.equal(detectBotQuery('bom dia pessoal', [], config()), null);
  assert.equal(detectBotQuery('', [], config()), null);
});

// ------------------------------------------------------------------ formatBotReply

test('formatBotReply: lista resultados com link do repo e da busca', () => {
  const text = formatBotReply(
    'segurança',
    {
      items: [item('owner/repo', 12300, 'Scanner de vulnerabilidades'), item('dono/outro', 42)],
      total: 14,
      query: null
    } as BotSearchResult,
    config()
  );
  assert.match(text, /^🤖 \*GitVisão\* — resultado para: _segurança_/);
  assert.match(text, /1\. \*owner\/repo\* ⭐ 12,3 mil/);
  assert.match(text, /Scanner de vulnerabilidades/);
  assert.match(text, /https:\/\/vision\.24hs\.eu\.org\/\?repo=owner\/repo/);
  assert.match(text, /2\. \*dono\/outro\* ⭐ 42/);
  assert.match(text, /Ver os 14 resultados no site:\nhttps:\/\/vision\.24hs\.eu\.org\/\?q=seguran%C3%A7a/);
  assert.ok(text.length <= 1200);
});

test('formatBotReply: respeita maxResults e o limite de caracteres', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    item(`owner/repo-${i}`, 5, 'x'.repeat(200))
  );
  const text = formatBotReply('dados', { items: many, total: 10, query: null }, config({ maxResults: 10 }));
  assert.ok(text.length <= 1200, `tamanho ${text.length}`);
  assert.match(text, /1\. \*owner\/repo-0\*/);
});

test('formatBotReply: zero resultados traz dica e link para a busca', () => {
  const text = formatBotReply('xyzzy', { items: [], total: 0, query: null }, config());
  assert.match(text, /nada encontrado para: _xyzzy_/);
  assert.match(text, /Tente outras palavras/);
  assert.match(text, /https:\/\/vision\.24hs\.eu\.org\/\?q=xyzzy/);
});

test('formatBotReply: pergunta vazia devolve a ajuda de uso', () => {
  const text = formatBotReply('', { items: [], total: 0, query: null }, config());
  assert.match(text, /como perguntar/);
  assert.match(text, /\/vision segurança/);
});

// ------------------------------------------------------------------ handleBotWebhook

async function setup(botPatch: Partial<BotConfig> = {}, groups = [GROUP]) {
  const { db } = createSqliteD1();
  const env = { DB: db } as any;
  await saveBotConfig(db, { enabled: true, ownerNumber: OWNER, secret: SECRET, ...botPatch }, env);
  await saveIngestConfig(
    db,
    {
      enabled: true,
      baseUrl: 'https://evo.example.test',
      apiKey: 'key-fake',
      instance: 'inst-fake',
      groups: groups.map((jid) => ({ jid, name: 'Grupo', enabled: true }))
    },
    env
  );
  const sent: Array<{ jid: string; text: string; quoted?: unknown; target: unknown }> = [];
  const searches: string[] = [];
  let now = NOW_MS;
  const deps: Partial<BotDeps> = {
    search: async (_db, question) => {
      searches.push(question);
      return { items: [item('owner/repo', 1500)], total: 1, query: null };
    },
    sendText: async (target, jid, text, quoted) => {
      sent.push({ jid, text, quoted, target });
    },
    now: () => now
  };
  return {
    db,
    env,
    sent,
    searches,
    deps,
    advance: (ms: number) => {
      now += ms;
    }
  };
}

function payload(overrides: Record<string, any> = {}, msgOverrides: Record<string, any> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'inst-fake',
    data: {
      key: { remoteJid: GROUP, fromMe: false, id: 'MSG-1', participant: '5511888888888@s.whatsapp.net' },
      pushName: 'Fulano',
      message: { conversation: '/vision segurança', ...msgOverrides },
      messageTimestamp: NOW_S,
      ...overrides
    }
  };
}

function req(body: unknown, secret = SECRET): Request {
  return new Request(`https://worker.test/api/bot/webhook/${secret}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('webhook: segredo errado responde 403 e não envia nada', async () => {
  const s = await setup();
  const res = await handleBotWebhook(req(payload(), 'errado'), s.env, s.deps);
  assert.equal(res.status, 403);
  assert.equal(s.sent.length, 0);
});

test('webhook: segredo gerado na primeira leitura é estável', async () => {
  const { db } = createSqliteD1();
  const first = await getBotConfig(db);
  const second = await getBotConfig(db);
  assert.match(first.secret, /^[a-f0-9]{24}$/);
  assert.equal(first.secret, second.secret);
});

test('webhook: mensagem fora de grupo é ignorada', async () => {
  const s = await setup();
  const body = payload();
  body.data.key.remoteJid = '5511888888888@s.whatsapp.net';
  const res = await handleBotWebhook(req(body), s.env, s.deps);
  const json = (await res.json()) as any;
  assert.equal(res.status, 200);
  assert.equal(json.handled, false);
  assert.equal(json.reason, 'not_group');
  assert.equal(s.sent.length, 0);
});

test('webhook: grupo não autorizado é ignorado', async () => {
  const s = await setup({}, [OTHER_GROUP]);
  const json = (await (await handleBotWebhook(req(payload()), s.env, s.deps)).json()) as any;
  assert.equal(json.reason, 'group_not_allowed');
  assert.equal(s.sent.length, 0);
});

test('webhook: allowAllGroups libera grupo fora da lista', async () => {
  const s = await setup({ allowAllGroups: true }, []);
  const json = (await (await handleBotWebhook(req(payload()), s.env, s.deps)).json()) as any;
  assert.equal(json.handled, true);
  assert.equal(s.sent.length, 1);
});

test('webhook: mesma mensagem duas vezes responde só uma vez', async () => {
  const s = await setup({ cooldownSeconds: 0 });
  await handleBotWebhook(req(payload()), s.env, s.deps);
  const again = (await (await handleBotWebhook(req(payload()), s.env, s.deps)).json()) as any;
  assert.equal(again.reason, 'duplicate');
  assert.equal(s.sent.length, 1);
});

test('webhook: cooldown por grupo impede rajada de respostas', async () => {
  const s = await setup({ cooldownSeconds: 8 });
  await handleBotWebhook(req(payload()), s.env, s.deps);
  const body2 = payload({}, { conversation: '/vision python' });
  body2.data.key.id = 'MSG-2';
  const second = (await (await handleBotWebhook(req(body2), s.env, s.deps)).json()) as any;
  assert.equal(second.reason, 'cooldown');
  s.advance(9_000);
  const body3 = payload({}, { conversation: '/vision python' });
  body3.data.key.id = 'MSG-3';
  await handleBotWebhook(req(body3), s.env, s.deps);
  assert.equal(s.sent.length, 2);
});

test('webhook: mensagem antiga (mais de 5 min) é ignorada', async () => {
  const s = await setup();
  const body = payload({ messageTimestamp: NOW_S - 600 });
  const json = (await (await handleBotWebhook(req(body), s.env, s.deps)).json()) as any;
  assert.equal(json.reason, 'too_old');
  assert.equal(s.sent.length, 0);
});

test('webhook: caminho feliz envia para o remoteJid com link ?q= e citação', async () => {
  const s = await setup();
  const body = payload();
  const res = await handleBotWebhook(req(body), s.env, s.deps);
  const json = (await res.json()) as any;
  assert.equal(res.status, 200);
  assert.deepEqual(json, { ok: true, handled: true, reason: 'replied' });
  assert.deepEqual(s.searches, ['segurança']);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].jid, GROUP);
  assert.match(s.sent[0].text, /\?q=seguran%C3%A7a/);
  assert.match(s.sent[0].text, /\?repo=owner\/repo/);
  assert.deepEqual(s.sent[0].quoted, { key: body.data.key, message: body.data.message });
  assert.deepEqual(s.sent[0].target, {
    baseUrl: 'https://evo.example.test',
    apiKey: 'key-fake',
    instance: 'inst-fake'
  });
});

test('webhook: aceita evento MESSAGES_UPSERT em array', async () => {
  const s = await setup();
  const body = { event: 'MESSAGES_UPSERT', data: [payload().data] };
  const json = (await (await handleBotWebhook(req(body), s.env, s.deps)).json()) as any;
  assert.equal(json.handled, true);
  assert.equal(s.sent.length, 1);
});

test('webhook: resposta do próprio bot (fromMe) não gera nova resposta', async () => {
  const s = await setup();
  const body = payload({}, { conversation: '🤖 *GitVisão* — resultado para: _x_' });
  body.data.key.fromMe = true;
  const json = (await (await handleBotWebhook(req(body), s.env, s.deps)).json()) as any;
  assert.equal(json.handled, false);
  assert.equal(json.reason, 'not_trigger');
  assert.equal(s.sent.length, 0);
});

test('webhook: ajuda quando o gatilho vem sem pergunta', async () => {
  const s = await setup();
  await handleBotWebhook(req(payload({}, { conversation: '/vision' })), s.env, s.deps);
  assert.equal(s.searches.length, 0);
  assert.match(s.sent[0].text, /como perguntar/);
});

test('webhook: evento que não é de mensagem é ignorado', async () => {
  const s = await setup();
  const json = (await (await handleBotWebhook(req({ event: 'connection.update', data: {} }), s.env, s.deps)).json()) as any;
  assert.equal(json.reason, 'event_ignored');
});

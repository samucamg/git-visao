// Bot com IA: resposta ancorada nos repositórios, links montados pelo código, fallback e segundo plano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEFAULT_BOT_CONFIG, formatAiReply, handleBotWebhook, saveBotConfig, type BotDeps } from '../src/bot.ts';
import { answerWithAi, buildAiUserPrompt } from '../src/bot-ai.ts';
import { saveIngestConfig } from '../src/ingest-db.ts';
import { saveRuntimeSettings, invalidateSettingsCache } from '../src/db.ts';
import { createSqliteD1 } from './helpers/sqlite-d1.ts';

const GROUP = '120363000000000001@g.us';
const SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const NOW_MS = Date.UTC(2026, 10, 22, 12, 0, 0);

const KOPIA = {
  full_name: 'kopia/kopia',
  repo_key: 'kopia/kopia',
  repo_url: 'https://github.com/kopia/kopia',
  hook_title: 'BACKUP CRIPTOGRAFADO E INCREMENTAL',
  stars: 14786,
  category: 'Backend, Bancos & Storage',
  description: 'Cross-platform backup tool',
  intro_text: 'Backups rápidos, incrementais e criptografados.'
};

async function setup(deps: Partial<BotDeps>) {
  const { db } = createSqliteD1();
  const env = { DB: db } as any;
  await saveBotConfig(db, { enabled: true, secret: SECRET }, env);
  await saveIngestConfig(
    db,
    { enabled: true, baseUrl: 'https://evo.example.test', apiKey: 'k', instance: 'i', groups: [{ jid: GROUP, name: 'G', enabled: true }] },
    env
  );
  const sent: string[] = [];
  const full: Partial<BotDeps> = {
    search: async () => ({ items: [KOPIA], total: 4, query: null }),
    sendText: async (_t, _j, text) => {
      sent.push(text);
    },
    now: () => NOW_MS,
    ...deps
  };
  return { db, env, sent, deps: full };
}

function req(text: string, id = 'MSG-AI-1'): Request {
  return new Request(`https://worker.test/api/bot/webhook/${SECRET}`, {
    method: 'POST',
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: { remoteJid: GROUP, fromMe: true, id },
        message: { conversation: text },
        messageTimestamp: Math.floor(NOW_MS / 1000)
      }
    })
  });
}

test('bot: busca padrão usa import estático (o Worker não empacota import(variável))', () => {
  const src = readFileSync(new URL('../src/bot.ts', import.meta.url), 'utf-8');
  assert.ok(!/await import\(/.test(src), 'bot.ts não pode usar import dinâmico');
  assert.ok(src.includes("from './search.ts'"));
});

test('bot: com IA, responde o texto da IA + links montados pelo código', async () => {
  const questions: string[] = [];
  const s = await setup({
    answer: async (_db, _env, q, items) => {
      questions.push(q);
      assert.equal(items[0].full_name, 'kopia/kopia');
      return 'O *Kopia* é uma ferramenta de backup criptografado e incremental.';
    }
  });
  const json = (await (await handleBotWebhook(req('/vision o que é o kopia?'), s.env, s.deps)).json()) as any;
  assert.equal(json.handled, true);
  assert.deepEqual(questions, ['o que é o kopia']);
  const text = s.sent[0];
  assert.ok(text.includes('O *Kopia* é uma ferramenta de backup'));
  assert.ok(text.includes('https://vision.24hs.eu.org/?repo=kopia/kopia'));
  assert.ok(text.includes('Mais 3 resultados'));
});

test('bot: se a IA falhar ou não estiver configurada, cai na lista simples', async () => {
  const s = await setup({ answer: async () => null });
  await handleBotWebhook(req('/vision kopia'), s.env, s.deps);
  assert.ok(s.sent[0].includes('resultado para'));
  const s2 = await setup({
    answer: async () => {
      throw new Error('timeout');
    }
  });
  await handleBotWebhook(req('/vision kopia'), s2.env, s2.deps);
  assert.ok(s2.sent[0].includes('resultado para'));
});

test('bot: useAi desligado não chama a IA', async () => {
  let called = false;
  const s = await setup({
    answer: async () => {
      called = true;
      return 'x';
    }
  });
  await saveBotConfig(s.db, { useAi: false }, s.env);
  await handleBotWebhook(req('/vision kopia'), s.env, s.deps);
  assert.equal(called, false);
  assert.equal(DEFAULT_BOT_CONFIG.useAi, true);
});

test('bot: com ctx do Worker responde na hora e processa em segundo plano', async () => {
  const s = await setup({ answer: async () => 'Resposta da IA.' });
  const pending: Promise<unknown>[] = [];
  const res = await handleBotWebhook(req('/vision kopia'), s.env, s.deps, { waitUntil: (p) => pending.push(p) });
  const json = (await res.json()) as any;
  assert.equal(json.reason, 'queued');
  assert.equal(s.sent.length, 0, 'ainda não enviou');
  await Promise.all(pending);
  assert.equal(s.sent.length, 1);
  assert.ok(s.sent[0].includes('Resposta da IA.'));
});

test('IA: remove URLs inventadas e usa o OmniRoute configurado', async () => {
  invalidateSettingsCache();
  const { db } = createSqliteD1();
  const env = { DB: db } as any;
  await saveRuntimeSettings(db, { omnirouteBaseUrl: 'https://omni.test/v1', omnirouteApiKey: 'sk-test', omnirouteModel: 'gemini-x' }, env);
  let seen: any = null;
  const fakeFetch = async (url: string, init?: RequestInit) => {
    seen = { url, body: JSON.parse(String(init?.body)) };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '**Kopia** faz backup. Veja https://kopia.io agora.' } }] }),
      { status: 200 }
    );
  };
  const text = await answerWithAi(db, env, 'o que é o kopia?', [KOPIA], fakeFetch as never);
  assert.equal(seen.url, 'https://omni.test/v1/chat/completions');
  assert.equal(seen.body.model, 'gemini-x');
  assert.ok(seen.body.messages[1].content.includes('kopia/kopia'));
  assert.ok(text && !text.includes('http'), 'sem URL');
  assert.ok(text!.startsWith('*Kopia*'), 'negrito convertido para WhatsApp');
});

test('IA: sem chave configurada devolve null (usa a lista)', async () => {
  invalidateSettingsCache();
  const { db } = createSqliteD1();
  const text = await answerWithAi(db, { DB: db } as any, 'x', [KOPIA], (async () => {
    throw new Error('não devia chamar');
  }) as never);
  assert.equal(text, null);
});

test('IA: prompt leva os dados do catálogo e formatAiReply limita a 3 links', () => {
  const p = buildAiUserPrompt('backup', [KOPIA]);
  assert.ok(p.includes('kopia/kopia') && p.includes('incrementais'));
  const many = { items: [1, 2, 3, 4].map((n) => ({ ...KOPIA, full_name: `o/r${n}` })), total: 4, query: null };
  const out = formatAiReply('backup', 'Texto.', many, { ...DEFAULT_BOT_CONFIG });
  assert.equal((out.match(/\?repo=/g) || []).length, 3);
});

test('IA: testAiConnection informa sucesso, erro HTTP e configuração vazia sem vazar a chave', async () => {
  const { testAiConnection } = await import('../src/bot-ai.ts');
  invalidateSettingsCache();
  const { db } = createSqliteD1();
  const env = { DB: db } as any;
  const vazio = await testAiConnection(db, env, (async () => new Response('{}')) as never);
  assert.equal(vazio.ok, false);
  assert.match(String(vazio.error), /vazi/);

  await saveRuntimeSettings(db, { omnirouteBaseUrl: 'https://omni.test/v1', omnirouteApiKey: 'sk-segredo-123', omnirouteModel: 'm1' }, env);
  const ok = await testAiConnection(db, env, (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 })) as never);
  assert.equal(ok.ok, true);
  assert.equal(ok.reply, 'OK');
  assert.equal(ok.endpoint, 'https://omni.test/v1/chat/completions');

  const ruim = await testAiConnection(db, env, (async () =>
    new Response(JSON.stringify({ error: { message: 'Invalid API key sk-segredo-123' } }), { status: 401 })) as never);
  assert.equal(ruim.ok, false);
  assert.equal(ruim.status, 401);
  assert.ok(!JSON.stringify(ruim).includes('sk-segredo-123'), 'não vaza a chave');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { createSqliteD1 } from './helpers/sqlite-d1.ts';
import { normalizeText, parseSearchQuery, searchRepositories } from '../src/search.ts';

interface SeedRepo {
  fullName: string;
  category: string;
  language: string;
  stars: number;
  topics: string[];
  description: string;
  hook: string;
  daysAgo: number;
}

// Data relativa a "agora", para os testes de recência não envelhecerem.
function stamp(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

const SEEDS: SeedRepo[] = [
  { fullName: 'acme/pentest-kit', category: 'Cibersegurança & Pentest', language: 'Python', stars: 500, topics: ['pentest', 'security'], description: 'Kit de pentest e ferramentas de segurança', hook: 'Teste de invasão', daysAgo: 2 },
  { fullName: 'acme/vault-secrets', category: 'Cibersegurança & Pentest', language: 'Go', stars: 300, topics: ['secrets'], description: 'Gerenciamento de segredos e criptografia', hook: 'Cofre de segredos', daysAgo: 20 },
  { fullName: 'acme/evolution-zap', category: 'Apps & Produtividade', language: 'TypeScript', stars: 2000, topics: ['whatsapp', 'bot'], description: 'API de WhatsApp multi-dispositivo', hook: 'Automatize seu WhatsApp', daysAgo: 1 },
  { fullName: 'acme/media-player', category: 'Apps & Produtividade', language: 'TypeScript', stars: 900, topics: ['media'], description: 'Player de media local', hook: 'Reproduza seus arquivos', daysAgo: 10 },
  { fullName: 'acme/llm-router', category: 'Agentes & Automação IA', language: 'Python', stars: 1200, topics: ['llm', 'ai'], description: 'Roteador de LLMs e agentes', hook: 'Um gateway para modelos', daysAgo: 4 },
  { fullName: 'acme/crm-lite', category: 'SaaS & CRM Self-Hosted', language: 'PHP', stars: 700, topics: ['crm', 'self-hosted'], description: 'CRM self-hosted para vendas', hook: 'Seu CRM em casa', daysAgo: 113 },
  { fullName: 'acme/rust-cli', category: 'Terminal, CLI & DX', language: 'Rust', stars: 400, topics: ['cli', 'terminal'], description: 'Ferramenta de linha de comando', hook: 'Terminal rápido', daysAgo: 3 },
  { fullName: 'acme/video-tools', category: 'Outros', language: 'Python', stars: 100, topics: ['ffmpeg'], description: 'Edição de vídeo com FFmpeg', hook: 'Vídeos na linha de comando', daysAgo: 5 },
  { fullName: 'acme/pg-admin', category: 'Backend, Bancos & Storage', language: 'Go', stars: 250, topics: ['postgres', 'database'], description: 'Administração de bancos PostgreSQL', hook: 'Painel de banco', daysAgo: 6 }
];

function seed(raw: DatabaseSync): void {
  const stmt = raw.prepare(
    `INSERT INTO repositories (
      repo_key, full_name, owner, name, repo_url, description, stars, language, topics_json,
      last_commit_at, category, template_type, hook_title, intro_text, features_json,
      scenario_title, scenario_intro, scenario_prompt, scenario_steps_json, killer_title,
      killer_text, summary_text, punchline, whatsapp_text, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app-tool', ?, ?, '[]', 's', 's', 's', '[]', 'k', 'k', 's', 'p', 'w', ?)`
  );
  for (const r of SEEDS) {
    const [owner, name] = r.fullName.split('/');
    const at = stamp(r.daysAgo);
    stmt.run(
      r.fullName.toLowerCase(),
      r.fullName,
      owner,
      name,
      `https://github.com/${r.fullName}`,
      r.description,
      r.stars,
      r.language,
      JSON.stringify(r.topics),
      at,
      r.category,
      r.hook,
      `${r.description}.`,
      at
    );
  }
}

function names(items: { full_name: string }[]): string[] {
  return items.map((i) => i.full_name);
}

async function collectAll(db: D1Database, opts: Parameters<typeof searchRepositories>[1]): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await searchRepositories(db, { ...opts, cursor, limit: 2 });
    out.push(...names(page.items));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return out;
}

test('normalizeText remove acentos e põe em minúsculas', () => {
  assert.equal(normalizeText('Segurança'), 'seguranca');
  assert.equal(normalizeText('INTELIGÊNCIA Artificial'), 'inteligencia artificial');
});

test('parseSearchQuery: pergunta natural vira conceito de segurança', () => {
  const p = parseSearchQuery('temos repositórios voltados a segurança?');
  assert.deepEqual(p.terms, ['seguranca']);
  assert.ok(p.categoryHints.includes('Cibersegurança & Pentest'));
  assert.ok(p.concepts[0].includes('pentest'));
});

test('parseSearchQuery: remove menção e comando do bot', () => {
  const p = parseSearchQuery('@Samuel Santos/vision tem algo de whatsapp');
  assert.deepEqual(p.terms, ['whatsapp']);
  const bang = parseSearchQuery('!vision whatsapp');
  assert.deepEqual(bang.terms, ['whatsapp']);
});

test('parseSearchQuery: frase multi-palavra e dica de categoria', () => {
  const p = parseSearchQuery('quero algo de banco de dados');
  assert.deepEqual(p.terms, ['banco de dados']);
  assert.ok(p.categoryHints.includes('Backend, Bancos & Storage'));
});

test('parseSearchQuery: linguagem vira dica de linguagem', () => {
  assert.equal(parseSearchQuery('projetos em python').languageHint, 'Python');
  assert.equal(parseSearchQuery('algo em golang').languageHint, 'Go');
  assert.equal(parseSearchQuery('segurança').languageHint, undefined);
});

test('parseSearchQuery: só stopwords não gera termos', () => {
  const p = parseSearchQuery('o que tem de bom?');
  assert.deepEqual(p.terms, []);
  assert.deepEqual(p.concepts, []);
});

test('parseSearchQuery: "open source" é ignorado como filler', () => {
  assert.deepEqual(parseSearchQuery('open source').terms, []);
});

test('busca por pergunta natural traz os repos de segurança primeiro', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { q: 'temos repositórios voltados a segurança?' });
  assert.equal(res.total, 2);
  assert.deepEqual(new Set(names(res.items)), new Set(['acme/pentest-kit', 'acme/vault-secrets']));
  assert.ok(res.query);
  assert.equal(res.query?.terms[0], 'seguranca');
});

test('acentos não importam: seguranca == segurança', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const a = await searchRepositories(db, { q: 'seguranca' });
  const b = await searchRepositories(db, { q: 'segurança' });
  assert.deepEqual(names(a.items), names(b.items));
  assert.equal(a.total, 2);
});

test('mensagem com menção e "tem algo de" acha o whatsapp', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { q: '@Samuel Santos/vision tem algo de whatsapp' });
  assert.equal(res.items[0].full_name, 'acme/evolution-zap');
  assert.equal(res.total, 1);
});

test('"ia" não casa com "media" (palavra inteira)', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { q: 'ia' });
  const found = names(res.items);
  assert.ok(found.includes('acme/llm-router'));
  assert.ok(!found.includes('acme/media-player'));
});

test('filtro de linguagem é case-insensitive', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { language: 'go' });
  assert.equal(res.total, 2);
  assert.ok(res.items.every((i) => i.language === 'Go'));
  assert.equal(res.byLanguage.Go, 2);
  assert.ok(!('Open Source' in res.byLanguage));
});

test('paginação por cursor percorre todo o catálogo sem repetir', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const all = await collectAll(db, {});
  assert.equal(all.length, SEEDS.length);
  assert.equal(new Set(all).size, SEEDS.length);
});

test('sem termos úteis, lista tudo ordenado por mais recente', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { q: 'o que tem de bom?', limit: 100 });
  assert.equal(res.total, SEEDS.length);
  assert.equal(res.items[0].full_name, 'acme/evolution-zap');
  assert.deepEqual(res.query?.terms, []);
  const sorted = [...res.items].map((i) => i.updated_at ?? '');
  const expected = [...sorted].sort().reverse();
  assert.deepEqual(sorted, expected);
});

test('recentDays exclui repositórios antigos', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { recentDays: 30, limit: 100 });
  assert.ok(!names(res.items).includes('acme/crm-lite'));
  assert.equal(res.total, SEEDS.length - 1);
});

test('ordenação por estrelas e por nome', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const byStars = await searchRepositories(db, { sort: 'stars', limit: 100 });
  assert.equal(byStars.items[0].full_name, 'acme/evolution-zap');
  const byName = await searchRepositories(db, { sort: 'name', limit: 100 });
  assert.equal(byName.items[0].full_name, 'acme/crm-lite');
});

test('categoria e cursor inválido são tolerados', async () => {
  const { db, raw } = createSqliteD1();
  seed(raw);
  const res = await searchRepositories(db, { category: 'Cibersegurança & Pentest', cursor: '%%%' });
  assert.equal(res.total, 2);
  assert.equal(res.byCategory['Cibersegurança & Pentest'], 2);
});

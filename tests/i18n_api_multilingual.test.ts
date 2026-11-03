import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1 } from './helpers/sqlite-d1.ts';
import { ensureDatabaseInitialized } from '../src/db.ts';
import worker from '../src/index.ts';
import type { Env } from '../src/types.ts';

test('i18n multilingual API tests: /api/repos and /api/check with lang=pt, lang=en, lang=es and fallback resilience', async () => {
  const { db, raw } = createSqliteD1();
  const env: Env = {
    DB: db,
    ADMIN_PASSWORD: 'admin'
  };

  await ensureDatabaseInitialized(db, env);

  // Inserir um repositório de teste com dados em português
  raw.prepare(`
    INSERT OR REPLACE INTO repositories (
      repo_key, full_name, owner, name, repo_url, description,
      stars, forks, language, topics_json, last_commit_at,
      category, template_type, hook_title, intro_text, warning_note,
      features_json, scenario_title, scenario_intro, scenario_prompt,
      scenario_steps_json, scenario_outro, killer_title, killer_text,
      summary_text, punchline, whatsapp_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'testowner/testrepo',
    'testowner/testrepo',
    'testowner',
    'testrepo',
    'https://github.com/testowner/testrepo',
    'A wonderful multilingual test repository',
    150,
    15,
    'TypeScript',
    '["ai", "test"]',
    new Date().toISOString(),
    'Agentes & Automação IA',
    'ai-agent-automation',
    '⚡ O MOTOR DE IA ZERO-CONFIG PARA SEUS AGENTES E AUTOMAÇÕES:',
    'Uma solução robusta e inteligente projetada para automatizar fluxos complexos.',
    '',
    '["🤖 Execução autônoma de tarefas.", "🔌 Integração nativa MCP."]',
    '🧠 PENSE ASSIM:',
    'Quando você precisa processar dados:',
    'Analise o repositório.',
    '["O agente varre o contexto.", "Aplica regras."]',
    'Eliminando horas de trabalho.',
    '🤯 O pulo do gato?',
    'Elimina a necessidade de pipelines complexos.',
    'Desenvolvedores e arquitetos.',
    '💡 Menos boilerplate.',
    'Texto WhatsApp padrão em português.'
  );

  // 1. Testar GET /api/repos (sem parâmetro / lang=pt)
  const resPt = await worker.fetch(new Request('https://gitvisao.local/api/repos'), env);
  assert.equal(resPt.status, 200);
  const dataPt = (await resPt.json()) as any;
  assert.ok(dataPt.ok);
  const repoPt = dataPt.items.find((r: any) => r.repo_key === 'testowner/testrepo');
  assert.ok(repoPt);
  assert.ok(repoPt.hook_title.includes('O MOTOR DE IA') || repoPt.hook_title.includes('ZERO-CONFIG'));

  // 2. Testar GET /api/repos?lang=en (Inglês)
  const resEn = await worker.fetch(new Request('https://gitvisao.local/api/repos?lang=en'), env);
  assert.equal(resEn.status, 200);
  const dataEn = (await resEn.json()) as any;
  assert.ok(dataEn.ok);
  const repoEn = dataEn.items.find((r: any) => r.repo_key === 'testowner/testrepo');
  assert.ok(repoEn);
  assert.ok(repoEn.whatsapp_text.includes('RECOMMENDED FOR WHO') || repoEn.whatsapp_text.includes('THINK OF IT LIKE THIS'));

  // 3. Testar GET /api/repos?lang=es (Espanhol)
  const resEs = await worker.fetch(new Request('https://gitvisao.local/api/repos?lang=es'), env);
  assert.equal(resEs.status, 200);
  const dataEs = (await resEs.json()) as any;
  assert.ok(dataEs.ok);
  const repoEs = dataEs.items.find((r: any) => r.repo_key === 'testowner/testrepo');
  assert.ok(repoEs);
  assert.ok(repoEs.whatsapp_text.includes('RECOMENDADO PARA QUIEN') || repoEs.whatsapp_text.includes('PIÉNSALO ASÍ'));

  // 4. Testar GET /api/check?repo=testowner/testrepo&lang=en
  const checkEn = await worker.fetch(new Request('https://gitvisao.local/api/check?repo=testowner/testrepo&lang=en'), env);
  assert.equal(checkEn.status, 200);
  const checkDataEn = (await checkEn.json()) as any;
  assert.ok(checkDataEn.ok);
  assert.equal(checkDataEn.exists, true);
  assert.ok(checkDataEn.repo.whatsapp_text.includes('RECOMMENDED FOR WHO'));

  // 5. Testar GET /api/check?repo=testowner/testrepo&lang=es
  const checkEs = await worker.fetch(new Request('https://gitvisao.local/api/check?repo=testowner/testrepo&lang=es'), env);
  assert.equal(checkEs.status, 200);
  const checkDataEs = (await checkEs.json()) as any;
  assert.ok(checkDataEs.ok);
  assert.equal(checkDataEs.exists, true);
  assert.ok(checkDataEs.repo.whatsapp_text.includes('RECOMENDADO PARA QUIEN'));

  // 6. Testar fallback resiliente para repositório sem dados completos / transientes
  raw.prepare(`
    INSERT OR REPLACE INTO repositories (
      repo_key, full_name, owner, name, repo_url, description,
      stars, forks, language, topics_json, last_commit_at,
      category, template_type, hook_title, intro_text, warning_note,
      features_json, scenario_title, scenario_intro, scenario_prompt,
      scenario_steps_json, scenario_outro, killer_title, killer_text,
      summary_text, punchline, whatsapp_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'minimal/repo',
    'minimal/repo',
    'minimal',
    'repo',
    'https://github.com/minimal/repo',
    'Minimal repo',
    10,
    1,
    'Go',
    '[]',
    new Date().toISOString(),
    'Infra, Gateways & Edge',
    'infra-gateway',
    'Minimal Hook',
    'Minimal Intro',
    '',
    '[]',
    'Scenario',
    'Scenario Intro',
    'Prompt',
    '[]',
    'Outro',
    'Killer',
    'Killer Text',
    'Summary',
    'Punchline',
    'WhatsApp Minimal Text'
  );

  const fallbackEn = await worker.fetch(new Request('https://gitvisao.local/api/check?repo=minimal/repo&lang=en'), env);
  assert.equal(fallbackEn.status, 200);
  const fallbackDataEn = (await fallbackEn.json()) as any;
  assert.ok(fallbackDataEn.exists);
  assert.ok(fallbackDataEn.repo.whatsapp_text.length > 0);
  assert.ok(fallbackDataEn.repo.whatsapp_text.includes('RECOMMENDED FOR WHO') || fallbackDataEn.repo.whatsapp_text.includes('TECH SPECS'));
});

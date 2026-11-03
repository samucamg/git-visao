import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTemplateType, detectCategory } from '../src/templates.ts';
import { generateFallbackSummary } from '../src/ai.ts';
import type { GitHubRepoMetadata } from '../src/types.ts';

test('Regressão: repositórios de agentes e skills não são confundidos com infra-gateway', () => {
  const cases: Array<{ meta: GitHubRepoMetadata; expectedTemplate: string; expectedCategory: string }> = [
    {
      meta: {
        fullName: 'amosblomqvist/learnharness',
        name: 'learnharness',
        description: 'Agent harness for learning difficult things.',
        language: 'TypeScript',
        stars: 5000,
        forks: 100,
        openIssues: 5,
        updatedAt: '2026-10-20T00:00:00Z',
        topics: ['agent', 'learning', 'ai'],
        readmeExcerpt: 'Run with docker and worker backend'
      },
      expectedTemplate: 'ai-agent-automation',
      expectedCategory: 'Agentes & Automação IA'
    },
    {
      meta: {
        fullName: 'Jakeschincariol/replica-skill',
        name: 'replica-skill',
        description: 'Eleven free Claude skills that clone any app: reverse-engineer it',
        language: 'Python',
        stars: 7100,
        forks: 50,
        openIssues: 2,
        updatedAt: '2026-10-20T00:00:00Z',
        topics: ['claude', 'skill', 'ai'],
        readmeExcerpt: 'docker compose up and proxy settings'
      },
      expectedTemplate: 'ai-agent-automation',
      expectedCategory: 'Agentes & Automação IA'
    },
    {
      meta: {
        fullName: 'arnabbagxd/Brand-building-skills',
        name: 'Brand-building-skills',
        description: 'Brand building skills for Claude Code and AI agents',
        language: 'Shell',
        stars: 200,
        forks: 10,
        openIssues: 1,
        updatedAt: '2026-10-20T00:00:00Z',
        topics: ['claude-code', 'skills', 'ai-agent'],
        readmeExcerpt: 'Run on cloudflare worker edge'
      },
      expectedTemplate: 'ai-agent-automation',
      expectedCategory: 'Agentes & Automação IA'
    },
    {
      meta: {
        fullName: 'goodnight000/api-anything',
        name: 'api-anything',
        description: 'Turn any website into an API your agent can call.',
        language: 'TypeScript',
        stars: 2200,
        forks: 30,
        openIssues: 0,
        updatedAt: '2026-10-20T00:00:00Z',
        topics: ['api', 'agent'],
        readmeExcerpt: 'Proxy gateway server'
      },
      expectedTemplate: 'ai-agent-automation',
      expectedCategory: 'Agentes & Automação IA'
    }
  ];

  for (const c of cases) {
    const tpl = detectTemplateType(c.meta);
    const cat = detectCategory(c.meta, tpl);
    assert.equal(tpl, c.expectedTemplate, `Falha no template de ${c.meta.fullName}`);
    assert.equal(cat, c.expectedCategory, `Falha na categoria de ${c.meta.fullName}`);

    const summary = generateFallbackSummary(c.meta, tpl);
    // Verifica que não usa as frases clichês proibidas
    assert.ok(!summary.introText.includes('Construído especificamente para resolver gargalos de resiliência e tráfego crítico'),
      `introText repetitiva encontrada em ${c.meta.fullName}`);
    assert.ok(!summary.hookTitle.includes('O GATEWAY QUE SALVA A VIDA'),
      `hookTitle de gateway incorreto em ${c.meta.fullName}`);
    assert.ok(!summary.hookTitle.includes('E SE NENHUMA SENHA OU CHAVE DE API NUNCA MAIS VAZASSE'),
      `hookTitle de senha vazada incorreto em ${c.meta.fullName}`);
  }
});


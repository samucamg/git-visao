import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocalizedFallbackSummary } from '../src/templates_i18n.ts';
import type { GitHubRepoMetadata } from '../src/types.ts';

test('templates_i18n: generateLocalizedFallbackSummary generates localized summaries for pt, en, es', () => {
  const mockRepo: GitHubRepoMetadata = {
    repoKey: 'owner/test-repo',
    fullName: 'owner/test-repo',
    owner: 'owner',
    name: 'test-repo',
    repoUrl: 'https://github.com/owner/test-repo',
    description: 'A test repository for multilingual summaries',
    stars: 1250,
    forks: 120,
    language: 'TypeScript',
    topics: ['ai-agent', 'mcp'],
    lastCommitAt: '2026-11-01T00:00:00Z',
    readmeExcerpt: 'This is a test readme excerpt.'
  };

  const summaryPt = generateLocalizedFallbackSummary(mockRepo, 'ai-agent-automation', 'pt');
  assert.ok(summaryPt.hookTitle.includes('O MOTOR DE IA'), 'Hook title em PT deve estar correto');
  assert.ok(summaryPt.whatsappText.includes('FICHA TÉCNICA'), 'WhatsApp text em PT deve conter FICHA TÉCNICA');
  assert.ok(summaryPt.whatsappText.includes('1,3 mil estrelas no GitHub'), 'Stars em PT formatadas corretamente');

  const summaryEn = generateLocalizedFallbackSummary(mockRepo, 'ai-agent-automation', 'en');
  assert.ok(summaryEn.hookTitle.includes('THE ZERO-CONFIG EDGE RUNTIME'), 'Hook title em EN deve estar correto');
  assert.ok(summaryEn.whatsappText.includes('TECH SPECS'), 'WhatsApp text em EN deve conter TECH SPECS');
  assert.ok(summaryEn.whatsappText.includes('1.3k GitHub stars'), 'Stars em EN formatadas corretamente');

  const summaryEs = generateLocalizedFallbackSummary(mockRepo, 'ai-agent-automation', 'es');
  assert.ok(summaryEs.hookTitle.includes('EL RUNTIME DE IA'), 'Hook title em ES deve estar correto');
  assert.ok(summaryEs.whatsappText.includes('FICHA TÉCNICA'), 'WhatsApp text em ES deve conter FICHA TÉCNICA');
  assert.ok(summaryEs.whatsappText.includes('1.3k estrellas en GitHub'), 'Stars em ES formatadas corretamente');
});

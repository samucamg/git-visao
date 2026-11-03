import test from 'node:test';
import assert from 'node:assert';
import { isHarmfulRepository } from '../src/github.ts';
import { generateFallbackSummary } from '../src/ai.ts';
import type { GitHubRepoMetadata } from '../src/types.ts';

test('1. isHarmfulRepository detecta repositórios maliciosos/danosos', () => {
  const safeMeta: GitHubRepoMetadata = {
    repoKey: 'owner/safe-app',
    fullName: 'owner/safe-app',
    owner: 'owner',
    name: 'safe-app',
    repoUrl: 'https://github.com/owner/safe-app',
    description: 'A helpful productivity tool for developers',
    stars: 100,
    forks: 10,
    language: 'TypeScript',
    topics: ['cli', 'productivity'],
    lastCommitAt: new Date().toISOString(),
    readmeExcerpt: 'CLI tool to organize notes.'
  };

  const checkSafe = isHarmfulRepository(safeMeta);
  assert.strictEqual(checkSafe.isHarmful, false);

  const malwareMeta: GitHubRepoMetadata = {
    ...safeMeta,
    fullName: 'attacker/malware-trojan',
    description: 'Remote Access Trojan C2 server and malware loader',
    readmeExcerpt: 'Advanced trojan c2 framework with credential stealer.'
  };

  const checkHarmful = isHarmfulRepository(malwareMeta);
  assert.strictEqual(checkHarmful.isHarmful, true);
  assert.ok(checkHarmful.harmReason);
});

test('2. generateFallbackSummary rejeita repositório malicioso lançando erro', () => {
  const maliciousMeta: GitHubRepoMetadata = {
    repoKey: 'bad/exploit-kit',
    fullName: 'bad/exploit-kit',
    owner: 'bad',
    name: 'exploit-kit',
    repoUrl: 'https://github.com/bad/exploit-kit',
    description: 'Zero-day exploit kit and ransomware payload',
    stars: 1,
    forks: 0,
    language: 'Python',
    topics: ['exploit', 'ransomware'],
    lastCommitAt: new Date().toISOString(),
    readmeExcerpt: 'Zero-day exploit kit with botnet capabilities.'
  };

  assert.throws(() => {
    generateFallbackSummary(maliciousMeta);
  }, /Repositório recusado por violação das diretrizes de segurança/);
});

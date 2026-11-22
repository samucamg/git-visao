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

// Casos reais do catálogo (22/11/2026): a moderação deve barrar só o que é de fato malicioso.
test('moderação: não barra projetos legítimos por palavras fora de contexto', () => {
  const ok = (description: string, readmeExcerpt = '') =>
    isHarmfulRepository({ fullName: 'o/r', description, readmeExcerpt, topics: [] }).isHarmful;
  // "%C2%B7" (o "·" codificado dos selos do shields.io) era lido como "c2"
  assert.strictEqual(ok('Vector art tool in Rust', '<img src="https://img.shields.io/badge/macos%20%c2%b7%20windows-blue">'), false);
  assert.strictEqual(ok('', '![x](https://img.shields.io/badge/linux_%C2%B7_macos-24292f)'), false);
  // avisos ao usuário e ferramentas de defesa
  assert.strictEqual(ok('The agent that grows with you', 'If Windows Defender flags uv.exe as malware, add an exception'), false);
  assert.strictEqual(ok('Third-party plugins are not reviewed and may contain malware'), false);
  assert.strictEqual(ok('Autonomous anti-spam engine', 'blocks fraudulent schemes, phishing links and scams'), false);
  // ssh-keygen é ferramenta padrão
  assert.strictEqual(ok('DevOps assistant', 'instale git, ssh, ssh-keygen e scp'), false);
});

test('moderação: continua barrando malware real e passa a barrar burla de serviços pagos', () => {
  const bad = (description: string, readmeExcerpt = '') =>
    isHarmfulRepository({ fullName: 'o/r', description, readmeExcerpt, topics: [] }).isHarmful;
  assert.strictEqual(bad('Remote Access Trojan C2 server and malware loader'), true);
  assert.strictEqual(bad('Phishing kit with fake login pages'), true);
  assert.strictEqual(bad('Build your own malware with this framework'), true);
  assert.strictEqual(bad('Google AI Pro (5TB) Trial Activation CLI'), true);
  assert.strictEqual(bad('Unlimited free accounts generator'), true);
  assert.strictEqual(bad('Photoshop keygen and patch'), true);
});

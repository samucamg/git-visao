import test from 'node:test';
import assert from 'node:assert/strict';
import { isHarmfulRepository } from '../src/github.ts';
import { runIngest, type IngestDeps } from '../src/ingest.ts';
import { saveIngestConfig } from '../src/ingest-db.ts';
import { createSqliteD1 } from './helpers/sqlite-d1.ts';
import worker from '../src/index.ts';
import type { Env, GitHubRepoMetadata, RepoProbeResult } from '../src/types.ts';

const NOW_SEC = Math.floor(Date.now() / 1000);

test('1. isHarmfulRepository detects malicious vs benign repositories', () => {
  const benign = {
    fullName: 'owner/benign-tool',
    description: 'A wonderful open source project for developers',
    topics: ['typescript', 'productivity'],
    readmeExcerpt: 'Clean code and documentation.'
  };
  assert.equal(isHarmfulRepository(benign).isHarmful, false);

  const malicious = {
    fullName: 'hacker/ransomware-payload',
    description: 'Advanced ransomware tool for encrypting files and extorting victims',
    topics: ['malware', 'ransomware', 'trojan'],
    readmeExcerpt: 'Use this payload to infect systems.'
  };
  const res = isHarmfulRepository(malicious);
  assert.equal(res.isHarmful, true);
  assert.ok(res.harmReason);
});

test('2. Ingest flow automatically blocks and ignores malicious repositories', async () => {
  const sqlite = createSqliteD1();
  await saveIngestConfig(sqlite.db, {
    enabled: true,
    baseUrl: 'https://evolution.test',
    apiKey: 'key',
    instance: 'inst',
    groups: [{ jid: 'group1@g.us', name: 'Test Group', enabled: true }]
  });

  const deps: IngestDeps = {
    async fetchPage() {
      return {
        records: [
          { key: { id: 'm1' }, messageTimestamp: NOW_SEC, pushName: 'Alice', message: { conversation: 'check https://github.com/bad/ransomware-tool' } }
        ],
        pages: 1,
        total: 1
      };
    },
    async probe(fullName): Promise<RepoProbeResult> {
      return {
        kind: 'ok',
        fullName,
        repoKey: fullName.toLowerCase(),
        archived: false,
        stars: 10,
        description: 'Malicious ransomware malware tool',
        licenseSpdx: 'MIT',
        licenseType: 'permissive'
      };
    },
    async fetchMeta(fullName): Promise<GitHubRepoMetadata> {
      return {
        repoKey: fullName.toLowerCase(),
        fullName,
        owner: 'bad',
        name: 'ransomware-tool',
        repoUrl: `https://github.com/${fullName}`,
        description: 'Malicious ransomware malware tool',
        stars: 10,
        forks: 0,
        language: 'C',
        topics: ['malware', 'ransomware'],
        lastCommitAt: '2026-01-01T00:00:00Z',
        readmeExcerpt: 'Malicious payload',
        isHarmful: true,
        harmReason: 'Contém malware'
      };
    },
    async summarize() {
      throw new Error('Should not summarize harmful repo');
    },
    async save() {
      throw new Error('Should not save harmful repo to catalog');
    },
    nowMs: () => NOW_SEC * 1000
  };

  const summary = await runIngest(sqlite.db, undefined, deps, { trigger: 'manual' });
  assert.equal(summary.candidates, 1);
  assert.equal(summary.ignored, 1);
  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0].status, 'ignored');
  assert.equal(summary.items[0].reason, 'harmful_content');
});

test('3. POST /api/repos blocks malicious repository with HTTP 400', async () => {
  const { db } = await createSqliteD1();
  const env: Env = {
    DB: db,
    ADMIN_PASSWORD: 'admin'
  };

  await db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').bind('admin_password', 'admin').run();

  const originalFetch = global.fetch;
  global.fetch = async (url: string | RequestInfo) => {
    const urlStr = String(url);
    if (urlStr.includes('api.github.com/repos/bad/malware')) {
      return new Response(JSON.stringify({
        full_name: 'bad/malware',
        description: 'Malicious ransomware trojan botnet payload',
        stargazers_count: 5,
        topics: ['malware', 'ransomware'],
        license: { spdx_id: 'MIT', key: 'mit' }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const req = new Request('http://localhost/api/repos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': 'admin'
      },
      body: JSON.stringify({ repo: 'bad/malware' })
    });

    const res = await worker.fetch(req, env);
    const json = (await res.json()) as { ok: boolean; error?: string };
    assert.equal(res.status, 400);
    assert.equal(json.ok, false);
    assert.equal(json.error, 'Repositório bloqueado por conter conteúdo potencialmente danoso ou malicioso');
  } finally {
    global.fetch = originalFetch;
  }
});

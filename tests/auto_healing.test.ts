import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1 } from './helpers/sqlite-d1.ts';
import { ensureDatabaseInitialized } from '../src/db.ts';
import type { Env } from '../src/types.ts';

test('Auto-cura de dados (Data Auto Healing v1): remove maliciosos e corrige templates/copies corrompidos', async () => {
  const { db, raw } = createSqliteD1();
  const env: Env = {
    DB: db,
    ADMIN_PASSWORD: 'admin'
  };

  // 1. Inserir repositórios de teste simulando a base em produção corrompida / com lixo
  const insertMockRepo = (
    fullName: string,
    templateType: string,
    hookTitle: string,
    introText: string
  ) => {
    const [owner, name] = fullName.split('/');
    raw.prepare(`
      INSERT INTO repositories (
        repo_key, full_name, owner, name, repo_url, category, template_type,
        hook_title, intro_text, features_json, scenario_title, scenario_intro,
        scenario_prompt, scenario_steps_json, killer_title, killer_text,
        summary_text, punchline, whatsapp_text, stars, forks, language
      ) VALUES (?, ?, ?, ?, ?, 'Outros', ?, ?, ?, '[]', 's', 's', 's', '[]', 'k', 'k', 's', 'p', 'w', 100, 10, 'TypeScript')
    `).run(
      fullName.toLowerCase(),
      fullName,
      owner,
      name,
      `https://github.com/${fullName}`,
      templateType,
      hookTitle,
      introText
    );
  };

  // Repositórios maliciosos que devem ser excluídos
  insertMockRepo('shadowhackrs/gmail-account-creator', 'infra-gateway', 'Malicious Hook', 'Malicious intro');
  insertMockRepo('snailsploit/claude-red', 'infra-gateway', 'Malicious Hook 2', 'Malicious intro 2');

  // Repositórios legítimos com o padrão bugado / incorreto que precisam de correção
  insertMockRepo(
    'amosblomqvist/learnharness',
    'infra-gateway',
    '🔒 E SE NENHUMA SENHA OU CHAVE DE API NUNCA MAIS VAZASSE...',
    'Construído especificamente para resolver gargalos de resiliência...'
  );
  insertMockRepo(
    'jakeschincariol/replica-skill',
    'infra-gateway',
    '🔒 E SE NENHUMA SENHA OU CHAVE DE API NUNCA MAIS VAZASSE...',
    'Construído especificamente para resolver gargalos de resiliência...'
  );

  // Repositório limpo correto para garantir que não é alterado indevidamente
  insertMockRepo(
    'octocat/Hello-World',
    'app-tool',
    'Hello World Tool',
    'A sample repository for testing.'
  );

  // 2. Executar ensureDatabaseInitialized / runDataAutoHealing
  await ensureDatabaseInitialized(db, env);

  // 3. Verificar que os repositórios maliciosos foram EXCLUÍDOS da tabela repositories
  const shadowCheck = raw.prepare('SELECT COUNT(*) as cnt FROM repositories WHERE repo_key = ?').get('shadowhackrs/gmail-account-creator') as { cnt: number };
  const snailCheck = raw.prepare('SELECT COUNT(*) as cnt FROM repositories WHERE repo_key = ?').get('snailsploit/claude-red') as { cnt: number };
  assert.equal(shadowCheck.cnt, 0, 'Repositório malicioso shadowhackrs/gmail-account-creator deveria ter sido excluído');
  assert.equal(snailCheck.cnt, 0, 'Repositório malicioso snailsploit/claude-red deveria ter sido excluído');

  // 4. Verificar que 'amosblomqvist/learnharness' teve o template_type corrigido para 'ai-agent-automation' e o hook_title/intro_text atualizados
  const amosRepo = raw.prepare('SELECT template_type, hook_title, intro_text FROM repositories WHERE repo_key = ?').get('amosblomqvist/learnharness') as { template_type: string; hook_title: string; intro_text: string };
  assert.equal(amosRepo.template_type, 'ai-agent-automation', 'template_type de amosblomqvist/learnharness deve ser corrigido');
  assert.notEqual(amosRepo.hook_title, '🔒 E SE NENHUMA SENHA OU CHAVE DE API NUNCA MAIS VAZASSE...', 'hook_title clichê deve ser substituído');
  assert.notEqual(amosRepo.intro_text, 'Construído especificamente para resolver gargalos de resiliência...', 'intro_text clichê deve ser substituído');

  // Verificar jakeschincariol/replica-skill também
  const jakeRepo = raw.prepare('SELECT template_type, hook_title, intro_text FROM repositories WHERE repo_key = ?').get('jakeschincariol/replica-skill') as { template_type: string; hook_title: string; intro_text: string };
  assert.equal(jakeRepo.template_type, 'ai-agent-automation', 'template_type de jakeschincariol/replica-skill deve ser corrigido');
  assert.notEqual(jakeRepo.hook_title, '🔒 E SE NENHUMA SENHA OU CHAVE DE API NUNCA MAIS VAZASSE...');

  // Repositório legítimo intacto
  const helloRepo = raw.prepare('SELECT template_type FROM repositories WHERE repo_key = ?').get('octocat/hello-world') as { template_type: string };
  assert.equal(helloRepo.template_type, 'app-tool', 'Repositório legítimo não deve ser alterado indevidamente');

  // 5. Verificar que a chave data_auto_healing_v1 foi salva em app_settings
  const settingRow = raw.prepare('SELECT value FROM app_settings WHERE key = ?').get('data_auto_healing_v1') as { value: string } | undefined;
  assert.ok(settingRow, 'A chave de marcação data_auto_healing_v1 deve existir em app_settings');
  assert.equal(settingRow.value, 'applied', 'O valor da flag data_auto_healing_v1 deve ser applied');
});

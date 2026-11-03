import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicHtml } from '../src/ui-public.ts';

test('i18n: renderPublicHtml renders language selector with options pt, en, es', () => {
  const html = renderPublicHtml();
  assert.ok(html.includes('lang-selector'), 'Seletor de idiomas (#lang-selector) deve estar presente no HTML');
  assert.ok(html.includes('data-lang="pt"'), 'Opção pt deve estar presente no seletor');
  assert.ok(html.includes('data-lang="en"'), 'Opção en deve estar presente no seletor');
  assert.ok(html.includes('data-lang="es"'), 'Opção es deve estar presente no seletor');
});

test('i18n: client-side translation dictionary is present with essential keys for pt, en, es', () => {
  const html = renderPublicHtml();
  assert.ok(html.includes('I18N_DICT'), 'Dicionário de traduções I18N_DICT deve estar presente');
  assert.ok(html.includes('pt:'), 'Chave pt deve estar presente no dicionário');
  assert.ok(html.includes('en:'), 'Chave en deve estar presente no dicionário');
  assert.ok(html.includes('es:'), 'Chave es deve estar presente no dicionário');
  assert.ok(html.includes('checkTitle'), 'Chave checkTitle deve estar presente nas traduções');
  assert.ok(html.includes('searchPlaceholder'), 'Chave searchPlaceholder deve estar presente nas traduções');
});

test('i18n: browser detection navigator.languages and localStorage switcher are embedded', () => {
  const html = renderPublicHtml();
  assert.ok(html.includes('navigator.languages'), 'Detecção navigator.languages deve estar embutida');
  assert.ok(html.includes('localStorage'), 'Uso de localStorage deve estar embutido');
  assert.ok(html.includes('gitvisao_lang'), 'Chave gitvisao_lang no localStorage deve estar presente');
  assert.ok(html.includes('setLanguage(detectInitialLang())'), 'Inicialização dinâmica de idioma deve estar presente');
});

test('i18n: all 9 categories are present in the category map for pt, en, and es', () => {
  const html = renderPublicHtml();
  assert.ok(html.includes('I18N_CATEGORIES'), 'Mapa I18N_CATEGORIES deve estar presente');

  const expectedCategories = [
    'Agentes & Automação IA',
    'SaaS & CRM Self-Hosted',
    'Infra, Gateways & Edge',
    'Terminal, CLI & DX',
    'Frontend & UI Components',
    'Scrapers & Engenharia de Dados',
    'Cibersegurança & Pentest',
    'Apps & Produtividade',
    'Backend, Bancos & Storage'
  ];

  for (const cat of expectedCategories) {
    assert.ok(html.includes(cat), `Categoria "${cat}" deve estar presente no HTML gerado`);
  }
});

test('i18n: cost and deploy dictionaries are translated across pt, en, and es', () => {
  const html = renderPublicHtml();
  assert.ok(html.includes('COST_I18N'), 'Dicionário COST_I18N deve estar presente');
  assert.ok(html.includes('DEPLOY_I18N'), 'Dicionário DEPLOY_I18N deve estar presente');
  assert.ok(html.includes('100% Free & Local'), 'Custo em inglês deve estar presente');
  assert.ok(html.includes('100% Gratis y Local'), 'Custo em espanhol deve estar presente');
});

test('i18n: fetchRepos passes lang and setLanguage triggers re-fetch of analyses', () => {
  const html = renderPublicHtml();
  assert.ok(html.includes("p.set('lang', currentLang)"), "fetchRepos deve incluir p.set('lang', currentLang)");
  assert.ok(html.includes('setLanguage(lang, true)'), 'Clique no seletor deve invocar setLanguage com triggerFetch');
});

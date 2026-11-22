/* GitVisão — home pública (sem dependências). */
(function () {
  'use strict';

  var BOOT = window.__GV__ || {};
  var PROMO = BOOT.promo || { enabled: false, videos: [] };

  var CATEGORIES = [
    'Agentes & Automação IA', 'SaaS & CRM Self-Hosted', 'Infra, Gateways & Edge', 'Terminal, CLI & DX',
    'Frontend & UI Components', 'Scrapers & Engenharia de Dados', 'Cibersegurança & Pentest',
    'Apps & Produtividade', 'Backend, Bancos & Storage', 'Libs, SDKs & CLI Dev', 'Outros'
  ];
  var CAT_ICON = {
    'Agentes & Automação IA': 'ai', 'SaaS & CRM Self-Hosted': 'saas', 'Infra, Gateways & Edge': 'infra',
    'Terminal, CLI & DX': 'cli', 'Frontend & UI Components': 'frontend', 'Scrapers & Engenharia de Dados': 'scrapers',
    'Cibersegurança & Pentest': 'security', 'Apps & Produtividade': 'apps', 'Backend, Bancos & Storage': 'backend',
    'Libs, SDKs & CLI Dev': 'libs', 'Outros': 'other'
  };
  var LANG_COLORS = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572a5', Go: '#00add8', Rust: '#dea584', Java: '#b07219',
    'C++': '#f34b7d', C: '#8b8b8b', 'C#': '#178600', PHP: '#4f5d95', Ruby: '#701516', Shell: '#89e051', Kotlin: '#a97bff',
    Swift: '#f05138', Dart: '#00b4ab', HTML: '#e34c26', CSS: '#663399', Vue: '#41b883', Zig: '#ec915c', Lua: '#000080',
    PowerShell: '#012456', 'Jupyter Notebook': '#da5b0b', Svelte: '#ff3e00'
  };

  var I18N_DICT = {
    pt: {
      navExplore: 'Explorar', navCategories: 'Categorias', navChannel: 'Canal', navBot: 'Bot do grupo',
      channelBtn: 'Canal no YouTube',
      eyebrow: 'repositórios open source com curadoria',
      heroTitle: 'Pega a visão do <span class="grad-text">open source</span> que importa.',
      heroLead: 'Pergunte do seu jeito ou cole um link do GitHub. A gente mostra o que o projeto faz, quanto custa e como instalar, com o resumo pronto para o WhatsApp.',
      searchPlaceholder: 'Pergunte: "temos algo de segurança?"',
      checkTitle: 'Buscar',
      tryLabel: 'Experimente:',
      examples: ['segurança e pentest', 'self-hosted para WhatsApp', 'agente de IA local', 'alternativa ao Notion', 'baixar vídeos', 'banco de dados'],
      typing: ['temos algo de segurança?', 'quero um CRM self-hosted', 'agente de IA que roda local', 'alternativa grátis ao Notion', 'ferramenta para baixar vídeos', 'https://github.com/owner/repo'],
      statRepos: 'repositórios', statCats: 'categorias', statLangs: 'linguagens', statDaily: 'novos toda semana',
      newOnChannel: 'Novo no canal',
      catKicker: 'Navegue por tema', catTitle: 'Categorias', catSub: 'Cada categoria é revisada e resumida no formato "Pega a Visão".',
      chKicker: 'Aprenda na prática', chSub: 'Assista, instale e use.', subscribe: 'Inscrever-se', watchChannel: 'Ver canal',
      expKicker: 'Explorar', expTitle: 'Catálogo completo',
      filterPlaceholder: 'Filtrar ou perguntar…',
      sortRelevance: 'Mais relevantes', sortRecent: 'Mais recentes', sortStars: 'Mais estrelas', sortName: 'A–Z',
      allLangs: 'Todas as linguagens', anyStars: 'Qualquer nº de estrelas', active: 'Ativo nos últimos 90 dias',
      clear: 'Limpar filtros', results: 'resultados', result: 'resultado', understood: 'Entendi:', inCat: 'em',
      seeCat: 'Ver toda a categoria',
      loadMore: 'Carregar mais', showing: 'Exibindo', of: 'de',
      loadingRepos: 'Carregando catálogo…', noReposFound: 'Nada encontrado com esses filtros',
      noReposTip: 'Tente palavras mais gerais, outra linguagem ou limpe os filtros.',
      view: 'Ver visão', copy: 'Copiar', copied: 'Resumo copiado!', linkCopied: 'Link copiado!', copyError: 'Não foi possível copiar.',
      loadError: 'Erro ao carregar o catálogo.', checkError: 'Falha ao consultar.',
      lastCommit: 'Último commit', today: 'hoje', daysAgo: 'há {n} dias', monthsAgo: 'há {n} meses', yearsAgo: 'há {n} anos',
      inCatalog: 'Já está no catálogo', notInCatalog: 'Ainda não está no catálogo. Anotamos o pedido para a curadoria avaliar.',
      openVision: 'Abrir visão',
      promoLabel: 'Do canal Samuca Tutoriais', watch: 'Assistir', learn: 'Aprenda na prática',
      techSheet: 'Ficha técnica', summary: 'Resumindo', whatsPreview: 'Prévia no WhatsApp', copyText: 'Copiar texto',
      share: 'Compartilhar', openGithub: 'Abrir no GitHub', close: 'Fechar', watchYt: 'Abrir no YouTube',
      botKicker: 'Direto no grupo', botTitle: 'Pergunte ao GitVisão no WhatsApp',
      botSub: 'No grupo, marque o Samuel com a palavra "vision" ou use /vision. O bot responde com os melhores repositórios e o link da busca aqui no site.',
      botL1: '<code>@Samuel vision temos algo de segurança?</code>', botL2: '<code>/vision alternativa ao Notion</code>',
      botL3: 'Respostas com estrelas, resumo e link direto para a visão completa.',
      footer: 'Catálogo de repositórios open source no formato Pega a Visão.'
    },
    en: {
      navExplore: 'Explore', navCategories: 'Categories', navChannel: 'Channel', navBot: 'Group bot',
      channelBtn: 'YouTube channel',
      eyebrow: 'curated open source repositories',
      heroTitle: 'Get the <span class="grad-text">open source</span> that actually matters.',
      heroLead: 'Ask in your own words or paste a GitHub link. See what it does, what it costs and how to install it, with a summary ready for WhatsApp.',
      searchPlaceholder: 'Ask: "anything for security?"',
      checkTitle: 'Search',
      tryLabel: 'Try:',
      examples: ['security and pentest', 'self-hosted WhatsApp', 'local AI agent', 'Notion alternative', 'video downloader', 'database'],
      typing: ['anything for security?', 'a self-hosted CRM', 'AI agent that runs locally', 'free Notion alternative', 'tool to download videos', 'https://github.com/owner/repo'],
      statRepos: 'repositories', statCats: 'categories', statLangs: 'languages', statDaily: 'new every week',
      newOnChannel: 'New on the channel',
      catKicker: 'Browse by topic', catTitle: 'Categories', catSub: 'Every category is reviewed and summarized in the "Pega a Visão" format.',
      chKicker: 'Learn by doing', chSub: 'Watch, install and use.', subscribe: 'Subscribe', watchChannel: 'Visit channel',
      expKicker: 'Explore', expTitle: 'Full catalog',
      filterPlaceholder: 'Filter or ask…',
      sortRelevance: 'Most relevant', sortRecent: 'Most recent', sortStars: 'Most stars', sortName: 'A–Z',
      allLangs: 'All languages', anyStars: 'Any star count', active: 'Active in the last 90 days',
      clear: 'Clear filters', results: 'results', result: 'result', understood: 'Understood:', inCat: 'in',
      seeCat: 'See the whole category',
      loadMore: 'Load more', showing: 'Showing', of: 'of',
      loadingRepos: 'Loading catalog…', noReposFound: 'Nothing found with these filters',
      noReposTip: 'Try broader words, another language or clear the filters.',
      view: 'View', copy: 'Copy', copied: 'Summary copied!', linkCopied: 'Link copied!', copyError: 'Could not copy.',
      loadError: 'Error loading the catalog.', checkError: 'Check failed.',
      lastCommit: 'Last commit', today: 'today', daysAgo: '{n} days ago', monthsAgo: '{n} months ago', yearsAgo: '{n} years ago',
      inCatalog: 'Already in the catalog', notInCatalog: 'Not in the catalog yet. We logged the request for review.',
      openVision: 'Open vision',
      promoLabel: 'From Samuca Tutoriais', watch: 'Watch', learn: 'Learn by doing',
      techSheet: 'Tech sheet', summary: 'Summary', whatsPreview: 'WhatsApp preview', copyText: 'Copy text',
      share: 'Share', openGithub: 'Open on GitHub', close: 'Close', watchYt: 'Open on YouTube',
      botKicker: 'Right in the group', botTitle: 'Ask GitVisão on WhatsApp',
      botSub: 'In the group, mention Samuel with the word "vision" or use /vision. The bot replies with the best repositories and a link to the search here.',
      botL1: '<code>@Samuel vision anything for security?</code>', botL2: '<code>/vision Notion alternative</code>',
      botL3: 'Replies with stars, summary and a direct link to the full vision.',
      footer: 'Open source repository catalog in the Pega a Visão format.'
    },
    es: {
      navExplore: 'Explorar', navCategories: 'Categorías', navChannel: 'Canal', navBot: 'Bot del grupo',
      channelBtn: 'Canal de YouTube',
      eyebrow: 'repositorios open source con curaduría',
      heroTitle: 'Descubre el <span class="grad-text">open source</span> que importa.',
      heroLead: 'Pregunta a tu manera o pega un enlace de GitHub. Te mostramos qué hace, cuánto cuesta y cómo instalarlo, con el resumen listo para WhatsApp.',
      searchPlaceholder: 'Pregunta: "¿hay algo de seguridad?"',
      checkTitle: 'Buscar',
      tryLabel: 'Prueba:',
      examples: ['seguridad y pentest', 'self-hosted para WhatsApp', 'agente de IA local', 'alternativa a Notion', 'descargar videos', 'base de datos'],
      typing: ['¿hay algo de seguridad?', 'un CRM self-hosted', 'agente de IA local', 'alternativa gratis a Notion', 'herramienta para descargar videos', 'https://github.com/owner/repo'],
      statRepos: 'repositorios', statCats: 'categorías', statLangs: 'lenguajes', statDaily: 'nuevos cada semana',
      newOnChannel: 'Nuevo en el canal',
      catKicker: 'Navega por tema', catTitle: 'Categorías', catSub: 'Cada categoría es revisada y resumida en formato "Pega a Visão".',
      chKicker: 'Aprende en la práctica', chSub: 'Mira, instala y usa.', subscribe: 'Suscribirse', watchChannel: 'Ver canal',
      expKicker: 'Explorar', expTitle: 'Catálogo completo',
      filterPlaceholder: 'Filtrar o preguntar…',
      sortRelevance: 'Más relevantes', sortRecent: 'Más recientes', sortStars: 'Más estrellas', sortName: 'A–Z',
      allLangs: 'Todos los lenguajes', anyStars: 'Cualquier nº de estrellas', active: 'Activo en los últimos 90 días',
      clear: 'Limpiar filtros', results: 'resultados', result: 'resultado', understood: 'Entendí:', inCat: 'en',
      seeCat: 'Ver toda la categoría',
      loadMore: 'Cargar más', showing: 'Mostrando', of: 'de',
      loadingRepos: 'Cargando catálogo…', noReposFound: 'Nada encontrado con estos filtros',
      noReposTip: 'Prueba palabras más generales, otro lenguaje o limpia los filtros.',
      view: 'Ver visión', copy: 'Copiar', copied: '¡Resumen copiado!', linkCopied: '¡Enlace copiado!', copyError: 'No fue posible copiar.',
      loadError: 'Error al cargar el catálogo.', checkError: 'Fallo al consultar.',
      lastCommit: 'Último commit', today: 'hoy', daysAgo: 'hace {n} días', monthsAgo: 'hace {n} meses', yearsAgo: 'hace {n} años',
      inCatalog: 'Ya está en el catálogo', notInCatalog: 'Aún no está en el catálogo. Registramos la solicitud para revisión.',
      openVision: 'Abrir visión',
      promoLabel: 'Del canal Samuca Tutoriais', watch: 'Ver', learn: 'Aprende en la práctica',
      techSheet: 'Ficha técnica', summary: 'Resumen', whatsPreview: 'Vista previa en WhatsApp', copyText: 'Copiar texto',
      share: 'Compartir', openGithub: 'Abrir en GitHub', close: 'Cerrar', watchYt: 'Abrir en YouTube',
      botKicker: 'Directo en el grupo', botTitle: 'Pregunta a GitVisão en WhatsApp',
      botSub: 'En el grupo, menciona a Samuel con la palabra "vision" o usa /vision. El bot responde con los mejores repositorios y el enlace de la búsqueda aquí.',
      botL1: '<code>@Samuel vision ¿algo de seguridad?</code>', botL2: '<code>/vision alternativa a Notion</code>',
      botL3: 'Respuestas con estrellas, resumen y enlace directo a la visión completa.',
      footer: 'Catálogo de repositorios open source en formato Pega a Visão.'
    }
  };

  var I18N_CATEGORIES = {
    pt: {},
    en: {
      'Agentes & Automação IA': 'AI Agents & Automation', 'SaaS & CRM Self-Hosted': 'Self-Hosted SaaS & CRM',
      'Scrapers & Engenharia de Dados': 'Scrapers & Data Engineering', 'Cibersegurança & Pentest': 'Cybersecurity & Pentest',
      'Apps & Produtividade': 'Apps & Productivity', 'Backend, Bancos & Storage': 'Backend, Databases & Storage',
      'Libs, SDKs & CLI Dev': 'Libs, SDKs & Dev CLI', 'Outros': 'Other'
    },
    es: {
      'Agentes & Automação IA': 'Agentes y Automatización IA', 'Frontend & UI Components': 'Frontend & Componentes UI',
      'Scrapers & Engenharia de Dados': 'Scrapers & Ingeniería de Datos', 'Cibersegurança & Pentest': 'Ciberseguridad & Pentest',
      'Apps & Produtividade': 'Apps & Productividad', 'Backend, Bancos & Storage': 'Backend, Bases de Datos & Storage',
      'Libs, SDKs & CLI Dev': 'Libs, SDKs & CLI Dev', 'Outros': 'Otros'
    }
  };

  // Ficha técnica (só aparece quando o repositório tiver esses campos preenchidos).
  var COST_I18N = {
    pt: { 'free-local': '🟢 100% Grátis & Local', byok: '🟡 Grátis (BYOK)', 'byok-ai': '🟡 Grátis (BYOK)', freemium: '🟠 Freemium / Open Core', 'paid-infra': '🔴 Custos de servidor/APIs', 'paid-external': '🔴 Custos de servidor/APIs' },
    en: { 'free-local': '🟢 100% Free & Local', byok: '🟡 Free (BYOK)', 'byok-ai': '🟡 Free (BYOK)', freemium: '🟠 Freemium / Open Core', 'paid-infra': '🔴 Server/API Costs', 'paid-external': '🔴 Server/API Costs' },
    es: { 'free-local': '🟢 100% Gratis y Local', byok: '🟡 Gratis (BYOK)', 'byok-ai': '🟡 Gratis (BYOK)', freemium: '🟠 Freemium / Open Core', 'paid-infra': '🔴 Costos de servidor/APIs', 'paid-external': '🔴 Costos de servidor/APIs' }
  };
  var DEPLOY_I18N = {
    pt: { easy: '🟢 Fácil', medium: '🟡 Médio (Docker / .env)', advanced: '🔴 Avançado' },
    en: { easy: '🟢 Easy', medium: '🟡 Medium (Docker / .env)', advanced: '🔴 Advanced' },
    es: { easy: '🟢 Fácil', medium: '🟡 Medio (Docker / .env)', advanced: '🔴 Avanzado' }
  };

  // ------------------------------------------------------------ estado
  var S = {
    lang: 'pt', q: '', category: '', language: '', minStars: 0, recent: false, sort: 'relevance',
    items: [], cursor: null, hasMore: false, total: 0, globalTotal: 0, byCategory: {}, byLanguage: {},
    query: null, loading: false, reqId: 0, ctrl: null, current: null, promoIdx: 0
  };

  function $(id) { return document.getElementById(id); }
  function t(k) { var d = I18N_DICT[S.lang] || I18N_DICT.pt; return d[k] != null ? d[k] : I18N_DICT.pt[k]; }
  function catName(c) { var m = I18N_CATEGORIES[S.lang] || {}; return m[c] || c; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function arr(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) { try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
    return [];
  }
  function safeUrl(u) { return /^https:\/\//.test(String(u || '')) ? u : '#'; }
  function fmtStars(n) {
    n = Number(n || 0);
    if (n < 1000) return String(n);
    var v = (n / 1000).toFixed(1).replace(/\.0$/, '');
    return S.lang === 'en' ? v + 'k' : v.replace('.', ',') + (S.lang === 'es' ? 'k' : ' mil');
  }
  function ago(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 1) return t('today');
    if (days < 45) return t('daysAgo').replace('{n}', days);
    if (days < 540) return t('monthsAgo').replace('{n}', Math.round(days / 30));
    return t('yearsAgo').replace('{n}', Math.round(days / 365));
  }
  function icon(name) {
    var P = {
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
      copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
      eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
      gh: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
      wa: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.8 19.4Z"/><path d="M9 10c0 3 2 5 5 5l1.3-1.3-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2Z"/>',
      play: '<path d="M7 4v16l13-8Z"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }
  function toast(msg, err) {
    var el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }
  function copyText(text, msg) {
    var done = function () { toast(msg || t('copied')); };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(done, function () { toast(t('copyError'), true); });
    }
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast(t('copyError'), true); }
    ta.remove();
  }

  function norm(raw) {
    if (!raw) return null;
    var g = function (a, b, d) { return raw[a] != null && raw[a] !== '' ? raw[a] : (raw[b] != null && raw[b] !== '' ? raw[b] : d); };
    var full = g('full_name', 'fullName', g('repo_key', 'repoKey', ''));
    return {
      repoKey: String(g('repo_key', 'repoKey', full)).toLowerCase(), fullName: full,
      repoUrl: g('repo_url', 'repoUrl', 'https://github.com/' + full), description: g('description', 'description', ''),
      stars: Number(g('stars', 'stars', 0)), language: g('language', 'language', ''),
      lastCommitAt: g('last_commit_at', 'lastCommitAt', ''), category: g('category', 'category', 'Outros'),
      licenseSpdx: g('license_spdx', 'licenseSpdx', ''), licenseType: g('license_type', 'licenseType', ''),
      costModel: g('cost_model', 'costModel', ''), costNotes: g('cost_notes', 'costNotes', ''),
      deployDifficulty: g('deploy_difficulty', 'deployDifficulty', ''), deployMethod: g('deploy_method', 'deployMethod', ''),
      hookTitle: g('hook_title', 'hookTitle', ''), introText: g('intro_text', 'introText', ''), warningNote: g('warning_note', 'warningNote', ''),
      features: arr(raw.features != null ? raw.features : raw.features_json),
      scenarioTitle: g('scenario_title', 'scenarioTitle', '🧠 PENSE ASSIM:'), scenarioIntro: g('scenario_intro', 'scenarioIntro', ''),
      scenarioPrompt: g('scenario_prompt', 'scenarioPrompt', ''),
      scenarioSteps: arr(raw.scenarioSteps != null ? raw.scenarioSteps : (raw.scenario_steps != null ? raw.scenario_steps : raw.scenario_steps_json)),
      scenarioOutro: g('scenario_outro', 'scenarioOutro', ''), killerTitle: g('killer_title', 'killerTitle', '🤯 A parte mais interessante?'),
      killerText: g('killer_text', 'killerText', ''), summaryText: g('summary_text', 'summaryText', ''),
      punchline: g('punchline', 'punchline', ''), whatsappText: g('whatsapp_text', 'whatsappText', '')
    };
  }

  function isRepoInput(v) {
    v = v.trim();
    return /github\.com\/[\w.-]+\/[\w.-]+/i.test(v) || /^[\w-]{1,39}\/[\w.-]{1,100}$/.test(v);
  }
  function repoLink(key) { return location.origin + '/?repo=' + encodeURIComponent(key).replace('%2F', '/'); }

  // ------------------------------------------------------------ idioma
  function detectInitialLang() {
    try {
      var saved = localStorage.getItem('gitvisao_lang');
      if (saved && I18N_DICT[saved]) return saved;
    } catch (e) {}
    var navLangs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'pt'];
    for (var i = 0; i < navLangs.length; i++) {
      var l = String(navLangs[i] || '').toLowerCase();
      if (l.indexOf('en') === 0) return 'en';
      if (l.indexOf('es') === 0) return 'es';
      if (l.indexOf('pt') === 0) return 'pt';
    }
    return 'pt';
  }

  function setLanguage(lang, triggerFetch) {
    if (!I18N_DICT[lang]) lang = 'pt';
    var previous = S.lang;
    S.lang = lang;
    try { localStorage.setItem('gitvisao_lang', lang); } catch (e) {}
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    document.querySelectorAll('#lang-selector button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === lang);
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    applyI18n();
    if (triggerFetch && previous !== lang) fetchRepos(true);
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    var sort = $('sort-select');
    ['sortRelevance', 'sortRecent', 'sortStars', 'sortName'].forEach(function (k, i) { if (sort.options[i]) sort.options[i].textContent = t(k); });
    renderExamples(); renderCats(); renderLangOptions(); renderStarsOptions(); renderPromo(); renderGrid(); renderMeta();
    restartTyping();
  }

  // ------------------------------------------------------------ hero
  var typingTimer = null;
  function restartTyping() {
    clearTimeout(typingTimer);
    var input = $('omni-input'); var list = t('typing'); var i = 0, pos = 0, del = false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { input.placeholder = t('searchPlaceholder'); return; }
    function step() {
      if (document.activeElement === input || input.value) { input.placeholder = t('searchPlaceholder'); typingTimer = setTimeout(step, 1200); return; }
      var word = list[i % list.length];
      pos += del ? -1 : 1;
      input.placeholder = word.slice(0, pos) + (pos < word.length || del ? '▍' : '');
      var wait = del ? 28 : 55;
      if (!del && pos >= word.length) { del = true; wait = 1700; }
      else if (del && pos <= 0) { del = false; i++; wait = 350; }
      typingTimer = setTimeout(step, wait);
    }
    step();
  }
  function renderExamples() {
    var box = $('examples');
    box.innerHTML = '<span>' + esc(t('tryLabel')) + '</span>' + t('examples').map(function (e) {
      return '<button type="button" class="chip" data-ex="' + esc(e) + '">' + esc(e) + '</button>';
    }).join('');
  }
  function loadHeroVideo() {
    var media = $('hero-media'); if (!media) return;
    var conn = navigator.connection || {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || conn.saveData || /2g/.test(conn.effectiveType || '') || window.innerWidth < 720) return;
    var v = document.createElement('video');
    v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.preload = 'auto'; v.poster = '/img/hero.webp';
    v.innerHTML = '<source src="/video/hero.webm" type="video/webm"><source src="/video/hero.mp4" type="video/mp4">';
    v.addEventListener('playing', function () { v.classList.add('ready'); }, { once: true });
    media.appendChild(v);
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }

  function submitOmni(raw) {
    raw = String(raw || '').trim();
    if (!raw) return;
    $('check-panel').hidden = true;
    if (isRepoInput(raw)) { checkRepo(raw); return; }
    S.q = raw; $('filter-input').value = raw; S.sort = 'relevance'; $('sort-select').value = 'relevance';
    fetchRepos(true);
    document.getElementById('explorar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function checkRepo(raw) {
    var btn = $('omni-btn'); btn.disabled = true;
    fetch('/api/check?repo=' + encodeURIComponent(raw) + '&lang=' + encodeURIComponent(S.lang), { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        var panel = $('check-panel');
        if (!r.ok) { toast(r.d.error || t('checkError'), true); return; }
        if (r.d.exists && r.d.repo) {
          var repo = norm(r.d.repo);
          panel.className = 'check-panel ok';
          panel.innerHTML = '✅ <b class="mono">' + esc(repo.fullName) + '</b> <span>' + esc(t('inCatalog')) + '</span>' +
            '<button type="button" class="btn btn-sm btn-primary" id="check-open">' + icon('eye') + esc(t('openVision')) + '</button>';
          panel.hidden = false;
          $('check-open').onclick = function () { openModal(repo); };
          openModal(repo);
        } else {
          panel.className = 'check-panel miss';
          panel.innerHTML = 'ℹ️ <b class="mono">' + esc(r.d.fullName || raw) + '</b> <span>' + esc(t('notInCatalog')) + '</span>';
          panel.hidden = false;
        }
      })
      .catch(function () { toast(t('checkError'), true); })
      .then(function () { btn.disabled = false; });
  }

  // ------------------------------------------------------------ categorias
  function renderCats() {
    var box = $('cats');
    var cats = CATEGORIES.filter(function (c) { return (S.byCategory[c] || 0) > 0; });
    Object.keys(S.byCategory).forEach(function (c) { if (cats.indexOf(c) < 0 && S.byCategory[c] > 0) cats.push(c); });
    if (!cats.length) cats = CATEGORIES.slice(0, 10);
    box.innerHTML = cats.map(function (c) {
      return '<button type="button" class="cat' + (S.category === c ? ' on' : '') + '" data-cat="' + esc(c) + '">' +
        '<img src="/img/icons/' + (CAT_ICON[c] || 'other') + '.webp" alt="" width="56" height="56" loading="lazy">' +
        '<b>' + esc(catName(c)) + '</b><small>' + (S.byCategory[c] || 0) + ' repos</small></button>';
    }).join('');
  }

  // ------------------------------------------------------------ filtros
  function renderLangOptions() {
    var sel = $('lang-filter'); var cur = S.language;
    var langs = Object.keys(S.byLanguage).sort(function (a, b) { return S.byLanguage[b] - S.byLanguage[a]; });
    sel.innerHTML = '<option value="">' + esc(t('allLangs')) + '</option>' + langs.map(function (l) {
      return '<option value="' + esc(l) + '"' + (l === cur ? ' selected' : '') + '>' + esc(l) + ' (' + S.byLanguage[l] + ')</option>';
    }).join('');
  }
  function renderStarsOptions() {
    var sel = $('stars-filter'); var cur = String(S.minStars || '');
    var opts = [['', t('anyStars')], ['1000', '⭐ 1 mil+'], ['5000', '⭐ 5 mil+'], ['10000', '⭐ 10 mil+'], ['50000', '⭐ 50 mil+']];
    if (S.lang === 'en') opts = opts.map(function (o) { return [o[0], o[1].replace(' mil', 'k')]; });
    sel.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function hasFilters() { return !!(S.q.trim() || S.category || S.language || S.minStars || S.recent); }

  function renderMeta() {
    var box = $('result-meta'); if (!box) return;
    var parts = [];
    parts.push('<span><strong>' + S.total + '</strong> ' + esc(S.total === 1 ? t('result') : t('results')) + '</span>');
    if (S.query && S.query.concepts && S.query.concepts.length && S.q.trim()) {
      parts.push('<span>· ' + esc(t('understood')) + '</span>');
      S.query.concepts.slice(0, 5).forEach(function (c) {
        var label = Array.isArray(c) ? c[0] : c;
        parts.push('<span class="chip">' + esc(label) + '</span>');
      });
      if (S.query.categoryHints && S.query.categoryHints.length && !S.category) {
        var h = S.query.categoryHints[0];
        parts.push('<button type="button" class="chip" data-cat="' + esc(h) + '">↳ ' + esc(t('seeCat')) + ': ' + esc(catName(h)) + '</button>');
      }
    }
    if (S.category) parts.push('<button type="button" class="chip on" data-clear="category">' + esc(catName(S.category)) + ' <span class="x">✕</span></button>');
    if (S.language) parts.push('<button type="button" class="chip on" data-clear="language">' + esc(S.language) + ' <span class="x">✕</span></button>');
    if (S.minStars) parts.push('<button type="button" class="chip on" data-clear="minStars">⭐ ' + fmtStars(S.minStars) + '+ <span class="x">✕</span></button>');
    if (S.recent) parts.push('<button type="button" class="chip on" data-clear="recent">' + esc(t('active')) + ' <span class="x">✕</span></button>');
    if (hasFilters()) parts.push('<button type="button" class="chip" data-clear="all">' + esc(t('clear')) + '</button>');
    box.innerHTML = parts.join(' ');
  }

  // ------------------------------------------------------------ catálogo
  function fetchRepos(reset) {
    if (!reset && S.loading) return;
    if (reset && S.ctrl) S.ctrl.abort();
    // Sem pergunta não existe "relevância": mostra (e usa) "mais recentes"; com pergunta, volta para relevância.
    if (!S.q.trim() && S.sort === 'relevance') { S.sort = 'recent'; $('sort-select').value = 'recent'; }
    else if (S.q.trim() && S.sort === 'recent' && !S.sortTouched) { S.sort = 'relevance'; $('sort-select').value = 'relevance'; }
    var id = ++S.reqId; var ctrl = new AbortController(); S.ctrl = ctrl; S.loading = true;
    if (reset) { S.cursor = null; S.items = []; renderGrid(true); }
    var p = new URLSearchParams();
    p.set('limit', '24');
    p.set('sort', S.sort === 'relevance' && !S.q.trim() ? 'recent' : S.sort);
    var currentLang = S.lang;
    p.set('lang', currentLang);
    if (S.q.trim()) p.set('q', S.q.trim());
    if (S.category) p.set('category', S.category);
    if (S.language) p.set('language', S.language);
    if (S.minStars) p.set('minStars', String(S.minStars));
    if (S.recent) p.set('recentDays', '90');
    if (!reset && S.cursor) p.set('cursor', S.cursor);
    syncUrl();
    return fetch('/api/repos?' + p.toString(), { signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (id !== S.reqId) return;
        S.cursor = d.nextCursor || null; S.hasMore = !!d.hasMore; S.total = Number(d.total || 0);
        if (d.byCategory) S.byCategory = d.byCategory;
        if (d.byLanguage) S.byLanguage = d.byLanguage;
        S.query = d.query || null;
        var gt = 0; Object.keys(S.byCategory).forEach(function (k) { gt += S.byCategory[k]; });
        S.globalTotal = gt || S.globalTotal;
        var list = (d.items || []).map(norm).filter(Boolean);
        S.items = reset ? list : S.items.concat(list);
        renderStats(); renderCats(); renderLangOptions(); renderMeta(); renderGrid(false);
      })
      .catch(function (e) { if (id === S.reqId && e.name !== 'AbortError') { toast(t('loadError'), true); renderGrid(false); } })
      .then(function () { if (id === S.reqId) { S.loading = false; S.ctrl = null; } });
  }
  function renderStats() {
    $('stat-repos').textContent = String(S.globalTotal || 0);
    $('stat-repos-eyebrow').textContent = S.globalTotal ? String(S.globalTotal) : '';
    $('stat-cats').textContent = String(Object.keys(S.byCategory).filter(function (k) { return S.byCategory[k] > 0; }).length || 10);
    $('stat-langs').textContent = String(Object.keys(S.byLanguage).length || 0);
  }

  function promoCard(v) {
    return '<article class="card promo"><button type="button" class="vcard" data-video="' + esc(v.id) + '" aria-label="' + esc(t('watch') + ': ' + v.title) + '">' +
      '<div class="vthumb"><img src="https://i.ytimg.com/vi/' + esc(v.id) + '/hqdefault.jpg" alt="" loading="lazy">' +
      (v.tag ? '<span class="vtag">' + esc(v.tag) + '</span>' : '') + '<span class="vplay"><i></i></span></div></button>' +
      '<div class="promo-body"><span class="promo-label">▶ ' + esc(t('promoLabel')) + '</span>' +
      '<h3 style="margin:0;font:600 16px/1.35 var(--display)">' + esc(v.title) + '</h3>' +
      '<div class="card-foot" style="border:0;padding-top:4px"><button type="button" class="btn btn-sm btn-yt" data-video="' + esc(v.id) + '">' + icon('play') + esc(t('watch')) + '</button>' +
      '<a class="btn btn-sm" href="' + esc(PROMO.channelUrl) + '?sub_confirmation=1" target="_blank" rel="noopener">' + esc(t('subscribe')) + '</a></div></div></article>';
  }

  function repoCard(r) {
    var parts = String(r.fullName).split('/');
    var lc = LANG_COLORS[r.language] || '#64748b';
    return '<article class="card">' +
      '<div class="card-top"><span class="cat-chip"><img src="/img/icons/' + (CAT_ICON[r.category] || 'other') + '.webp" alt="" loading="lazy"><span>' + esc(catName(r.category)) + '</span></span>' +
      '<span class="stars">★ ' + esc(fmtStars(r.stars)) + '</span></div>' +
      '<div class="repo-name">' + esc(parts[0] || '') + '/<b>' + esc(parts.slice(1).join('/') || r.fullName) + '</b></div>' +
      '<h3>' + esc(r.hookTitle || r.description) + '</h3>' +
      '<p>' + esc(r.introText || r.description) + '</p>' +
      '<div class="card-foot"><div class="meta">' +
        (r.language && r.language !== 'Open Source' ? '<span><i class="dot" style="background:' + lc + '"></i>' + esc(r.language) + '</span>' : '') +
        (r.lastCommitAt ? '<span title="' + esc(t('lastCommit')) + '">⟳ ' + esc(ago(r.lastCommitAt)) + '</span>' : '') +
      '</div>' +
      '<button type="button" class="btn btn-sm btn-icon" data-act="copy" data-repo="' + esc(r.repoKey) + '" title="' + esc(t('copy')) + '" aria-label="' + esc(t('copy')) + '">' + icon('copy') + '</button>' +
      '<button type="button" class="btn btn-sm" data-act="view" data-repo="' + esc(r.repoKey) + '">' + icon('eye') + esc(t('view')) + '</button></div>' +
      '<a class="stretch" href="/?repo=' + esc(r.repoKey) + '" data-act="view" data-repo="' + esc(r.repoKey) + '" aria-label="' + esc(r.fullName) + '"></a>' +
      '</article>';
  }

  function renderGrid(loading) {
    var grid = $('grid'), empty = $('empty'), more = $('more');
    if (loading) {
      empty.hidden = true; more.hidden = true;
      grid.innerHTML = new Array(6).join('<div class="skeleton"></div>') + '<div class="skeleton"></div>';
      return;
    }
    if (!S.items.length) { grid.innerHTML = ''; empty.hidden = S.loading; more.hidden = true; return; }
    empty.hidden = true;
    var every = PROMO.enabled && PROMO.videos && PROMO.videos.length ? Number(PROMO.gridEvery || 0) : 0;
    var html = []; var vi = 0;
    S.items.forEach(function (r, i) {
      html.push(repoCard(r));
      if (every > 0 && (i + 1) % every === 0) { html.push(promoCard(PROMO.videos[vi % PROMO.videos.length])); vi++; }
    });
    grid.innerHTML = html.join('');
    $('shown-count').textContent = String(S.items.length);
    $('total-count').textContent = String(S.total);
    more.hidden = false;
    $('load-more').hidden = !(S.hasMore && S.cursor);
  }

  // ------------------------------------------------------------ divulgação
  function renderPromo() {
    var sec = $('canal');
    if (!PROMO.enabled || !PROMO.videos || !PROMO.videos.length) { sec.hidden = true; $('hero-promo').hidden = true; return; }
    sec.hidden = false;
    $('ch-name').textContent = PROMO.channelName;
    $('ch-tagline').textContent = PROMO.channelTagline;
    $('ch-subs').textContent = [PROMO.channelHandle, PROMO.subscribersLabel].filter(Boolean).join(' · ');
    $('ch-sub-btn').href = PROMO.channelUrl + '?sub_confirmation=1';
    $('ch-visit').href = PROMO.channelUrl;
    $('videos').innerHTML = PROMO.videos.slice(0, 8).map(function (v) {
      return '<button type="button" class="vcard" data-video="' + esc(v.id) + '">' +
        '<div class="vthumb"><img src="https://i.ytimg.com/vi/' + esc(v.id) + '/hqdefault.jpg" alt="" loading="lazy">' +
        (v.tag ? '<span class="vtag">' + esc(v.tag) + '</span>' : '') + '<span class="vplay"><i></i></span></div>' +
        '<b>' + esc(v.title) + '</b></button>';
    }).join('');
    var first = PROMO.videos[0];
    var hp = $('hero-promo');
    hp.hidden = false; hp.setAttribute('data-video', first.id);
    hp.innerHTML = '<img src="https://i.ytimg.com/vi/' + esc(first.id) + '/mqdefault.jpg" alt="" width="76" height="43">' +
      '<div style="min-width:0"><small>▶ ' + esc(t('newOnChannel')) + '</small><span>' + esc(first.title) + '</span></div>';
    $('footer-channel').href = PROMO.channelUrl;
  }
  function findVideo(id) { return (PROMO.videos || []).filter(function (v) { return v.id === id; })[0] || { id: id, title: '' }; }

  function openPlayer(id) {
    var v = findVideo(id);
    var src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.id) + '?autoplay=1&rel=0&modestbranding=1' + (v.start ? '&start=' + v.start : '');
    var ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'player-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="player"><div class="player-frame"><iframe src="' + src + '" title="' + esc(v.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
      '<div class="player-bar"><b>' + esc(v.title) + '</b>' +
      '<a class="btn btn-sm btn-yt" target="_blank" rel="noopener" href="' + esc(PROMO.channelUrl) + '?sub_confirmation=1">' + esc(t('subscribe')) + '</a>' +
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + esc(v.id) + '">' + esc(t('watchYt')) + '</a>' +
      '<button type="button" class="btn btn-sm btn-icon" data-close aria-label="' + esc(t('close')) + '">' + icon('x') + '</button></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-close]')) closeOverlay(ov); });
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  }
  function closeOverlay(ov) {
    ov.remove();
    if (!document.querySelector('.overlay')) document.body.style.overflow = '';
  }

  // ------------------------------------------------------------ modal do repositório
  function techLine(label, value, extra) {
    if (!value) return '';
    return '<li><b>' + esc(label) + '</b> ' + esc(value) + (extra ? ' — <span>' + esc(extra) + '</span>' : '') + '</li>';
  }
  function openModal(r) {
    S.current = r;
    var old = $('repo-overlay'); if (old) old.remove();
    var parts = String(r.fullName).split('/');
    var cost = r.costModel ? (COST_I18N[S.lang] || COST_I18N.pt)[r.costModel] : '';
    var dep = r.deployDifficulty ? (DEPLOY_I18N[S.lang] || DEPLOY_I18N.pt)[r.deployDifficulty] : '';
    var tech = techLine('📜', r.licenseSpdx) + techLine('💰', cost, r.costNotes) + techLine('⚡', dep, r.deployMethod);
    var video = PROMO.enabled && PROMO.videos && PROMO.videos.length ? PROMO.videos[(S.promoIdx++) % PROMO.videos.length] : null;
    var ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'repo-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'm-title');
    ov.innerHTML = '<div class="sheet">' +
      '<div class="sheet-head"><span class="cat-chip"><img src="/img/icons/' + (CAT_ICON[r.category] || 'other') + '.webp" alt=""><span>' + esc(catName(r.category)) + '</span></span>' +
      '<div class="repo-name">' + esc(parts[0]) + '/<b>' + esc(parts.slice(1).join('/')) + '</b></div>' +
      '<button type="button" class="btn btn-sm btn-icon" data-close aria-label="' + esc(t('close')) + '">' + icon('x') + '</button></div>' +
      '<div class="sheet-body"><div>' +
        '<h2 id="m-title">' + esc(r.hookTitle || r.fullName) + '</h2><p class="intro">' + esc(r.introText || r.description) + '</p>' +
        '<div class="pills"><span class="pill">★ ' + esc(fmtStars(r.stars)) + '</span>' +
          (r.language ? '<span class="pill">' + esc(r.language) + '</span>' : '') +
          (r.lastCommitAt ? '<span class="pill">⟳ ' + esc(t('lastCommit')) + ': ' + esc(ago(r.lastCommitAt)) + '</span>' : '') + '</div>' +
        (r.warningNote ? '<div class="box warn">' + esc(r.warningNote) + '</div>' : '') +
        (tech ? '<div class="box"><h4>' + esc(t('techSheet')) + '</h4><ul style="list-style:none;padding:0">' + tech + '</ul></div>' : '') +
        (r.features.length ? '<div class="box"><ul style="list-style:none;padding:0">' + r.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +
        ((r.scenarioIntro || r.scenarioSteps.length) ? '<div class="box"><h4>' + esc(r.scenarioTitle) + '</h4><p>' + esc(r.scenarioIntro) + '</p>' +
          (r.scenarioPrompt ? '<blockquote>' + esc(r.scenarioPrompt) + '</blockquote>' : '') +
          (r.scenarioSteps.length ? '<ol>' + r.scenarioSteps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '') +
          (r.scenarioOutro ? '<p style="margin-top:8px;font-style:italic;color:var(--muted)">' + esc(r.scenarioOutro) + '</p>' : '') + '</div>' : '') +
        (r.killerText ? '<div class="box green"><h4>' + esc(r.killerTitle) + '</h4><p>' + esc(r.killerText) + '</p></div>' : '') +
        (r.summaryText ? '<div class="box"><h4>📌 ' + esc(t('summary')) + '</h4><p>' + esc(r.summaryText) + '</p>' + (r.punchline ? '<p class="punch">' + esc(r.punchline) + '</p>' : '') + '</div>' : '') +
      '</div><div class="side">' +
        '<div class="side-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-m="copy">' + icon('wa') + esc(t('copyText')) + '</button>' +
          '<button type="button" class="btn btn-sm" data-m="share">' + icon('share') + esc(t('share')) + '</button>' +
          '<a class="btn btn-sm" href="' + esc(safeUrl(r.repoUrl)) + '" target="_blank" rel="noopener noreferrer">' + icon('gh') + esc(t('openGithub')) + '</a></div>' +
        '<span class="kicker" style="margin-top:6px">' + esc(t('whatsPreview')) + '</span>' +
        '<div class="wa-preview"><div class="wa-msg">' + esc(r.whatsappText) + '</div></div>' +
        (video ? '<button type="button" class="learn" data-video="' + esc(video.id) + '"><img src="https://i.ytimg.com/vi/' + esc(video.id) + '/mqdefault.jpg" alt=""><div><small>▶ ' + esc(t('learn')) + '</small><b>' + esc(video.title) + '</b></div></button>' : '') +
      '</div></div></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-close]')) { closeModal(); return; }
      var m = e.target.closest('[data-m]');
      if (m && m.getAttribute('data-m') === 'copy') copyText(r.whatsappText);
      if (m && m.getAttribute('data-m') === 'share') shareRepo(r);
      var v = e.target.closest('[data-video]'); if (v) openPlayer(v.getAttribute('data-video'));
    });
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    var u = new URL(location.href); u.searchParams.set('repo', r.repoKey); history.replaceState(null, '', u.toString());
    document.title = r.fullName + ' • GitVisão';
    ov.querySelector('[data-close]').focus();
  }
  function closeModal() {
    var ov = $('repo-overlay'); if (!ov) return;
    closeOverlay(ov); S.current = null;
    var u = new URL(location.href); u.searchParams.delete('repo'); history.replaceState(null, '', u.toString());
    document.title = BOOT.title || 'GitVisão';
  }
  function shareRepo(r) {
    var url = repoLink(r.repoKey);
    if (navigator.share) { navigator.share({ title: r.fullName, text: r.hookTitle, url: url }).catch(function () {}); return; }
    copyText(url, t('linkCopied'));
  }

  function syncUrl() {
    var u = new URL(location.href);
    if (S.q.trim()) u.searchParams.set('q', S.q.trim()); else u.searchParams.delete('q');
    if (S.category) u.searchParams.set('cat', S.category); else u.searchParams.delete('cat');
    history.replaceState(null, '', u.toString());
  }

  // ------------------------------------------------------------ eventos
  function bind() {
    document.querySelectorAll('#lang-selector button').forEach(function (btn) {
      btn.addEventListener('click', function () { var lang = btn.getAttribute('data-lang'); if (lang) setLanguage(lang, true); });
    });
    $('omni-form').addEventListener('submit', function (e) { e.preventDefault(); submitOmni($('omni-input').value); });
    $('examples').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ex]'); if (!b) return;
      $('omni-input').value = b.getAttribute('data-ex'); submitOmni(b.getAttribute('data-ex'));
    });
    $('cats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      var c = b.getAttribute('data-cat'); S.category = S.category === c ? '' : c; fetchRepos(true);
      document.getElementById('explorar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    var ft = null;
    $('filter-input').addEventListener('input', function (e) {
      S.q = e.target.value || ''; clearTimeout(ft);
      ft = setTimeout(function () { if (!isRepoInput(S.q)) fetchRepos(true); }, 320);
    });
    $('filter-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && isRepoInput(e.target.value)) { e.preventDefault(); checkRepo(e.target.value); }
    });
    $('sort-select').addEventListener('change', function (e) { S.sort = e.target.value; S.sortTouched = true; fetchRepos(true); });
    $('lang-filter').addEventListener('change', function (e) { S.language = e.target.value; fetchRepos(true); });
    $('stars-filter').addEventListener('change', function (e) { S.minStars = Number(e.target.value || 0); fetchRepos(true); });
    $('recent-toggle').addEventListener('click', function () {
      S.recent = !S.recent; this.classList.toggle('on', S.recent); this.setAttribute('aria-pressed', S.recent ? 'true' : 'false'); fetchRepos(true);
    });
    $('result-meta').addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]');
      if (c) { S.category = c.getAttribute('data-cat'); fetchRepos(true); return; }
      var b = e.target.closest('[data-clear]'); if (!b) return;
      var k = b.getAttribute('data-clear');
      if (k === 'all') { S.q = ''; S.category = ''; S.language = ''; S.minStars = 0; S.recent = false; $('filter-input').value = ''; $('omni-input').value = ''; $('recent-toggle').classList.remove('on'); }
      else if (k === 'recent') { S.recent = false; $('recent-toggle').classList.remove('on'); }
      else if (k === 'minStars') S.minStars = 0;
      else S[k] = '';
      fetchRepos(true);
    });
    $('grid').addEventListener('click', function (e) {
      var v = e.target.closest('[data-video]');
      if (v) { e.preventDefault(); openPlayer(v.getAttribute('data-video')); return; }
      var a = e.target.closest('[data-act]'); if (!a) return;
      e.preventDefault();
      var key = a.getAttribute('data-repo');
      var r = S.items.filter(function (x) { return x.repoKey === key; })[0]; if (!r) return;
      if (a.getAttribute('data-act') === 'copy') copyText(r.whatsappText); else openModal(r);
    });
    $('videos').addEventListener('click', function (e) { var v = e.target.closest('[data-video]'); if (v) openPlayer(v.getAttribute('data-video')); });
    $('hero-promo').addEventListener('click', function () { openPlayer(this.getAttribute('data-video')); });
    $('load-more').addEventListener('click', function () { fetchRepos(false); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && S.hasMore && S.cursor && !S.loading && S.items.length < 240) fetchRepos(false);
      }, { rootMargin: '600px' }).observe($('more'));
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var p = $('player-overlay'); if (p) { closeOverlay(p); return; }
        closeModal();
      }
      if (e.key === '/' && document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) < 0) {
        e.preventDefault(); $('omni-input').focus();
      }
    });
    var bar = $('topbar');
    window.addEventListener('scroll', function () { bar.classList.toggle('scrolled', window.scrollY > 10); }, { passive: true });
  }

  // ------------------------------------------------------------ início
  function init() {
    bind();
    setLanguage(detectInitialLang());
    var params = new URLSearchParams(location.search);
    var q = params.get('q'); var cat = params.get('cat'); var repo = params.get('repo');
    if (q) { S.q = q; $('filter-input').value = q; $('omni-input').value = q; }
    if (cat) S.category = cat;
    fetchRepos(true);
    if (repo) checkRepo(repo);
    if (q || cat) setTimeout(function () { document.getElementById('explorar').scrollIntoView({ block: 'start' }); }, 50);
    loadHeroVideo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

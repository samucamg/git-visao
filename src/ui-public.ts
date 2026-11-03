// Página pública: só consulta o catálogo. Nada de login, geração de resumo ou configuração aqui.
// (Atenção: o script embutido não pode usar \${...} nem barras invertidas sem escape.)

function escapeHtmlServer(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPublicHtml(title?: string): string {
  const appTitle = escapeHtmlServer(title || 'GitVisão • Pega a Visão');
  return PUBLIC_TEMPLATE.split('__APP_TITLE__').join(appTitle);
}

const PUBLIC_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>__APP_TITLE__</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { darkMode: 'class', theme: { extend: { fontFamily: { sans: ['Inter','system-ui','sans-serif'], mono: ['JetBrains Mono','monospace'] } } } };
  </script>
  <style>
    body { background-color:#07090e; background-image: radial-gradient(at 15% 0%, rgba(14,165,233,.12) 0, transparent 45%), radial-gradient(at 85% 5%, rgba(16,185,129,.10) 0, transparent 45%); color:#e6edf3; }
    .glass-panel { background: rgba(19,25,34,.82); backdrop-filter: blur(14px); border:1px solid rgba(255,255,255,.08); }
    .card-hover { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
    .card-hover:hover { transform: translateY(-2px); border-color: rgba(56,189,248,.45); box-shadow: 0 12px 32px -10px rgba(14,165,233,.22); }
    .whatsapp-preview { background-color:#0b141a; }
    .whatsapp-bubble { background-color:#005c4b; color:#e9edef; border-radius:12px 12px 12px 2px; }
  </style>
</head>
<body class="min-h-screen font-sans antialiased">
  <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <header class="sticky top-0 z-30 border-b border-white/10 bg-[#07090e]/85 backdrop-blur-xl">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-lg">👁️</div>
        <div>
          <h1 id="app-title-heading" class="text-base sm:text-lg font-bold text-white">__APP_TITLE__</h1>
          <p id="header-subtitle" class="text-xs text-slate-400 hidden sm:block">Catálogo de repositórios GitHub prontos para compartilhar no WhatsApp</p>
        </div>
      </div>
      <div class="flex items-center gap-2.5 sm:gap-3">
        <div id="lang-selector" class="flex items-center gap-1 bg-slate-900/90 border border-white/10 rounded-xl p-1 text-xs font-semibold">
          <button type="button" data-lang="pt" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer bg-sky-500 text-slate-950 shadow-md" title="Português">🇧🇷 PT</button>
          <button type="button" data-lang="en" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer text-slate-400 hover:text-white" title="English">🇺🇸 EN</button>
          <button type="button" data-lang="es" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer text-slate-400 hover:text-white" title="Español">🇪🇸 ES</button>
        </div>
        <div class="px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-300">
          <span id="total-repos-count">0</span> <span id="repos-count-suffix">repositórios</span>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <section class="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 id="consult-title" class="text-lg font-bold text-white">Consultar repositório</h2>
        <p id="consult-desc" class="text-xs text-slate-400">Cole o link ou <span class="font-mono">owner/repo</span> para saber se já está no catálogo.</p>
      </div>
      <form id="check-form" class="flex flex-col sm:flex-row gap-3">
        <input id="repo-input" type="text" required placeholder="https://github.com/owner/repo" class="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono" />
        <button id="check-submit-btn" type="submit" class="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 font-bold text-sm cursor-pointer"><span>🔎 Verificar</span></button>
      </form>

      <div id="check-exists-panel" class="hidden rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span id="exists-badge" class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✅ Já está no catálogo</span>
          <span id="exists-repo-name" class="font-mono text-sm font-bold text-white"></span>
        </div>
        <p id="exists-repo-hook" class="text-sm font-semibold text-emerald-200"></p>
        <div class="flex flex-wrap gap-2">
          <button id="exists-copy-btn" type="button" class="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer">📲 Copiar resumo p/ WhatsApp</button>
          <button id="exists-view-btn" type="button" class="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold text-xs cursor-pointer">👁️ Ver visão completa</button>
        </div>
      </div>

      <div id="check-not-found-panel" class="hidden rounded-xl border border-sky-500/25 bg-slate-900/60 p-5 text-center space-y-1">
        <div class="text-2xl">ℹ️</div>
        <h4 id="not-found-title" class="text-sm font-bold text-white">Ainda não está no catálogo</h4>
        <p class="text-xs text-slate-400 max-w-lg mx-auto"><span id="not-found-repo-name" class="font-mono text-sky-300 font-semibold"></span> <span id="not-found-suffix">não foi catalogado. Anotamos o pedido para a curadoria avaliar.</span></p>
      </div>
    </section>

    <section class="space-y-3.5">
      <div class="flex flex-col sm:flex-row gap-3">
        <input id="search-input" type="search" placeholder="🔍 Buscar por nome, descrição ou linguagem..." class="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
        <select id="sort-select" aria-label="Ordenar" class="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-slate-200 cursor-pointer">
          <option value="recent">🕒 Mais recentes</option>
          <option value="stars">⭐ Mais estrelas</option>
          <option value="name">🔤 A-Z</option>
        </select>
        <button id="clear-filters-btn" type="button" class="hidden px-3.5 py-2.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer">✕ Limpar</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <select id="filter-license-select" aria-label="Licença" class="px-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-slate-200 cursor-pointer">
          <option value="">📜 Todas as licenças</option>
          <option value="permissive">🟢 Permissiva (MIT, Apache)</option>
          <option value="copyleft">🟡 Copyleft (AGPL, GPL)</option>
        </select>
        <select id="filter-cost-select" aria-label="Custo" class="px-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-slate-200 cursor-pointer">
          <option value="">💰 Todos os custos</option>
          <option value="free-local">🟢 100% grátis &amp; local</option>
          <option value="byok-ai">🟡 Grátis (chaves de IA próprias)</option>
          <option value="freemium">🟠 Freemium / open core</option>
          <option value="paid-infra">🔴 Custos de servidor/APIs</option>
        </select>
        <select id="filter-deploy-select" aria-label="Instalação" class="px-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-slate-200 cursor-pointer">
          <option value="">⚡ Todas as instalações</option>
          <option value="easy">🟢 Fácil</option>
          <option value="medium">🟡 Médio (Docker / .env)</option>
          <option value="advanced">🔴 Avançado</option>
        </select>
      </div>
      <div id="category-pills" class="flex items-center gap-2 overflow-x-auto pb-1"></div>
    </section>

    <section>
      <div id="repos-loading" class="py-16 text-center text-slate-400 text-sm">Carregando catálogo...</div>
      <div id="repos-empty" class="hidden glass-panel rounded-2xl p-12 text-center space-y-2">
        <div class="text-4xl">📭</div>
        <h3 id="empty-repos-title" class="text-lg font-bold text-white">Nenhum repositório encontrado</h3>
      </div>
      <div id="repos-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"></div>
      <div class="mt-8 flex flex-col items-center gap-3">
        <div class="text-xs text-slate-400 font-mono"><span id="displayed-label">Exibindo</span> <span id="displayed-repos-count" class="font-bold text-sky-400">0</span> <span id="of-label">de</span> <span id="filtered-repos-count" class="font-bold text-white">0</span></div>
        <button id="load-more-btn" type="button" class="hidden px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 font-bold text-sm cursor-pointer">⬇️ Carregar mais</button>
      </div>
    </section>

    <footer id="page-footer" class="pt-8 pb-4 border-t border-white/10 text-center text-xs text-slate-500">GitVisão • Catálogo de repositórios GitHub para WhatsApp</footer>
  </main>

  <div id="visao-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm">
    <div class="glass-panel w-full max-w-5xl max-h-[92vh] rounded-2xl border border-white/15 shadow-2xl flex flex-col overflow-hidden">
      <div class="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-slate-950/60">
        <div class="flex flex-wrap items-center gap-2">
          <span id="modal-category-badge" class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30"></span>
          <h3 id="modal-repo-title" class="text-base sm:text-lg font-bold font-mono text-white"></h3>
        </div>
        <button id="modal-close-btn" type="button" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 cursor-pointer">✕</button>
      </div>
      <div class="p-5 sm:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div>
            <h4 id="modal-hook-title" class="text-lg font-extrabold text-white"></h4>
            <p id="modal-intro-text" class="text-sm text-slate-300 mt-2 leading-relaxed"></p>
          </div>
          <div id="modal-warning-box" class="hidden p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200"></div>
          <div class="flex flex-wrap gap-2 text-xs font-mono text-slate-300">
            <span id="modal-stars" class="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10"></span>
            <span id="modal-commit" class="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10"></span>
            <span id="modal-language" class="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10"></span>
          </div>
          <div class="p-4 rounded-xl bg-slate-900/90 border border-sky-500/25 space-y-2 text-xs">
            <div id="modal-ft-label" class="font-mono font-bold uppercase text-sky-400">📋 Ficha técnica</div>
            <div>📜 <span id="modal-ft-license" class="font-bold text-slate-100"></span> <span id="modal-ft-license-type" class="text-slate-400 font-mono"></span></div>
            <div>💰 <span id="modal-ft-cost" class="font-bold text-slate-100"></span> — <span id="modal-ft-cost-notes" class="text-slate-300"></span></div>
            <div>⚡ <span id="modal-ft-deploy" class="font-bold text-slate-100"></span> — <span id="modal-ft-deploy-method" class="text-slate-300"></span></div>
          </div>
          <ul id="modal-features-list" class="space-y-1.5 text-sm text-slate-200"></ul>
          <div class="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
            <h5 id="modal-scenario-title" class="text-xs font-bold uppercase text-sky-400"></h5>
            <p id="modal-scenario-intro" class="text-xs text-slate-300"></p>
            <blockquote id="modal-scenario-prompt" class="p-2.5 rounded-lg bg-slate-950 border-l-2 border-sky-400 text-xs font-mono text-sky-200"></blockquote>
            <ol id="modal-scenario-steps" class="space-y-1 text-xs text-slate-200"></ol>
            <p id="modal-scenario-outro" class="text-xs text-slate-400 italic"></p>
          </div>
          <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/25 space-y-1">
            <h5 id="modal-killer-title" class="text-xs font-bold text-emerald-300"></h5>
            <p id="modal-killer-text" class="text-xs text-slate-200 leading-relaxed"></p>
          </div>
          <div class="p-4 rounded-xl bg-slate-900/70 border border-white/10 space-y-1.5">
            <h5 id="modal-summary-heading" class="text-xs font-bold text-slate-300">📌 RESUMINDO</h5>
            <p id="modal-summary-text" class="text-xs text-slate-300 leading-relaxed"></p>
            <p id="modal-punchline" class="text-sm font-bold text-sky-300"></p>
          </div>
        </div>
        <div class="flex flex-col">
          <div class="flex items-center justify-between mb-2">
            <span id="modal-preview-label" class="text-xs font-mono uppercase text-emerald-400">📲 Preview no WhatsApp</span>
            <button id="modal-copy-whatsapp-btn" type="button" class="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer">📲 Copiar texto</button>
          </div>
          <div class="whatsapp-preview flex-1 rounded-2xl p-4 border border-white/10 overflow-y-auto max-h-[540px]">
            <div class="whatsapp-bubble p-4 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap" id="modal-whatsapp-text"></div>
          </div>
          <a id="modal-github-link" href="#" target="_blank" rel="noopener noreferrer" class="mt-3 self-start px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-white">🔗 Abrir no GitHub ↗</a>
        </div>
      </div>
    </div>
  </div>

  <script>
    var CATEGORIES = ['Agentes & Automação IA','SaaS & CRM Self-Hosted','Infra, Gateways & Edge','Terminal, CLI & DX','Frontend & UI Components','Scrapers & Engenharia de Dados','Cibersegurança & Pentest','Apps & Produtividade','Backend, Bancos & Storage','Outros'];
    var allRepos = [], nextCursor = null, hasMore = false, totalCount = 0, globalTotal = 0, categoryCounts = {};
    var isLoading = false, reposRequestId = 0, reposController = null, activeCategory = '', activeLicense = '', activeCost = '', activeDeploy = '', activeSort = 'recent', searchQuery = '';
    var currentRepo = null, searchTimer = null;

    var I18N_DICT = {
      pt: {
        subtitle: 'Catálogo de repositórios GitHub prontos para compartilhar no WhatsApp',
        reposSuffix: 'repositórios',
        checkTitle: 'Consultar repositório',
        checkDesc: 'Cole o link ou <span class="font-mono">owner/repo</span> para saber se já está no catálogo.',
        checkPlaceholder: 'https://github.com/owner/repo',
        checkBtn: '🔎 Verificar',
        checkVerifying: '⏳ Verificando...',
        alreadyCataloged: '✅ Já está no catálogo',
        copySummary: '📲 Copiar resumo p/ WhatsApp',
        viewFullVision: '👁️ Ver visão completa',
        notCatalogedTitle: 'Ainda não está no catálogo',
        notCatalogedDesc: 'não foi catalogado. Anotamos o pedido para a curadoria avaliar.',
        searchPlaceholder: '🔍 Buscar por nome, descrição ou linguagem...',
        sortRecent: '🕒 Mais recentes',
        sortStars: '⭐ Mais estrelas',
        sortName: '🔤 A-Z',
        clearFilter: '✕ Limpar',
        allLicenses: '📜 Todas as licenças',
        licensePermissive: '🟢 Permissiva (MIT, Apache)',
        licenseCopyleft: '🟡 Copyleft (AGPL, GPL)',
        allCosts: '💰 Todos os custos',
        costFreeLocal: '🟢 100% grátis & local',
        costByok: '🟡 Grátis (chaves de IA próprias)',
        costFreemium: '🟠 Freemium / open core',
        costPaidInfra: '🔴 Custos de servidor/APIs',
        allDeploys: '⚡ Todas as instalações',
        deployEasy: '🟢 Fácil',
        deployMedium: '🟡 Médio (Docker / .env)',
        deployAdvanced: '🔴 Avançado',
        allCategory: '✨ Todas',
        loadingRepos: 'Carregando catálogo...',
        noReposFound: 'Nenhum repositório encontrado',
        displayingCount: 'Exibindo',
        ofCount: 'de',
        loadMore: '⬇️ Carregar mais',
        footerText: 'GitVisão • Catálogo de repositórios GitHub para WhatsApp',
        modalViewVision: '👁️ Ver visão',
        modalCopy: '📲 Copiar',
        modalTechSpec: '📋 Ficha técnica',
        modalLastCommit: 'Último commit: ',
        modalSummaryHeader: '📌 RESUMINDO',
        modalWhatsAppPreview: '📲 Preview no WhatsApp',
        modalCopyTextBtn: '📲 Copiar texto',
        modalOpenGithub: '🔗 Abrir no GitHub ↗',
        copiedToast: '📲 Resumo copiado!',
        copyErrorToast: 'Não foi possível copiar.',
        loadErrorToast: 'Erro ao carregar repositórios.',
        checkErrorToast: 'Falha ao consultar.',
        invalidRepoToast: 'Repositório inválido.'
      },
      en: {
        subtitle: 'GitHub repository catalog ready to share on WhatsApp',
        reposSuffix: 'repositories',
        checkTitle: 'Check repository',
        checkDesc: 'Paste the link or <span class="font-mono">owner/repo</span> to check if it is already in the catalog.',
        checkPlaceholder: 'https://github.com/owner/repo',
        checkBtn: '🔎 Verify',
        checkVerifying: '⏳ Verifying...',
        alreadyCataloged: '✅ Already in the catalog',
        copySummary: '📲 Copy WhatsApp summary',
        viewFullVision: '👁️ View full vision',
        notCatalogedTitle: 'Not in the catalog yet',
        notCatalogedDesc: 'has not been cataloged. We noted the request for review.',
        searchPlaceholder: '🔍 Search by name, description or language...',
        sortRecent: '🕒 Most recent',
        sortStars: '⭐ Most stars',
        sortName: '🔤 A-Z',
        clearFilter: '✕ Clear',
        allLicenses: '📜 All licenses',
        licensePermissive: '🟢 Permissive (MIT, Apache)',
        licenseCopyleft: '🟡 Copyleft (AGPL, GPL)',
        allCosts: '💰 All costs',
        costFreeLocal: '🟢 100% free & local',
        costByok: '🟡 Free (own AI keys)',
        costFreemium: '🟠 Freemium / open core',
        costPaidInfra: '🔴 Server/API costs',
        allDeploys: '⚡ All setups',
        deployEasy: '🟢 Easy',
        deployMedium: '🟡 Medium (Docker / .env)',
        deployAdvanced: '🔴 Advanced',
        allCategory: '✨ All',
        loadingRepos: 'Loading catalog...',
        noReposFound: 'No repositories found',
        displayingCount: 'Showing',
        ofCount: 'of',
        loadMore: '⬇️ Load more',
        footerText: 'GitVisão • GitHub repository catalog for WhatsApp',
        modalViewVision: '👁️ View vision',
        modalCopy: '📲 Copy',
        modalTechSpec: '📋 Tech sheet',
        modalLastCommit: 'Last commit: ',
        modalSummaryHeader: '📌 SUMMARY',
        modalWhatsAppPreview: '📲 WhatsApp Preview',
        modalCopyTextBtn: '📲 Copy text',
        modalOpenGithub: '🔗 Open on GitHub ↗',
        copiedToast: '📲 Summary copied!',
        copyErrorToast: 'Could not copy.',
        loadErrorToast: 'Error loading repositories.',
        checkErrorToast: 'Check failed.',
        invalidRepoToast: 'Invalid repository.'
      },
      es: {
        subtitle: 'Catálogo de repositorios GitHub listos para compartir en WhatsApp',
        reposSuffix: 'repositorios',
        checkTitle: 'Consultar repositorio',
        checkDesc: 'Pega el enlace o <span class="font-mono">owner/repo</span> para saber si ya está en el catálogo.',
        checkPlaceholder: 'https://github.com/owner/repo',
        checkBtn: '🔎 Verificar',
        checkVerifying: '⏳ Verificando...',
        alreadyCataloged: '✅ Ya está en el catálogo',
        copySummary: '📲 Copiar resumen p/ WhatsApp',
        viewFullVision: '👁️ Ver visión completa',
        notCatalogedTitle: 'Aún no está en el catálogo',
        notCatalogedDesc: 'no fue catalogado. Anotamos la solicitud para que el equipo evalúe.',
        searchPlaceholder: '🔍 Buscar por nombre, descripción o lenguaje...',
        sortRecent: '🕒 Más recientes',
        sortStars: '⭐ Más estrellas',
        sortName: '🔤 A-Z',
        clearFilter: '✕ Limpiar',
        allLicenses: '📜 Todas las licencias',
        licensePermissive: '🟢 Permisiva (MIT, Apache)',
        licenseCopyleft: '🟡 Copyleft (AGPL, GPL)',
        allCosts: '💰 Todos los costos',
        costFreeLocal: '🟢 100% gratis & local',
        costByok: '🟡 Gratis (claves de IA propias)',
        costFreemium: '🟠 Freemium / open core',
        costPaidInfra: '🔴 Costos de servidor/APIs',
        allDeploys: '⚡ Todas las instalaciones',
        deployEasy: '🟢 Fácil',
        deployMedium: '🟡 Medio (Docker / .env)',
        deployAdvanced: '🔴 Avanzado',
        allCategory: '✨ Todas',
        loadingRepos: 'Cargando catálogo...',
        noReposFound: 'Ningún repositorio encontrado',
        displayingCount: 'Mostrando',
        ofCount: 'de',
        loadMore: '⬇️ Cargar más',
        footerText: 'GitVisão • Catálogo de repositorios GitHub para WhatsApp',
        modalViewVision: '👁️ Ver visión',
        modalCopy: '📲 Copiar',
        modalTechSpec: '📋 Ficha técnica',
        modalLastCommit: 'Último commit: ',
        modalSummaryHeader: '📌 RESUMEN',
        modalWhatsAppPreview: '📲 Vista previa en WhatsApp',
        modalCopyTextBtn: '📲 Copiar texto',
        modalOpenGithub: '🔗 Abrir en GitHub ↗',
        copiedToast: '📲 ¡Resumen copiado!',
        copyErrorToast: 'No fue posible copiar.',
        loadErrorToast: 'Error al cargar repositorios.',
        checkErrorToast: 'Fallo al consultar.',
        invalidRepoToast: 'Repositorio no válido.'
      }
    };

    var I18N_CATEGORIES = {
      pt: {
        'Agentes & Automação IA': 'Agentes & Automação IA',
        'SaaS & CRM Self-Hosted': 'SaaS & CRM Self-Hosted',
        'Infra, Gateways & Edge': 'Infra, Gateways & Edge',
        'Terminal, CLI & DX': 'Terminal, CLI & DX',
        'Frontend & UI Components': 'Frontend & UI Components',
        'Scrapers & Engenharia de Dados': 'Scrapers & Engenharia de Dados',
        'Cibersegurança & Pentest': 'Cibersegurança & Pentest',
        'Apps & Produtividade': 'Apps & Produtividade',
        'Backend, Bancos & Storage': 'Backend, Bancos & Storage',
        'Outros': 'Outros'
      },
      en: {
        'Agentes & Automação IA': 'AI Agents & Automation',
        'SaaS & CRM Self-Hosted': 'Self-Hosted SaaS & CRM',
        'Infra, Gateways & Edge': 'Infra, Gateways & Edge',
        'Terminal, CLI & DX': 'Terminal, CLI & DX',
        'Frontend & UI Components': 'Frontend & UI Components',
        'Scrapers & Engenharia de Dados': 'Scrapers & Data Engineering',
        'Cibersegurança & Pentest': 'Cybersecurity & Pentest',
        'Apps & Produtividade': 'Apps & Productivity',
        'Backend, Bancos & Storage': 'Backend, Databases & Storage',
        'Outros': 'Other'
      },
      es: {
        'Agentes & Automação IA': 'Agentes y Automatización IA',
        'SaaS & CRM Self-Hosted': 'SaaS & CRM Self-Hosted',
        'Infra, Gateways & Edge': 'Infra, Gateways & Edge',
        'Terminal, CLI & DX': 'Terminal, CLI & DX',
        'Frontend & UI Components': 'Frontend & Componentes UI',
        'Scrapers & Engenharia de Dados': 'Scrapers & Ingeniería de Datos',
        'Cibersegurança & Pentest': 'Ciberseguridad & Pentest',
        'Apps & Produtividade': 'Apps & Productividad',
        'Backend, Bancos & Storage': 'Backend, Bases de Datos & Storage',
        'Outros': 'Otros'
      }
    };

    var COST_I18N = {
      pt: { 'free-local': '🟢 100% Grátis & Local', 'byok-ai': '🟡 Grátis (BYOK)', 'freemium': '🟠 Freemium / Open Core', 'paid-infra': '🔴 Custos de servidor/APIs' },
      en: { 'free-local': '🟢 100% Free & Local', 'byok-ai': '🟡 Free (BYOK)', 'freemium': '🟠 Freemium / Open Core', 'paid-infra': '🔴 Server/API Costs' },
      es: { 'free-local': '🟢 100% Gratis y Local', 'byok-ai': '🟡 Gratis (BYOK)', 'freemium': '🟠 Freemium / Open Core', 'paid-infra': '🔴 Costos de servidor/APIs' }
    };

    var DEPLOY_I18N = {
      pt: { easy: '🟢 Fácil', medium: '🟡 Médio (Docker / .env)', advanced: '🔴 Avançado' },
      en: { easy: '🟢 Easy', medium: '🟡 Medium (Docker / .env)', advanced: '🔴 Advanced' },
      es: { easy: '🟢 Fácil', medium: '🟡 Medio (Docker / .env)', advanced: '🔴 Avanzado' }
    };

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&#39;');
    }
    function arr(v) {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v.trim()) { try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
      return [];
    }
    function safeUrl(u) { return /^https:[/][/]/.test(String(u || '')) ? u : '#'; }
    function stars(n) {
      n = Number(n || 0);
      var suffix = (currentLang === 'en' ? 'k' : ' mil');
      return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + suffix : String(n);
    }
    function dt(iso) {
      if (!iso) return 'N/D';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    }

    function toast(msg, type) {
      var el = document.createElement('div');
      el.className = 'px-4 py-2.5 rounded-xl border font-bold text-xs shadow-xl ' + (type === 'error' ? 'bg-rose-600 text-white border-rose-400' : 'bg-emerald-500 text-slate-950 border-emerald-300');
      el.textContent = msg;
      $('toast-container').appendChild(el);
      setTimeout(function () { el.remove(); }, 2800);
    }

    function copyText(text) {
      var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
      return navigator.clipboard.writeText(text).then(function () { toast(t.copiedToast); }, function () { toast(t.copyErrorToast, 'error'); });
    }

    function licenseBadge(r) {
      if (r.licenseBadge) return r.licenseBadge;
      var s = r.licenseSpdx || '';
      if (r.licenseType === 'copyleft') return '🟡 ' + (s || 'Copyleft');
      var openText = (currentLang === 'es' ? 'Código Abierto' : 'Open Source');
      return '🟢 ' + (s || openText);
    }

    function costBadge(r) {
      var cMap = COST_I18N[currentLang] || COST_I18N['pt'];
      return cMap[r.costModel] || r.costBadge || cMap['free-local'];
    }

    function deployBadge(r) {
      var dMap = DEPLOY_I18N[currentLang] || DEPLOY_I18N['pt'];
      return dMap[r.deployDifficulty] || r.deployBadge || dMap['medium'];
    }

    function norm(raw) {
      if (!raw) return null;
      var g = function (a, b, d) { return raw[a] != null ? raw[a] : (raw[b] != null ? raw[b] : d); };
      var full = g('full_name', 'fullName', g('repo_key', 'repoKey', ''));
      return {
        repoKey: String(g('repo_key', 'repoKey', full)).toLowerCase(), fullName: full,
        repoUrl: g('repo_url', 'repoUrl', 'https://github.com/' + full), description: g('description', 'description', ''),
        stars: Number(g('stars', 'stars', 0)), language: g('language', 'language', ''),
        lastCommitAt: g('last_commit_at', 'lastCommitAt', ''), category: g('category', 'category', 'Outros'),
        licenseSpdx: g('license_spdx', 'licenseSpdx', ''), licenseType: g('license_type', 'licenseType', ''),
        licenseBadge: g('license_badge', 'licenseBadge', ''), costModel: g('cost_model', 'costModel', 'free-local'),
        costBadge: g('cost_badge', 'costBadge', ''), costNotes: g('cost_notes', 'costNotes', ''),
        deployDifficulty: g('deploy_difficulty', 'deployDifficulty', 'medium'), deployBadge: g('deploy_badge', 'deployBadge', ''),
        deployMethod: g('deploy_method', 'deployMethod', ''), hookTitle: g('hook_title', 'hookTitle', ''),
        introText: g('intro_text', 'introText', ''), warningNote: g('warning_note', 'warningNote', ''),
        features: arr(raw.features != null ? raw.features : raw.features_json),
        scenarioTitle: g('scenario_title', 'scenarioTitle', '🧠 PENSE ASSIM:'), scenarioIntro: g('scenario_intro', 'scenarioIntro', ''),
        scenarioPrompt: g('scenario_prompt', 'scenarioPrompt', ''),
        scenarioSteps: arr(raw.scenarioSteps != null ? raw.scenarioSteps : (raw.scenario_steps != null ? raw.scenario_steps : raw.scenario_steps_json)),
        scenarioOutro: g('scenario_outro', 'scenarioOutro', ''), killerTitle: g('killer_title', 'killerTitle', '🤯 A parte mais interessante?'),
        killerText: g('killer_text', 'killerText', ''), summaryText: g('summary_text', 'summaryText', ''),
        punchline: g('punchline', 'punchline', ''), whatsappText: g('whatsapp_text', 'whatsappText', '')
      };
    }

    function passesClient(r) {
      if (activeLicense && (r.licenseType || '').toLowerCase() !== activeLicense) return false;
      if (activeCost && (r.costModel || '').toLowerCase() !== activeCost) return false;
      if (activeDeploy && (r.deployDifficulty || '').toLowerCase() !== activeDeploy) return false;
      return true;
    }
    function hasFilters() { return !!(activeCategory || activeLicense || activeCost || activeDeploy || searchQuery.trim()); }
    function updateClear() { $('clear-filters-btn').classList.toggle('hidden', !hasFilters()); }

    function detectInitialLang() {
      try {
        var saved = localStorage.getItem('gitvisao_lang');
        if (saved && I18N_DICT[saved]) return saved;
      } catch (e) {}
      var navLangs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'pt'];
      for (var i = 0; i < navLangs.length; i++) {
        var l = String(navLangs[i] || '').toLowerCase();
        if (l.startsWith('en')) return 'en';
        if (l.startsWith('es')) return 'es';
        if (l.startsWith('pt')) return 'pt';
      }
      return 'pt';
    }

    var currentLang = 'pt';

    function setLanguage(lang, triggerFetch) {
      if (!I18N_DICT[lang]) lang = 'pt';
      var previous = currentLang;
      currentLang = lang;
      try { localStorage.setItem('gitvisao_lang', lang); } catch (e) {}
      document.documentElement.lang = (lang === 'pt' ? 'pt-BR' : lang);

      var buttons = document.querySelectorAll('#lang-selector button');
      buttons.forEach(function(btn) {
        var l = btn.getAttribute('data-lang');
        if (l === lang) {
          btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500 text-slate-950 shadow-md transition-all cursor-pointer';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer';
        }
      });

      applyI18n();
      if (triggerFetch && previous !== lang) {
        fetchRepos(true);
      }
    }

    function applyI18n() {
      var t = I18N_DICT[currentLang] || I18N_DICT['pt'];

      var subtitleEl = $('header-subtitle');
      if (subtitleEl) subtitleEl.textContent = t.subtitle;

      var reposSuffixEl = $('repos-count-suffix');
      if (reposSuffixEl) reposSuffixEl.textContent = t.reposSuffix;

      var consultTitle = $('consult-title');
      if (consultTitle) consultTitle.textContent = t.checkTitle;

      var consultDesc = $('consult-desc');
      if (consultDesc) consultDesc.innerHTML = t.checkDesc;

      var repoInput = $('repo-input');
      if (repoInput) repoInput.placeholder = t.checkPlaceholder;

      var checkBtn = $('check-submit-btn');
      if (checkBtn) {
        var spanChild = checkBtn.querySelector('span');
        if (spanChild) spanChild.textContent = t.checkBtn;
        else checkBtn.textContent = t.checkBtn;
      }

      var existsBadge = $('exists-badge');
      if (existsBadge) existsBadge.textContent = t.alreadyCataloged;
      var existsCopyBtn = $('exists-copy-btn');
      if (existsCopyBtn) existsCopyBtn.textContent = t.copySummary;
      var existsViewBtn = $('exists-view-btn');
      if (existsViewBtn) existsViewBtn.textContent = t.viewFullVision;

      var notFoundTitle = $('not-found-title');
      if (notFoundTitle) notFoundTitle.textContent = t.notCatalogedTitle;
      var notFoundSuffix = $('not-found-suffix');
      if (notFoundSuffix) notFoundSuffix.textContent = t.notCatalogedDesc;

      var searchInput = $('search-input');
      if (searchInput) searchInput.placeholder = t.searchPlaceholder;

      var sortSelect = $('sort-select');
      if (sortSelect) {
        if (sortSelect.options[0]) sortSelect.options[0].textContent = t.sortRecent;
        if (sortSelect.options[1]) sortSelect.options[1].textContent = t.sortStars;
        if (sortSelect.options[2]) sortSelect.options[2].textContent = t.sortName;
      }

      var clearBtn = $('clear-filters-btn');
      if (clearBtn) clearBtn.textContent = t.clearFilter;

      var licSelect = $('filter-license-select');
      if (licSelect) {
        if (licSelect.options[0]) licSelect.options[0].textContent = t.allLicenses;
        if (licSelect.options[1]) licSelect.options[1].textContent = t.licensePermissive;
        if (licSelect.options[2]) licSelect.options[2].textContent = t.licenseCopyleft;
      }

      var costSelect = $('filter-cost-select');
      if (costSelect) {
        if (costSelect.options[0]) costSelect.options[0].textContent = t.allCosts;
        if (costSelect.options[1]) costSelect.options[1].textContent = t.costFreeLocal;
        if (costSelect.options[2]) costSelect.options[2].textContent = t.costByok;
        if (costSelect.options[3]) costSelect.options[3].textContent = t.costFreemium;
        if (costSelect.options[4]) costSelect.options[4].textContent = t.costPaidInfra;
      }

      var deploySelect = $('filter-deploy-select');
      if (deploySelect) {
        if (deploySelect.options[0]) deploySelect.options[0].textContent = t.allDeploys;
        if (deploySelect.options[1]) deploySelect.options[1].textContent = t.deployEasy;
        if (deploySelect.options[2]) deploySelect.options[2].textContent = t.deployMedium;
        if (deploySelect.options[3]) deploySelect.options[3].textContent = t.deployAdvanced;
      }

      var loadingEl = $('repos-loading');
      if (loadingEl) loadingEl.textContent = t.loadingRepos;

      var emptyHeading = $('empty-repos-title');
      if (emptyHeading) emptyHeading.textContent = t.noReposFound;

      var displayedLabel = $('displayed-label');
      if (displayedLabel) displayedLabel.textContent = t.displayingCount;

      var ofLabel = $('of-label');
      if (ofLabel) ofLabel.textContent = t.ofCount;

      var loadMoreBtn = $('load-more-btn');
      if (loadMoreBtn) loadMoreBtn.textContent = t.loadMore;

      var footer = $('page-footer');
      if (footer) footer.textContent = t.footerText;

      var ftLabel = $('modal-ft-label');
      if (ftLabel) ftLabel.textContent = t.modalTechSpec;

      var sumHeader = $('modal-summary-heading');
      if (sumHeader) sumHeader.textContent = t.modalSummaryHeader;

      var previewLabel = $('modal-preview-label');
      if (previewLabel) previewLabel.textContent = t.modalWhatsAppPreview;

      var copyBtnModal = $('modal-copy-whatsapp-btn');
      if (copyBtnModal) copyBtnModal.textContent = t.modalCopyTextBtn;

      var githubLink = $('modal-github-link');
      if (githubLink) githubLink.textContent = t.modalOpenGithub;

      renderPills();
      renderGrid('');
    }

    document.querySelectorAll('#lang-selector button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var lang = btn.getAttribute('data-lang');
        if (lang) setLanguage(lang, true);
      });
    });

    function fetchRepos(reset) {
      if (!reset && isLoading) return Promise.resolve();
      if (reset && reposController) reposController.abort();
      var requestId = ++reposRequestId;
      var controller = new AbortController();
      reposController = controller;
      isLoading = true;
      if (reset) { nextCursor = null; allRepos = []; $('repos-loading').classList.remove('hidden'); $('repos-empty').classList.add('hidden'); $('load-more-btn').classList.add('hidden'); }
      var p = new URLSearchParams();
      p.set('limit', '30'); p.set('sort', activeSort);
      p.set('lang', currentLang);
      if (searchQuery.trim()) p.set('q', searchQuery.trim());
      if (activeCategory) p.set('category', activeCategory);
      if (!reset && nextCursor) p.set('cursor', nextCursor);
      return fetch('/api/repos?' + p.toString(), { signal: controller.signal }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (requestId !== reposRequestId) return;
        nextCursor = data.nextCursor || null; hasMore = !!data.hasMore; totalCount = Number(data.total || 0);
        if (data.byCategory && typeof data.byCategory === 'object') categoryCounts = data.byCategory;
        if (!hasFilters()) globalTotal = totalCount;
        var list = (data.items || data.repos || []).map(norm).filter(Boolean).filter(passesClient);
        allRepos = reset ? list : allRepos.concat(list);
        $('total-repos-count').textContent = String(globalTotal || totalCount);
        $('displayed-repos-count').textContent = String(allRepos.length);
        $('filtered-repos-count').textContent = String(totalCount || allRepos.length);
        updateClear(); renderPills(); renderGrid('');
        $('load-more-btn').classList.toggle('hidden', !(hasMore && nextCursor));
      }).catch(function (error) {
        var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
        if (requestId === reposRequestId && error.name !== 'AbortError') toast(t.loadErrorToast, 'error');
      }).then(function () {
        if (requestId === reposRequestId) {
          isLoading = false; reposController = null; $('repos-loading').classList.add('hidden');
        }
      });
    }

    function renderPills() {
      var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
      var catMap = I18N_CATEGORIES[currentLang] || I18N_CATEGORIES['pt'];
      var known = {}; CATEGORIES.forEach(function (c) { known[c] = 1; });
      var cats = CATEGORIES.concat(Object.keys(categoryCounts).filter(function (c) { return !known[c] && categoryCounts[c] > 0; }));
      var pills = [{ label: t.allCategory, value: '', count: globalTotal || totalCount }].concat(cats.map(function (c) {
        var translatedLabel = catMap[c] || c;
        return { label: translatedLabel, value: c, count: Number(categoryCounts[c] || 0) };
      }));
      var box = $('category-pills');
      box.innerHTML = pills.map(function (p) {
        var on = activeCategory === p.value;
        return '<button type="button" data-category="' + esc(p.value) + '" class="shrink-0 px-3.5 py-1.5 rounded-full text-xs border cursor-pointer ' + (on ? 'bg-sky-500 text-slate-950 font-bold border-sky-400' : 'bg-slate-900/80 text-slate-300 border-white/10') + '">' + esc(p.label) + ' <span class="font-mono opacity-70">' + p.count + '</span></button>';
      }).join('');
      box.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () { activeCategory = b.getAttribute('data-category') || ''; fetchRepos(true); });
      });
    }

    function renderGrid(highlight) {
      var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
      var catMap = I18N_CATEGORIES[currentLang] || I18N_CATEGORIES['pt'];
      var grid = $('repos-grid');
      if (!allRepos.length) { grid.innerHTML = ''; $('repos-empty').classList.remove('hidden'); return; }
      $('repos-empty').classList.add('hidden');
      grid.innerHTML = allRepos.map(function (r) {
        var hl = highlight && r.repoKey === highlight;
        var badge = 'inline-flex px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-900/90 border border-white/10 text-slate-200';
        var categoryName = catMap[r.category] || r.category;
        return '<article class="glass-panel card-hover rounded-2xl p-5 flex flex-col justify-between border ' + (hl ? 'border-emerald-400' : 'border-white/10') + '">' +
          '<div class="space-y-3">' +
            '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/25">' + esc(categoryName) + '</span>' +
            '<div class="flex flex-wrap gap-1.5"><span class="' + badge + '">' + esc(licenseBadge(r)) + '</span><span class="' + badge + '">' + esc(costBadge(r)) + '</span><span class="' + badge + '">' + esc(deployBadge(r)) + '</span></div>' +
            '<div class="flex items-center justify-between gap-2"><a href="' + esc(safeUrl(r.repoUrl)) + '" target="_blank" rel="noopener noreferrer" class="font-mono text-sm font-bold text-sky-400 hover:underline truncate">' + esc(r.fullName) + '</a><span class="text-xs font-mono text-amber-300 shrink-0">⭐ ' + esc(stars(r.stars)) + '</span></div>' +
            '<h3 class="text-sm sm:text-base font-extrabold text-white leading-snug">' + esc(r.hookTitle) + '</h3>' +
            '<p class="text-xs text-slate-300 leading-relaxed line-clamp-3">' + esc(r.introText) + '</p>' +
          '</div>' +
          '<div class="pt-4 mt-4 border-t border-white/10 flex items-center gap-2">' +
            '<button type="button" data-action="view" data-repo="' + esc(r.repoKey) + '" class="flex-1 py-2 px-3 rounded-xl bg-white/10 text-white font-semibold text-xs cursor-pointer">' + esc(t.modalViewVision) + '</button>' +
            '<button type="button" data-action="copy" data-repo="' + esc(r.repoKey) + '" class="py-2 px-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-xs cursor-pointer">' + esc(t.modalCopy) + '</button>' +
          '</div></article>';
      }).join('');
      grid.querySelectorAll('button[data-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-repo');
          var repo = allRepos.filter(function (x) { return x.repoKey === key; })[0];
          if (!repo) return;
          if (btn.getAttribute('data-action') === 'view') openModal(repo); else copyText(repo.whatsappText);
        });
      });
    }

    function openModal(r) {
      currentRepo = r;
      var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
      var catMap = I18N_CATEGORIES[currentLang] || I18N_CATEGORIES['pt'];
      $('modal-category-badge').textContent = catMap[r.category] || r.category;
      $('modal-repo-title').textContent = r.fullName;
      $('modal-hook-title').textContent = r.hookTitle;
      $('modal-intro-text').textContent = r.introText;
      var w = $('modal-warning-box');
      w.textContent = r.warningNote || ''; w.classList.toggle('hidden', !r.warningNote);
      $('modal-stars').textContent = '⭐ ' + stars(r.stars);
      $('modal-commit').textContent = '🕒 ' + t.modalLastCommit + dt(r.lastCommitAt);
      $('modal-language').textContent = '💻 ' + (r.language || 'Open Source');
      $('modal-ft-license').textContent = licenseBadge(r);
      var copyleftLabel = (currentLang === 'en' ? '(Copyleft)' : (currentLang === 'es' ? '(Copyleft)' : '(Copyleft)'));
      var permissiveLabel = (currentLang === 'en' ? '(Permissive)' : (currentLang === 'es' ? '(Permisiva)' : '(Permissiva)'));
      $('modal-ft-license-type').textContent = r.licenseType === 'copyleft' ? copyleftLabel : permissiveLabel;
      $('modal-ft-cost').textContent = costBadge(r);
      $('modal-ft-cost-notes').textContent = r.costNotes || '';
      $('modal-ft-deploy').textContent = deployBadge(r);
      $('modal-ft-deploy-method').textContent = r.deployMethod || '';
      $('modal-features-list').innerHTML = r.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
      $('modal-scenario-title').textContent = r.scenarioTitle;
      $('modal-scenario-intro').textContent = r.scenarioIntro;
      $('modal-scenario-prompt').textContent = r.scenarioPrompt;
      $('modal-scenario-steps').innerHTML = r.scenarioSteps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      $('modal-scenario-outro').textContent = r.scenarioOutro;
      $('modal-killer-title').textContent = r.killerTitle;
      $('modal-killer-text').textContent = r.killerText;
      $('modal-summary-text').textContent = r.summaryText;
      $('modal-punchline').textContent = r.punchline;
      $('modal-whatsapp-text').textContent = r.whatsappText;
      $('modal-github-link').href = safeUrl(r.repoUrl);
      $('visao-modal').classList.remove('hidden'); $('visao-modal').classList.add('flex');
    }
    function closeModal() { $('visao-modal').classList.add('hidden'); $('visao-modal').classList.remove('flex'); }

    $('check-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = $('repo-input').value.trim();
      if (!raw) return;
      var btn = $('check-submit-btn');
      var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
      btn.disabled = true; btn.textContent = t.checkVerifying;
      fetch('/api/check?repo=' + encodeURIComponent(raw) + '&lang=' + encodeURIComponent(currentLang)).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (r) {
        $('check-exists-panel').classList.add('hidden'); $('check-not-found-panel').classList.add('hidden');
        if (!r.ok) { toast(r.data.error || t.invalidRepoToast, 'error'); return; }
        if (r.data.exists && r.data.repo) {
          var found = norm(r.data.repo); currentRepo = found;
          $('exists-repo-name').textContent = found.fullName;
          $('exists-repo-hook').textContent = found.hookTitle;
          $('check-exists-panel').classList.remove('hidden');
          renderGrid(found.repoKey);
        } else {
          currentRepo = null;
          $('not-found-repo-name').textContent = r.data.fullName || raw;
          $('check-not-found-panel').classList.remove('hidden');
        }
      }).catch(function () {
        var t = I18N_DICT[currentLang] || I18N_DICT['pt'];
        toast(t.checkErrorToast, 'error');
      }).then(function () {
        btn.disabled = false;
        var spanEl = btn.querySelector('span');
        if (spanEl) spanEl.textContent = t.checkBtn; else btn.textContent = t.checkBtn;
      });
    });
    $('exists-copy-btn').addEventListener('click', function () { if (currentRepo) copyText(currentRepo.whatsappText); });
    $('exists-view-btn').addEventListener('click', function () { if (currentRepo) openModal(currentRepo); });
    $('modal-close-btn').addEventListener('click', closeModal);
    $('visao-modal').addEventListener('click', function (e) { if (e.target.id === 'visao-modal') closeModal(); });
    $('modal-copy-whatsapp-btn').addEventListener('click', function () { if (currentRepo) copyText(currentRepo.whatsappText); });

    $('search-input').addEventListener('input', function (e) {
      searchQuery = e.target.value || ''; updateClear();
      clearTimeout(searchTimer); searchTimer = setTimeout(function () { fetchRepos(true); }, 300);
    });
    $('filter-license-select').addEventListener('change', function (e) { activeLicense = e.target.value; fetchRepos(true); });
    $('filter-cost-select').addEventListener('change', function (e) { activeCost = e.target.value; fetchRepos(true); });
    $('filter-deploy-select').addEventListener('change', function (e) { activeDeploy = e.target.value; fetchRepos(true); });
    $('sort-select').addEventListener('change', function (e) { activeSort = e.target.value || 'recent'; fetchRepos(true); });
    $('clear-filters-btn').addEventListener('click', function () {
      activeCategory = activeLicense = activeCost = activeDeploy = searchQuery = '';
      $('search-input').value = ''; $('filter-license-select').value = ''; $('filter-cost-select').value = ''; $('filter-deploy-select').value = '';
      fetchRepos(true);
    });
    $('load-more-btn').addEventListener('click', function () { fetchRepos(false); });

    // Inicialização com detecção de idioma do navegador e fallback para localStorage
    setLanguage(detectInitialLang());

    var qParam = new URLSearchParams(location.search).get('q');
    if (qParam) { searchQuery = qParam; $('search-input').value = qParam; }
    fetchRepos(true);
  </script>
</body>
</html>`;

// Página pública: casca HTML (SEO + Open Graph) + dados iniciais. Estilo e lógica ficam em
// public/app.css e public/app.js (servidos como assets estáticos pelo Worker).

import type { PromoConfig } from './promo.ts';

/** Troque ao alterar public/app.css ou public/app.js para furar o cache dos navegadores. */
export const ASSET_VERSION = '20261122a';

function escapeHtmlServer(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');

/** JSON seguro para embutir em <script>. */
function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LS, '\\u2028')
    .replace(PS, '\\u2029');
}

export interface PublicPageMeta {
  /** Título da aba/compartilhamento (ex.: "owner/repo • GitVisão"). */
  pageTitle?: string;
  description?: string;
  /** URL canônica absoluta. */
  url?: string;
  /** Imagem absoluta para og:image. */
  image?: string;
  /** JSON-LD extra (ex.: SoftwareSourceCode). */
  jsonLd?: Record<string, unknown>;
}

export interface PublicPageOptions {
  promo?: PromoConfig | null;
  meta?: PublicPageMeta;
  origin?: string;
}

const DEFAULT_DESCRIPTION =
  'Catálogo de repositórios open source com curadoria: o que faz, quanto custa e como instalar — com resumo pronto para o WhatsApp. Busca em linguagem natural.';

export function renderPublicHtml(title?: string, options: PublicPageOptions = {}): string {
  const appTitle = title || 'GitVisão • Pega a Visão';
  const origin = (options.origin || '').replace(/\/+$/, '');
  const meta = options.meta || {};
  const pageTitle = escapeHtmlServer(meta.pageTitle || appTitle);
  const description = escapeHtmlServer(meta.description || DEFAULT_DESCRIPTION);
  const url = escapeHtmlServer(meta.url || (origin ? `${origin}/` : '/'));
  const image = escapeHtmlServer(meta.image || `${origin}/img/og.jpg`);
  const v = ASSET_VERSION;
  const boot = jsonForScript({ title: appTitle, promo: options.promo ?? null });
  const ld = jsonForScript(
    meta.jsonLd || {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'GitVisão',
      url: origin ? `${origin}/` : undefined,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    }
  );

  return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${pageTitle}</title>
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="#05070d" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/svg+xml" href="/img/logo.svg" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="GitVisão" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://i.ytimg.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="preload" as="image" href="/img/hero.webp" media="(min-width: 720px)" />
  <link rel="preload" as="image" href="/img/hero-mobile.webp" media="(max-width: 719px)" />
  <link rel="stylesheet" href="/app.css?v=${v}" />
  <script type="application/ld+json">${ld}</script>
</head>
<body>
  <a class="sr-only" href="#explorar">Pular para o catálogo</a>
  <div id="toasts" class="toasts" aria-live="polite"></div>

  <header class="topbar" id="topbar">
    <div class="wrap">
      <a class="brand" href="/" aria-label="GitVisão — início"><img src="/img/logo.svg" alt="" width="38" height="38" /><span>Git<b class="grad-text">Visão</b></span></a>
      <nav class="nav" aria-label="Seções">
        <a href="#explorar" data-i18n="navExplore">Explorar</a>
        <a href="#categorias" data-i18n="navCategories">Categorias</a>
        <a href="#canal" data-i18n="navChannel">Canal</a>
        <a href="#bot" data-i18n="navBot">Bot do grupo</a>
      </nav>
      <div class="top-actions">
        <div id="lang-selector" class="lang" role="group" aria-label="Idioma">
          <button type="button" data-lang="pt" title="Português">PT</button>
          <button type="button" data-lang="en" title="English">EN</button>
          <button type="button" data-lang="es" title="Español">ES</button>
        </div>
        <a class="btn btn-sm btn-yt top-yt" href="https://www.youtube.com/@SamucaTutoriais?sub_confirmation=1" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9L15.5 12Z"/></svg><span data-i18n="channelBtn">Canal no YouTube</span></a>
      </div>
    </div>
  </header>

  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-media" id="hero-media">
      <picture>
        <source media="(max-width: 719px)" srcset="/img/hero-mobile.webp" />
        <img src="/img/hero.webp" alt="" width="1920" height="823" fetchpriority="high" />
      </picture>
    </div>
    <div class="wrap">
      <div class="hero-inner">
        <span class="eyebrow"><i class="pulse"></i><b id="stat-repos-eyebrow" class="mono"></b><span data-i18n="eyebrow">repositórios open source com curadoria</span></span>
        <h1 id="hero-title" data-i18n-html="heroTitle">Pega a visão do <span class="grad-text">open source</span> que importa.</h1>
        <p class="lead" data-i18n="heroLead"></p>
        <form class="omni" id="omni-form" role="search">
          <div class="omni-box">
            <svg class="lead-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <label class="sr-only" for="omni-input">Buscar</label>
            <input id="omni-input" type="search" autocomplete="off" enterkeyhint="search" data-i18n-ph="searchPlaceholder" />
            <button id="omni-btn" class="btn btn-primary" type="submit"><span data-i18n="checkTitle">Buscar</span></button>
          </div>
          <div class="omni-hint" id="examples"></div>
          <div id="check-panel" class="check-panel" hidden></div>
        </form>
        <div class="hero-stats">
          <div class="stat"><b id="stat-repos">—</b><span data-i18n="statRepos">repositórios</span></div>
          <div class="stat"><b id="stat-cats">—</b><span data-i18n="statCats">categorias</span></div>
          <div class="stat"><b id="stat-langs">—</b><span data-i18n="statLangs">linguagens</span></div>
        </div>
        <button type="button" class="hero-promo" id="hero-promo" hidden></button>
      </div>
    </div>
  </section>

  <section class="block" id="categorias" style="padding-top:24px">
    <div class="wrap">
      <div class="sec-head"><div><span class="kicker" data-i18n="catKicker">Navegue por tema</span><h2 data-i18n="catTitle">Categorias</h2><p data-i18n="catSub"></p></div></div>
      <div class="cats" id="cats"></div>
    </div>
  </section>

  <section class="block" id="canal" style="padding-top:8px" hidden>
    <div class="wrap">
      <div class="channel">
        <div class="channel-bg" aria-hidden="true"></div>
        <div class="channel-top">
          <img class="avatar" src="/img/channel.jpg" alt="" width="72" height="72" loading="lazy" />
          <div style="min-width:0;flex:1 1 280px">
            <span class="kicker" style="color:#ff8a8a" data-i18n="chKicker">Aprenda na prática</span>
            <h2 id="ch-name">Samuca Tutoriais</h2>
            <div class="channel-meta"><span id="ch-subs"></span></div>
            <p id="ch-tagline" style="margin-top:8px"></p>
          </div>
          <div class="channel-cta">
            <a id="ch-sub-btn" class="btn btn-yt" target="_blank" rel="noopener" href="https://www.youtube.com/@SamucaTutoriais?sub_confirmation=1"><span data-i18n="subscribe">Inscrever-se</span></a>
            <a id="ch-visit" class="btn" target="_blank" rel="noopener" href="https://www.youtube.com/@SamucaTutoriais"><span data-i18n="watchChannel">Ver canal</span></a>
          </div>
        </div>
        <div class="videos" id="videos"></div>
      </div>
    </div>
  </section>

  <section class="block" id="explorar" style="padding-top:24px">
    <div class="wrap">
      <div class="sec-head" style="margin-bottom:6px"><div><span class="kicker" data-i18n="expKicker">Explorar</span><h2 data-i18n="expTitle">Catálogo completo</h2></div></div>
      <div class="toolbar">
        <div class="tb-row">
          <label class="field search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="sr-only">Filtrar</span><input id="filter-input" type="search" autocomplete="off" data-i18n-ph="filterPlaceholder" /></label>
          <select id="sort-select" class="field" aria-label="Ordenar">
            <option value="relevance">Mais relevantes</option>
            <option value="recent">Mais recentes</option>
            <option value="stars">Mais estrelas</option>
            <option value="name">A–Z</option>
          </select>
          <select id="lang-filter" class="field" aria-label="Linguagem"></select>
          <select id="stars-filter" class="field" aria-label="Estrelas"></select>
          <button type="button" id="recent-toggle" class="toggle" aria-pressed="false"><span class="dot" style="background:var(--emerald)"></span><span data-i18n="active">Ativo nos últimos 90 dias</span></button>
        </div>
        <div class="result-meta" id="result-meta" aria-live="polite"></div>
      </div>
      <div class="grid" id="grid"></div>
      <div class="empty" id="empty" hidden><img src="/img/loader.gif" alt="" width="72" height="72" style="margin:0 auto;border-radius:50%" /><h3 data-i18n="noReposFound">Nada encontrado</h3><p data-i18n="noReposTip"></p></div>
      <div class="more" id="more" hidden>
        <span><span data-i18n="showing">Exibindo</span> <b id="shown-count">0</b> <span data-i18n="of">de</span> <b id="total-count">0</b></span>
        <button type="button" id="load-more" class="btn"><span data-i18n="loadMore">Carregar mais</span></button>
      </div>
    </div>
  </section>

  <section class="block" id="bot">
    <div class="wrap bot">
      <div>
        <span class="kicker" data-i18n="botKicker">Direto no grupo</span>
        <h2 style="font:700 clamp(26px,3.2vw,36px)/1.1 var(--display);letter-spacing:-.025em;margin:6px 0 10px" data-i18n="botTitle">Pergunte ao GitVisão no WhatsApp</h2>
        <p style="color:var(--text-2);margin:0" data-i18n="botSub"></p>
        <ul>
          <li>💬 <span data-i18n-html="botL1"></span></li>
          <li>⚡ <span data-i18n-html="botL2"></span></li>
          <li>🔗 <span data-i18n="botL3"></span></li>
        </ul>
      </div>
      <div class="wa" aria-hidden="true">
        <div class="wa-msg wa-in"><span class="wa-name">Marcos</span><span class="wa-mention">@Samuel Santos</span> vision temos repositórios voltados a segurança?</div>
        <div class="wa-msg wa-out">🤖 <b>GitVisão</b> — resultado para: <i>segurança</i>

1. <b>owner/scanner</b> ⭐ 12,3 mil
   Varredura de vulnerabilidades em 1 comando
   <span class="wa-link">vision.24hs.eu.org/?repo=owner/scanner</span>

🔎 Ver os 12 resultados no site:
<span class="wa-link">vision.24hs.eu.org/?q=segurança</span></div>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap">
      <a class="brand" href="/"><img src="/img/logo.svg" alt="" width="30" height="30" /><span style="font-size:16px">Git<b class="grad-text">Visão</b></span></a>
      <span data-i18n="footer">Catálogo de repositórios open source no formato Pega a Visão.</span>
      <a id="footer-channel" href="https://www.youtube.com/@SamucaTutoriais" target="_blank" rel="noopener">▶ Samuca Tutoriais</a>
    </div>
  </footer>

  <script>window.__GV__ = ${boot};</script>
  <script src="/app.js?v=${v}" defer></script>
</body>
</html>`;
}

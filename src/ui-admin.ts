// Painel /admin: configuração, inclusão manual, raspagem do WhatsApp (Evolution API) e fila de revisão.
// (Atenção: o script embutido não pode usar `${...}` nem barras invertidas.)

function escapeHtmlServer(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAdminHtml(defaultModel?: string): string {
  return ADMIN_TEMPLATE.split('__MODEL__').join(escapeHtmlServer(defaultModel || 'gemini-2.5-flash'));
}

const ADMIN_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>GitVisão • Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background:#07090e; color:#e6edf3; font-family: Inter, system-ui, sans-serif; }
    .panel { background: rgba(19,25,34,.9); border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:20px; }
    .inp { width:100%; padding:10px 14px; border-radius:12px; background:#020617; border:1px solid rgba(255,255,255,.15); color:#fff; font-size:14px; }
    .inp:focus { outline:none; border-color:#38bdf8; }
    .btn { padding:9px 16px; border-radius:12px; font-weight:700; font-size:13px; cursor:pointer; background:linear-gradient(90deg,#0ea5e9,#10b981); color:#020617; }
    .btn:disabled { opacity:.6; cursor:not-allowed; }
    .btn2 { padding:8px 14px; border-radius:12px; font-weight:600; font-size:12px; cursor:pointer; background:rgba(255,255,255,.1); color:#fff; }
    .lbl { display:block; font-size:12px; font-weight:600; color:#cbd5e1; margin-bottom:4px; }
    .tab { padding:8px 14px; border-radius:999px; font-size:13px; font-weight:600; cursor:pointer; border:1px solid rgba(255,255,255,.1); color:#cbd5e1; }
    .tab.on { background:#0ea5e9; color:#020617; border-color:#38bdf8; }
  </style>
</head>
<body class="min-h-screen">
  <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>

  <div id="login-view" class="min-h-screen flex items-center justify-center p-4">
    <form id="login-form" class="panel w-full max-w-sm space-y-4">
      <h1 class="text-lg font-bold">🔐 GitVisão • Admin</h1>
      <div>
        <label class="lbl" for="login-password">Senha de administrador</label>
        <input id="login-password" type="password" required autocomplete="current-password" class="inp font-mono" />
      </div>
      <p id="login-error" class="hidden text-xs text-rose-400 font-semibold"></p>
      <button class="btn w-full" type="submit">Entrar</button>
      <a href="/" class="block text-center text-xs text-slate-400 underline">← Voltar ao catálogo</a>
    </form>
  </div>

  <div id="app-view" class="hidden max-w-5xl mx-auto px-4 py-6 space-y-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-bold">⚙️ GitVisão • Administração</h1>
      <div class="flex items-center gap-3 text-xs">
        <a href="/" class="text-slate-400 underline">Ver catálogo</a>
        <button id="logout-btn" class="btn2" type="button">Sair</button>
      </div>
    </header>

    <div id="default-pass-warning" class="hidden p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-sm text-rose-200">
      ⚠️ Este painel ainda usa a senha padrão. Troque agora na aba Configurações.
    </div>

    <div class="flex flex-wrap gap-2" id="tabs">
      <button class="tab on" data-tab="queue" type="button">📥 Fila de revisão</button>
      <button class="tab" data-tab="scrape" type="button">📡 Raspagem (WhatsApp)</button>
      <button class="tab" data-tab="catalog" type="button">📚 Catálogo</button>
      <button class="tab" data-tab="add" type="button">➕ Incluir repositório</button>
      <button class="tab" data-tab="bot" type="button">🤖 Bot do grupo</button>
      <button class="tab" data-tab="promo" type="button">📺 Divulgação</button>
      <button class="tab" data-tab="settings" type="button">🔧 Configurações</button>
    </div>

    <!-- Fila -->
    <section id="tab-queue" class="panel space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold">Fila de revisão</h2>
          <p class="text-xs text-slate-400">Consultas de visitantes, repositórios sem licença aberta (em espera) e erros da raspagem.</p>
        </div>
        <div class="flex flex-wrap gap-2" id="queue-filters"></div>
      </div>
      <div id="queue-list" class="space-y-2"></div>
    </section>

    <!-- Raspagem -->
    <section id="tab-scrape" class="hidden space-y-5">
      <div class="panel space-y-4">
        <h2 class="font-bold">Evolution API</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label class="lbl" for="ev-url">URL da Evolution</label><input id="ev-url" class="inp font-mono" placeholder="https://sua-evolution.exemplo.com" /></div>
          <div><label class="lbl" for="ev-key">Chave (apikey)</label><input id="ev-key" type="password" class="inp font-mono" placeholder="Em branco mantém a atual" autocomplete="off" /><p id="ev-key-hint" class="text-[11px] text-slate-500 mt-1"></p></div>
          <div><label class="lbl" for="ev-instance">Instância</label><input id="ev-instance" class="inp font-mono" placeholder="nome-da-instancia" /></div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label class="lbl" for="ev-units">Orçamento por execução</label><input id="ev-units" type="number" min="1" max="40" class="inp" /></div>
          <div><label class="lbl" for="ev-pages">Páginas por execução</label><input id="ev-pages" type="number" min="1" max="20" class="inp" /></div>
          <div><label class="lbl" for="ev-size">Mensagens por página</label><input id="ev-size" type="number" min="20" max="500" class="inp" /></div>
          <div><label class="lbl" for="ev-lookback">Dias na 1ª leitura</label><input id="ev-lookback" type="number" min="1" max="365" class="inp" /></div>
        </div>
        <label class="flex items-center gap-2 text-sm"><input id="ev-enabled" type="checkbox" /> Ativar leitura automática (cron a cada 30 minutos)</label>
        <div class="flex flex-wrap gap-2">
          <button id="ev-save" class="btn" type="button">💾 Salvar</button>
          <button id="ev-groups" class="btn2" type="button">📋 Carregar grupos</button>
        </div>
      </div>

      <div class="panel space-y-3">
        <h2 class="font-bold">Grupos monitorados</h2>
        <div id="groups-box" class="space-y-1.5 text-sm"></div>
        <p class="text-xs text-slate-500">Marque os grupos e clique em Salvar. A lista de grupos pode levar ~10 s para carregar.</p>
      </div>

      <div class="panel space-y-3">
        <h2 class="font-bold">Execução</h2>
        <div class="flex flex-wrap gap-2">
          <button id="run-now" class="btn" type="button">▶️ Rodar agora</button>
          <button id="run-full" class="btn2" type="button">🗂️ Varrer histórico completo</button>
        </div>
        <div id="last-run" class="text-sm text-slate-300 space-y-1"></div>
      </div>
    </section>

    <!-- Catálogo -->
    <section id="tab-catalog" class="hidden panel space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold">Catálogo</h2>
          <p class="text-xs text-slate-400">Repositórios publicados. Excluir tira do catálogo e impede que a raspagem reinclua o mesmo link.</p>
        </div>
        <input id="cat-search" class="inp" style="max-width:260px" placeholder="Filtrar por nome..." />
      </div>
      <div id="cat-list" class="space-y-2"></div>
      <button id="cat-more" class="btn2 hidden" type="button">Carregar mais</button>
    </section>

    <!-- Incluir -->
    <section id="tab-add" class="hidden panel space-y-4">
      <h2 class="font-bold">Incluir repositório manualmente</h2>
      <p class="text-xs text-slate-400">Gera o resumo com IA e grava no catálogo. É a única porta de entrada manual.</p>
      <form id="add-form" class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div class="sm:col-span-2"><label class="lbl" for="add-repo">Link ou owner/repo</label><input id="add-repo" required class="inp font-mono" placeholder="https://github.com/owner/repo" /></div>
        <div>
          <label class="lbl" for="add-template">Template</label>
          <select id="add-template" class="inp">
            <option value="">🤖 Automático</option>
            <option value="ai-agent-automation">Agente IA &amp; Automação</option>
            <option value="self-hosted-saas">SaaS &amp; CRM Self-Hosted</option>
            <option value="infra-gateway">Infra, Gateway &amp; Edge</option>
            <option value="app-tool">App &amp; Ferramenta</option>
            <option value="dev-lib-cli">Lib, SDK &amp; CLI</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm sm:col-span-2"><input id="add-force" type="checkbox" /> Regerar se já existir</label>
        <button id="add-btn" class="btn" type="submit">✨ Gerar e salvar</button>
      </form>
      <p id="add-result" class="text-sm"></p>
      <hr class="border-white/10" />
      <h3 class="font-bold text-sm">Remover do catálogo</h3>
      <form id="del-form" class="flex gap-3">
        <input id="del-repo" required class="inp font-mono" placeholder="owner/repo" />
        <button class="btn2" type="submit" style="background:#be123c">Remover</button>
      </form>
    </section>

    <!-- Bot do grupo -->
    <section id="tab-bot" class="hidden panel space-y-4">
      <h2 class="font-bold">Bot do grupo (responde buscas no WhatsApp)</h2>
      <p class="text-xs text-slate-400">Usa a mesma instância da Evolution configurada na aba Raspagem. Gatilhos: mencionar o seu número junto com a palavra <b>vision</b> (ex.: <span class="font-mono">@Samuel vision temos algo de segurança?</span>) ou começar a mensagem com um dos comandos abaixo.</p>
      <form id="bot-form" class="space-y-4">
        <label class="flex items-center gap-2 text-sm"><input id="bot-enabled" type="checkbox" /> Bot ativado</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label class="lbl" for="bot-owner">Seu número (só dígitos, com DDI)</label><input id="bot-owner" class="inp font-mono" placeholder="5531999999999" /></div>
          <div><label class="lbl" for="bot-triggers">Comandos (separados por vírgula)</label><input id="bot-triggers" class="inp font-mono" /></div>
          <div><label class="lbl" for="bot-site">Endereço do site nos links</label><input id="bot-site" class="inp font-mono" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="lbl" for="bot-max">Resultados por resposta</label><input id="bot-max" type="number" min="1" max="10" class="inp" /></div>
            <div><label class="lbl" for="bot-cool">Intervalo mínimo (s)</label><input id="bot-cool" type="number" min="0" max="600" class="inp" /></div>
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm"><input id="bot-useai" type="checkbox" /> Responder com IA (resposta escrita pela IA usando só os repositórios encontrados; desmarcado = só a lista)</label>
        <label class="flex items-center gap-2 text-sm"><input id="bot-allgroups" type="checkbox" /> Responder em todos os grupos (desmarcado = só nos grupos marcados na Raspagem)</label>
        <button id="bot-save" class="btn" type="submit">💾 Salvar bot</button>
      </form>
      <div class="p-4 rounded-xl bg-slate-950/70 border border-white/10 space-y-3">
        <h3 class="font-bold text-sm">Webhook na Evolution</h3>
        <p class="text-xs text-slate-400">Endereço que a Evolution deve chamar a cada mensagem nova:</p>
        <div class="flex gap-2 flex-wrap"><input id="bot-webhook-url" class="inp font-mono" readonly /><button id="bot-copy-url" class="btn2" type="button">Copiar</button></div>
        <div class="flex gap-2 flex-wrap">
          <button id="bot-check-webhook" class="btn2" type="button">🔍 Ver webhook atual da instância</button>
          <button id="bot-register" class="btn2" type="button" style="background:#0e7490">⚡ Registrar este webhook na Evolution</button>
          <button id="bot-regen" class="btn2" type="button">🔑 Gerar novo segredo</button>
        </div>
        <pre id="bot-webhook-out" class="hidden text-[11px] whitespace-pre-wrap font-mono p-3 rounded-lg bg-black/40 border border-white/10 max-h-60 overflow-auto"></pre>
        <p class="text-[11px] text-amber-300">Atenção: a instância só tem um webhook. Se você já usa outro (n8n, outro bot), registrar este substitui o anterior; confira antes com "Ver webhook atual".</p>
      </div>
    </section>

    <!-- Divulgação -->
    <section id="tab-promo" class="hidden panel space-y-4">
      <h2 class="font-bold">Divulgação do canal na home</h2>
      <form id="promo-form" class="space-y-4">
        <label class="flex items-center gap-2 text-sm"><input id="pr-enabled" type="checkbox" /> Mostrar divulgação no site</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label class="lbl" for="pr-name">Nome do canal</label><input id="pr-name" class="inp" /></div>
          <div><label class="lbl" for="pr-handle">@ do canal</label><input id="pr-handle" class="inp font-mono" /></div>
          <div><label class="lbl" for="pr-url">Link do canal</label><input id="pr-url" class="inp font-mono" /></div>
          <div><label class="lbl" for="pr-subs">Texto de inscritos</label><input id="pr-subs" class="inp" placeholder="14,5 mil inscritos" /></div>
          <div class="sm:col-span-2"><label class="lbl" for="pr-tagline">Frase do canal</label><input id="pr-tagline" class="inp" /></div>
          <div><label class="lbl" for="pr-every">Card de vídeo a cada N repositórios (0 = não intercalar)</label><input id="pr-every" type="number" min="0" max="50" class="inp" /></div>
        </div>
        <div><label class="lbl" for="pr-videos">Vídeos em destaque (um link do YouTube por linha, na ordem de exibição; o 1º aparece no topo da home)</label>
          <textarea id="pr-videos" rows="6" class="inp font-mono" style="resize:vertical"></textarea>
          <p class="text-[11px] text-slate-500 mt-1">Os títulos são buscados automaticamente no YouTube ao salvar.</p></div>
        <button id="pr-save" class="btn" type="submit">💾 Salvar divulgação</button>
      </form>
      <div id="pr-preview" class="grid grid-cols-2 sm:grid-cols-4 gap-3"></div>
    </section>

    <!-- Configurações -->
    <section id="tab-settings" class="hidden panel space-y-4">
      <h2 class="font-bold">Configurações (salvas no banco D1)</h2>
      <form id="settings-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2"><label class="lbl" for="st-url">URL do OmniRoute (endpoint /v1 compatível com OpenAI)</label><input id="st-url" class="inp font-mono" placeholder="https://seu-omniroute.exemplo.com/v1" /></div>
          <div><label class="lbl" for="st-key">API Key do OmniRoute</label><input id="st-key" type="password" class="inp font-mono" autocomplete="off" placeholder="Em branco mantém a atual" /><p id="st-key-hint" class="text-[11px] text-slate-500 mt-1"></p></div>
          <div><label class="lbl" for="st-model">Modelo de IA</label><input id="st-model" class="inp font-mono" value="__MODEL__" /></div>
          <div><label class="lbl" for="st-gh">GitHub Token (opcional)</label><input id="st-gh" type="password" class="inp font-mono" autocomplete="off" placeholder="Em branco mantém o atual" /><p id="st-gh-hint" class="text-[11px] text-slate-500 mt-1"></p></div>
          <div><label class="lbl" for="st-title">Título do catálogo</label><input id="st-title" class="inp" /></div>
          <div class="sm:col-span-2"><label class="lbl" for="st-newpass">Nova senha de admin (opcional)</label><input id="st-newpass" type="password" class="inp font-mono" autocomplete="new-password" placeholder="Em branco mantém a atual" /></div>
        </div>
        <div class="flex flex-wrap gap-2 items-center"><button id="st-save" class="btn" type="submit">💾 Salvar configurações</button><button id="st-test-ai" class="btn2" type="button">🧪 Testar IA (OmniRoute)</button></div>
        <p id="st-test-out" class="hidden text-xs font-mono p-3 rounded-lg bg-black/40 border border-white/10"></p>
      </form>
    </section>
  </div>

  <script>
    var TOKEN_KEY = 'gitvisao_admin_token';
    var statusCache = null, queueStatus = 'requested', groupsLoaded = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&#39;');
    }
    function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
    function setToken(t) { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }
    function toast(msg, type) {
      var el = document.createElement('div');
      el.className = 'px-4 py-2.5 rounded-xl border font-bold text-xs shadow-xl ' + (type === 'error' ? 'bg-rose-600 text-white border-rose-400' : 'bg-emerald-500 text-slate-950 border-emerald-300');
      el.textContent = msg;
      $('toast-container').appendChild(el);
      setTimeout(function () { el.remove(); }, 3500);
    }
    function api(path, method, body) {
      var opts = { method: method || 'GET', headers: { 'X-Admin-Password': getToken() } };
      if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      return fetch(path, opts).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 401) { setToken(''); showLogin(); throw new Error('Sessão expirada. Entre novamente.'); }
          if (!res.ok || data.ok === false) throw new Error(data.error || data.message || ('Erro ' + res.status));
          return data;
        });
      });
    }
    function busy(btn, on, label) { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; }

    function showLogin() { $('app-view').classList.add('hidden'); $('login-view').classList.remove('hidden'); }
    function showApp() { $('login-view').classList.add('hidden'); $('app-view').classList.remove('hidden'); loadStatus(); }

    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('login-password').value;
      fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
        .then(function (res) { if (!res.ok) throw new Error('Senha incorreta.'); setToken(pw); $('login-password').value = ''; $('login-error').classList.add('hidden'); showApp(); })
        .catch(function (err) { $('login-error').textContent = err.message; $('login-error').classList.remove('hidden'); });
    });
    $('logout-btn').addEventListener('click', function () { setToken(''); showLogin(); });

    document.querySelectorAll('#tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#tabs .tab').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        ['queue', 'scrape', 'catalog', 'add', 'bot', 'promo', 'settings'].forEach(function (n) { $('tab-' + n).classList.toggle('hidden', n !== t.getAttribute('data-tab')); });
        if (t.getAttribute('data-tab') === 'catalog') loadCatalog(true);
        if (t.getAttribute('data-tab') === 'bot') loadBot();
        if (t.getAttribute('data-tab') === 'promo') loadPromo();
      });
    });

    function loadStatus() {
      return api('/api/admin/status').then(function (d) {
        statusCache = d;
        $('default-pass-warning').classList.toggle('hidden', !d.settings.usingDefaultPassword);
        var ing = d.ingest;
        $('ev-url').value = ing.baseUrl || ''; $('ev-instance').value = ing.instance || '';
        $('ev-units').value = ing.maxUnitsPerRun; $('ev-pages').value = ing.maxPagesPerRun;
        $('ev-size').value = ing.pageSize; $('ev-lookback').value = ing.lookbackDays;
        $('ev-enabled').checked = !!ing.enabled;
        $('ev-key-hint').textContent = ing.hasApiKey ? 'Chave salva: ' + ing.apiKeyMasked : 'Nenhuma chave salva.';
        var s = d.settings;
        $('st-url').value = s.omnirouteBaseUrl || ''; $('st-model').value = s.omnirouteModel || $('st-model').value;
        $('st-title').value = s.publicAppTitle || '';
        $('st-key-hint').textContent = s.hasOmnirouteApiKey ? 'Chave salva: ' + s.omnirouteApiKeyMasked : 'Nenhuma chave salva.';
        $('st-gh-hint').textContent = s.hasGithubToken ? 'Token salvo: ' + s.githubTokenMasked : 'Nenhum token salvo.';
        renderGroups(ing.groups || [], null);
        renderLastRun(d.lastRun);
        renderQueueFilters(d.counts, d.catalogTotal);
        loadQueue();
      }).catch(function (err) { toast(err.message, 'error'); });
    }

    var STATUS_LABEL = { requested: '👀 Consultados', pending: '⏳ Em espera', error: '⚠️ Erros', ignored: '🚫 Ignorados', added: '✅ Adicionados' };
    function renderQueueFilters(counts, total) {
      $('queue-filters').innerHTML = ['requested', 'pending', 'error', 'ignored', 'added'].map(function (k) {
        return '<button type="button" data-st="' + k + '" class="tab ' + (queueStatus === k ? 'on' : '') + '">' + STATUS_LABEL[k] + ' (' + (counts[k] || 0) + ')</button>';
      }).join('') + '<span class="text-xs text-slate-500 self-center">Catálogo: ' + total + '</span>';
      $('queue-filters').querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () { queueStatus = b.getAttribute('data-st'); renderQueueFilters(counts, total); loadQueue(); });
      });
    }

    function loadQueue() {
      return api('/api/admin/ingest/items?status=' + queueStatus).then(function (d) {
        var box = $('queue-list');
        if (!d.items.length) { box.innerHTML = '<p class="text-sm text-slate-500">Nada por aqui.</p>'; return; }
        box.innerHTML = d.items.map(function (it) {
          var canApprove = it.status !== 'added';
          return '<div class="p-3 rounded-xl bg-slate-900/70 border border-white/10 flex flex-wrap items-center justify-between gap-3">' +
            '<div class="min-w-0"><a class="font-mono text-sm font-bold text-sky-400 underline" target="_blank" rel="noopener noreferrer" href="https://github.com/' + esc(it.full_name) + '">' + esc(it.full_name) + '</a>' +
            ' <span class="text-xs text-slate-400">' + (it.license_spdx ? esc(it.license_spdx) + ' • ' : '') + (it.stars ? '⭐ ' + it.stars + ' • ' : '') + esc(it.source || '') + '</span>' +
            '<p class="text-xs text-slate-400">' + esc(it.reason || '') + '</p></div>' +
            '<div class="flex gap-2 shrink-0">' +
            (canApprove ? '<button class="btn" data-act="approve" data-key="' + esc(it.repo_key) + '" type="button">✅ Incluir</button>' : '') +
            (it.status === 'error' ? '<button class="btn2" data-act="retry" data-key="' + esc(it.repo_key) + '" type="button">🔁 Tentar de novo</button>' : '') +
            (it.status !== 'ignored' && it.status !== 'added' ? '<button class="btn2" data-act="dismiss" data-key="' + esc(it.repo_key) + '" type="button">🚫 Dispensar</button>' : '') +
            (it.status !== 'ignored' ? '<button class="btn2" data-act="delete" data-key="' + esc(it.repo_key) + '" type="button" style="background:#be123c">🗑️ Excluir</button>' : '') +
            '</div></div>';
        }).join('');
        box.querySelectorAll('button[data-act]').forEach(function (b) {
          b.addEventListener('click', function () {
            var act = b.getAttribute('data-act');
            if (act === 'delete' && !confirm('Excluir ' + b.getAttribute('data-key') + '? Se estiver no catálogo, será removido.')) return;
            busy(b, true, '⏳...');
            api('/api/admin/ingest/review', 'POST', { repoKey: b.getAttribute('data-key'), action: act })
              .then(function (r) { toast(r.message || 'Feito.'); return loadStatus(); })
              .catch(function (err) { toast(err.message, 'error'); busy(b, false); });
          });
        });
      }).catch(function (err) { toast(err.message, 'error'); });
    }

    var catCursor = null, catItems = [];
    function loadCatalog(reset) {
      if (reset) { catCursor = null; catItems = []; }
      var p = new URLSearchParams(); p.set('limit', '50'); p.set('sort', 'recent');
      var q = $('cat-search').value.trim(); if (q) p.set('q', q);
      if (!reset && catCursor) p.set('cursor', catCursor);
      fetch('/api/repos?' + p.toString()).then(function (r) { return r.json(); }).then(function (d) {
        catCursor = d.nextCursor || null;
        catItems = catItems.concat(d.items || []);
        $('cat-list').innerHTML = catItems.length ? catItems.map(function (r) {
          var key = String(r.repo_key || '');
          return '<div class="p-3 rounded-xl bg-slate-900/70 border border-white/10 flex flex-wrap items-center justify-between gap-3">' +
            '<div class="min-w-0"><span class="font-mono text-sm font-bold text-sky-400">' + esc(r.full_name) + '</span> <span class="text-xs text-slate-400">' + esc(r.license_spdx || '') + ' • ⭐ ' + esc(r.stars) + '</span>' +
            '<p class="text-xs text-slate-400">' + esc(r.hook_title || '') + '</p></div>' +
            '<button class="btn2" data-del="' + esc(key) + '" type="button" style="background:#be123c">🗑️ Excluir</button></div>';
        }).join('') : '<p class="text-sm text-slate-500">Nada encontrado.</p>';
        $('cat-more').classList.toggle('hidden', !(d.hasMore && catCursor));
        $('cat-list').querySelectorAll('button[data-del]').forEach(function (b) {
          b.addEventListener('click', function () {
            var key = b.getAttribute('data-del');
            if (!confirm('Excluir ' + key + ' do catálogo?')) return;
            busy(b, true, '⏳...');
            api('/api/admin/ingest/review', 'POST', { repoKey: key, action: 'delete' })
              .then(function (r) { toast(r.message || 'Removido.'); loadCatalog(true); return loadStatus(); })
              .catch(function (err) { toast(err.message, 'error'); busy(b, false); });
          });
        });
      }).catch(function () { toast('Erro ao carregar o catálogo.', 'error'); });
    }
    $('cat-more').addEventListener('click', function () { loadCatalog(false); });
    var catTimer = null;
    $('cat-search').addEventListener('input', function () { clearTimeout(catTimer); catTimer = setTimeout(function () { loadCatalog(true); }, 300); });

    function renderGroups(saved, available) {
      var map = {};
      (available || []).forEach(function (g) { map[g.jid] = { jid: g.jid, name: g.name, enabled: false }; });
      saved.forEach(function (g) { map[g.jid] = { jid: g.jid, name: g.name, enabled: g.enabled }; });
      var list = Object.keys(map).map(function (k) { return map[k]; });
      groupsLoaded = list;
      $('groups-box').innerHTML = list.length ? list.map(function (g, i) {
        return '<label class="flex items-center gap-2"><input type="checkbox" data-i="' + i + '" ' + (g.enabled ? 'checked' : '') + ' /> ' + esc(g.name) + '</label>';
      }).join('') : '<p class="text-slate-500">Nenhum grupo selecionado. Salve a conexão e clique em "Carregar grupos".</p>';
    }

    function renderLastRun(r) {
      if (!r) { $('last-run').textContent = 'Nenhuma execução registrada ainda.'; return; }
      var lines = ['Última execução (' + r.trigger + ') em ' + new Date(r.startedAt).toLocaleString('pt-BR')];
      if (r.skipped) lines.push('Pulada: ' + r.skipped);
      if (r.fatalError) lines.push('Erro: ' + r.fatalError);
      lines.push('Mensagens lidas: ' + r.messagesScanned + ' • Links: ' + r.candidates + ' • Adicionados: ' + r.added + ' • Em espera: ' + r.pending + ' • Ignorados: ' + r.ignored + ' • Erros: ' + r.errors + ' • Já conhecidos: ' + r.alreadyKnown);
      if (r.truncated) lines.push('Parou pelo orçamento; continua na próxima execução.');
      if (r.gap) lines.push('Atenção: havia mensagens antigas fora da janela lida. Use "Varrer histórico completo".');
      if (r.rateLimited) lines.push('Limite da API do GitHub atingido; configure um token em Configurações.');
      $('last-run').innerHTML = lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    }

    function collectGroups() {
      var out = [];
      document.querySelectorAll('#groups-box input[type=checkbox]').forEach(function (c) {
        var g = groupsLoaded[Number(c.getAttribute('data-i'))];
        if (g) out.push({ jid: g.jid, name: g.name, enabled: c.checked });
      });
      return out.filter(function (g) { return g.enabled; });
    }

    $('ev-save').addEventListener('click', function () {
      var btn = $('ev-save'); busy(btn, true);
      var payload = {
        enabled: $('ev-enabled').checked, baseUrl: $('ev-url').value.trim(), instance: $('ev-instance').value.trim(),
        maxUnitsPerRun: Number($('ev-units').value), maxPagesPerRun: Number($('ev-pages').value),
        pageSize: Number($('ev-size').value), lookbackDays: Number($('ev-lookback').value), groups: collectGroups()
      };
      var k = $('ev-key').value.trim(); if (k) payload.apiKey = k;
      api('/api/admin/ingest/config', 'POST', payload).then(function () { $('ev-key').value = ''; toast('Configuração da raspagem salva.'); return loadStatus(); })
        .catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false); });
    });

    $('ev-groups').addEventListener('click', function () {
      var btn = $('ev-groups'); busy(btn, true, '⏳ Carregando...');
      api('/api/admin/ingest/groups', 'POST', {}).then(function (d) {
        renderGroups((statusCache && statusCache.ingest.groups) || [], d.groups);
        toast(d.groups.length + ' grupos encontrados.');
      }).catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false, '📋 Carregar grupos'); });
    });

    function runIngest(full, btn, label) {
      busy(btn, true, '⏳ Executando...');
      api('/api/admin/ingest/run', 'POST', { fullBackfill: full }).then(function (d) {
        renderLastRun(d.summary); toast('Execução concluída.'); return loadStatus();
      }).catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false, label); });
    }
    $('run-now').addEventListener('click', function () { runIngest(false, $('run-now'), '▶️ Rodar agora'); });
    $('run-full').addEventListener('click', function () {
      if (confirm('Ler todo o histórico do grupo pode levar várias execuções e consome a API do GitHub. Continuar?')) runIngest(true, $('run-full'), '🗂️ Varrer histórico completo');
    });

    $('add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('add-btn'); busy(btn, true, '⏳ Gerando...');
      var body = { repo: $('add-repo').value.trim(), force: $('add-force').checked };
      if ($('add-template').value) body.templateType = $('add-template').value;
      api('/api/repos', 'POST', body).then(function (d) {
        var r = d.repo || {};
        $('add-result').textContent = (d.cached ? 'Já estava no catálogo: ' : 'Incluído: ') + (r.fullName || r.full_name || body.repo);
        $('add-repo').value = ''; return loadStatus();
      }).catch(function (err) { $('add-result').textContent = err.message; toast(err.message, 'error'); })
        .then(function () { busy(btn, false, '✨ Gerar e salvar'); });
    });

    $('del-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var key = $('del-repo').value.trim().toLowerCase();
      var parts = key.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) { toast('Use o formato owner/repo.', 'error'); return; }
      if (!confirm('Remover ' + key + ' do catálogo?')) return;
      api('/api/repos/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]), 'DELETE')
        .then(function () { toast('Removido.'); $('del-repo').value = ''; return loadStatus(); })
        .catch(function (err) { toast(err.message, 'error'); });
    });

    $('settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('st-save'); busy(btn, true);
      var body = { password: getToken(), omnirouteBaseUrl: $('st-url').value.trim(), omnirouteModel: $('st-model').value.trim(), publicAppTitle: $('st-title').value.trim() };
      if ($('st-key').value.trim()) body.omnirouteApiKey = $('st-key').value.trim();
      if ($('st-gh').value.trim()) body.githubToken = $('st-gh').value.trim();
      var np = $('st-newpass').value.trim(); if (np) body.newPassword = np;
      api('/api/settings', 'POST', body).then(function () {
        if (np) setToken(np);
        ['st-key', 'st-gh', 'st-newpass'].forEach(function (id) { $(id).value = ''; });
        toast('Configurações salvas.'); return loadStatus();
      }).catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false); });
    });

    $('st-test-ai').addEventListener('click', function () {
      var btn = this, out = $('st-test-out'); busy(btn, true);
      out.classList.remove('hidden'); out.textContent = 'Testando...';
      api('/api/admin/ai/test', 'POST', {}).then(function (d) {
        var t = d.test || {};
        out.textContent = (t.ok ? '✅ IA funcionando' : '❌ Falhou') + ' | modelo: ' + t.model + ' | endpoint: ' + t.endpoint + (t.status ? ' | HTTP ' + t.status : '') + (t.latencyMs != null ? ' | ' + t.latencyMs + ' ms' : '') + (t.reply ? ' | resposta: ' + t.reply : '') + (t.error ? ' | erro: ' + t.error : '');
      }).catch(function (err) { out.textContent = '❌ ' + err.message; }).then(function () { busy(btn, false, '🧪 Testar IA (OmniRoute)'); });
    });

    // ---------------- Bot do grupo
    function fillBot(b) {
      $('bot-enabled').checked = !!b.enabled;
      $('bot-owner').value = b.ownerNumber || '';
      $('bot-triggers').value = (b.triggers || []).join(', ');
      $('bot-site').value = b.siteUrl || '';
      $('bot-max').value = b.maxResults || 5;
      $('bot-cool').value = b.cooldownSeconds == null ? 8 : b.cooldownSeconds;
      $('bot-allgroups').checked = !!b.allowAllGroups;
      $('bot-useai').checked = b.useAi !== false;
      $('bot-webhook-url').value = location.origin + (b.webhookPath || '');
    }
    function loadBot() { return api('/api/admin/bot/config').then(function (d) { fillBot(d.bot); }).catch(function (err) { toast(err.message, 'error'); }); }
    function showOut(data) { var o = $('bot-webhook-out'); o.textContent = JSON.stringify(data, null, 2); o.classList.remove('hidden'); }
    $('bot-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('bot-save'); busy(btn, true);
      var body = {
        enabled: $('bot-enabled').checked,
        ownerNumber: $('bot-owner').value.split('').filter(function (c) { return c >= '0' && c <= '9'; }).join(''),
        triggers: $('bot-triggers').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        siteUrl: $('bot-site').value.trim(),
        maxResults: Number($('bot-max').value || 5),
        cooldownSeconds: Number($('bot-cool').value || 0),
        allowAllGroups: $('bot-allgroups').checked,
        useAi: $('bot-useai').checked
      };
      api('/api/admin/bot/config', 'POST', body).then(function (d) { fillBot(d.bot); toast('Bot salvo.'); })
        .catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false); });
    });
    $('bot-copy-url').addEventListener('click', function () { navigator.clipboard.writeText($('bot-webhook-url').value).then(function () { toast('Endereço copiado.'); }); });
    $('bot-check-webhook').addEventListener('click', function () {
      api('/api/admin/bot/webhook').then(showOut).catch(function (err) { toast(err.message, 'error'); });
    });
    $('bot-register').addEventListener('click', function () {
      if (!confirm('Registrar o webhook do GitVisão na sua instância da Evolution? Ele substitui o webhook atual da instância, se houver.')) return;
      var btn = this; busy(btn, true);
      api('/api/admin/bot/webhook/register', 'POST', {}).then(function (d) { showOut(d); toast('Webhook registrado.'); })
        .catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false); });
    });
    $('bot-regen').addEventListener('click', function () {
      if (!confirm('Gerar um novo segredo? O endereço do webhook muda e será preciso registrá-lo de novo na Evolution.')) return;
      api('/api/admin/bot/config', 'POST', { regenerateSecret: true }).then(function (d) { fillBot(d.bot); toast('Novo segredo gerado. Registre o webhook de novo.'); })
        .catch(function (err) { toast(err.message, 'error'); });
    });

    // ---------------- Divulgação
    function fillPromo(p) {
      $('pr-enabled').checked = !!p.enabled;
      $('pr-name').value = p.channelName || '';
      $('pr-handle').value = p.channelHandle || '';
      $('pr-url').value = p.channelUrl || '';
      $('pr-subs').value = p.subscribersLabel || '';
      $('pr-tagline').value = p.channelTagline || '';
      $('pr-every').value = p.gridEvery == null ? 9 : p.gridEvery;
      $('pr-videos').value = (p.videos || []).map(function (v) { return 'https://www.youtube.com/watch?v=' + v.id + (v.start ? '&t=' + v.start + 's' : ''); }).join(String.fromCharCode(10));
      $('pr-preview').innerHTML = (p.videos || []).map(function (v) {
        return '<div class="space-y-1"><img class="rounded-lg w-full" src="https://i.ytimg.com/vi/' + esc(v.id) + '/mqdefault.jpg" alt=""><p class="text-[11px] text-slate-300">' + esc(v.title) + '</p></div>';
      }).join('');
    }
    function loadPromo() { return api('/api/admin/promo').then(function (d) { fillPromo(d.promo); }).catch(function (err) { toast(err.message, 'error'); }); }
    $('promo-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('pr-save'); busy(btn, true);
      var body = {
        enabled: $('pr-enabled').checked,
        channelName: $('pr-name').value.trim(),
        channelHandle: $('pr-handle').value.trim(),
        channelUrl: $('pr-url').value.trim(),
        subscribersLabel: $('pr-subs').value.trim(),
        channelTagline: $('pr-tagline').value.trim(),
        gridEvery: Number($('pr-every').value || 0),
        videoUrls: $('pr-videos').value.split(String.fromCharCode(10)).map(function (x) { return x.trim(); }).filter(Boolean)
      };
      api('/api/admin/promo', 'POST', body).then(function (d) { fillPromo(d.promo); toast('Divulgação salva.'); })
        .catch(function (err) { toast(err.message, 'error'); }).then(function () { busy(btn, false); });
    });

    if (getToken()) showApp(); else showLogin();
  </script>
</body>
</html>`;

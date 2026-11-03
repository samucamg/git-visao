import type { CategoryName, GeneratedVisaoSummary, GitHubRepoMetadata, TemplateType } from './types.ts';

export interface RepoTechnicalInfo {
  licenseBadge?: string;
  license_badge?: string;
  costBadge?: string;
  cost_badge?: string;
  costNotes?: string;
  cost_notes?: string;
  deployBadge?: string;
  deploy_badge?: string;
  deployMethod?: string;
  deploy_method?: string;
}

export type ExpandedCategoryName =
  | 'Agentes & Automação IA'
  | 'SaaS & CRM Self-Hosted'
  | 'Infra, Gateways & Edge'
  | 'Terminal, CLI & DX'
  | 'Frontend & UI Components'
  | 'Scrapers & Engenharia de Dados'
  | 'Cibersegurança & Pentest'
  | 'Apps & Produtividade'
  | 'Backend, Bancos & Storage'
  | 'Outros';

export interface TemplateMetadata {
  id: TemplateType;
  label: string;
  badgeEmoji: string;
  defaultCategory: CategoryName;
  featureLeadIn: string;
  scenarioHeader: string;
  stepsLeadIn: string;
  killerHeader: string;
  summaryHeader: string;
  description: string;
}

export const TEMPLATE_VARIATIONS: Record<TemplateType, TemplateMetadata> = {
  'ai-agent-automation': {
    id: 'ai-agent-automation',
    label: '1. Agentes & Automações de IA',
    badgeEmoji: '🤖',
    defaultCategory: 'Agentes & Automação IA' as CategoryName,
    featureLeadIn: '🤖 O que seu agente passa a fazer por você:',
    scenarioHeader: '🧠 PENSE ASSIM (COMO VOCÊ PEDE AO AGENTE):',
    stepsLeadIn: 'E o agente executa na prática:',
    killerHeader: '🤯 O pulo do gato na automação?',
    summaryHeader: '📌 VALE A PENA PARA QUEM:',
    description: 'Focado em agentes autônomos, MCPs, assistentes e automações inteligentes.'
  },
  'self-hosted-saas': {
    id: 'self-hosted-saas',
    label: '2. Sistema Self-Hosted / SaaS Open Source',
    badgeEmoji: '🏢',
    defaultCategory: 'SaaS & CRM Self-Hosted' as CategoryName,
    featureLeadIn: '🏢 O que ele entrega pronto pra sua operação:',
    scenarioHeader: '💰 PENSE NA ECONOMIA (E NA LIBERDADE):',
    stepsLeadIn: 'E o sistema orquestra sozinho:',
    killerHeader: '🔓 O que muda o jogo (Adeus Mensalidade em Dólar)?',
    summaryHeader: '📌 QUEM DEVERIA RODAR ISSO AMANHÃ:',
    description: 'Ideal para CRMs, ERPs, painéis de atendimento e substitutos open source de SaaS pagos.'
  },
  'infra-gateway': {
    id: 'infra-gateway',
    label: '3. Infraestrutura / Gateway / DevOps',
    badgeEmoji: '🔀',
    defaultCategory: 'Infra, Gateways & Edge' as CategoryName,
    featureLeadIn: '🛡️ O que ele segura nos bastidores da sua stack:',
    scenarioHeader: '⚙️ CENÁRIO REAL DE PRODUÇÃO:',
    stepsLeadIn: 'E a infraestrutura responde no milissegundo:',
    killerHeader: '🛡️ A sacada genial de arquitetura?',
    summaryHeader: '📌 INDISPENSÁVEL PARA QUEM:',
    description: 'Para gateways de IA, proxies, Workers, Docker e redes.'
  },
  'app-tool': {
    id: 'app-tool',
    label: '4. App / Ferramenta Pronta (Desktop/Web)',
    badgeEmoji: '🖥️',
    defaultCategory: 'Apps & Produtividade' as CategoryName,
    featureLeadIn: '⚡ O que ele resolve no seu dia a dia com zero atrito:',
    scenarioHeader: '🎯 VEJA A PRATICIDADE NO USO REAL:',
    stepsLeadIn: 'E o aplicativo resolve em poucos cliques:',
    killerHeader: '💡 Por que ele supera alternativas fechadas e pesadas?',
    summaryHeader: '📌 PERFEITO PARA QUEM:',
    description: 'Para aplicativos desktop, extensões de navegador, editores e utilitários prontos.'
  },
  'dev-lib-cli': {
    id: 'dev-lib-cli',
    label: '5. Biblioteca / SDK / CLI para Devs',
    badgeEmoji: '🛠️',
    defaultCategory: 'Terminal, CLI & DX' as CategoryName,
    featureLeadIn: '🛠️ Superpoderes que ele injeta no seu código:',
    scenarioHeader: '💻 COMO FICA O CÓDIGO NO SEU PROJETO:',
    stepsLeadIn: 'E a biblioteca entrega de bandeja:',
    killerHeader: '🚀 Por que a comunidade dev está adotando em massa?',
    summaryHeader: '📌 COLOQUE NO SEU RADAR SE VOCÊ:',
    description: 'Para pacotes npm/PyPI, frameworks, CLIs de terminal e bibliotecas de código.'
  }
};

export const CATEGORIES: CategoryName[] = [
  'Agentes & Automação IA',
  'SaaS & CRM Self-Hosted',
  'Infra, Gateways & Edge',
  'Terminal, CLI & DX',
  'Frontend & UI Components',
  'Scrapers & Engenharia de Dados',
  'Cibersegurança & Pentest',
  'Apps & Produtividade',
  'Backend, Bancos & Storage',
  'Outros'
];

const STEP_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

export function formatStarsPtBr(stars: number): string {
  if (!Number.isFinite(stars) || stars < 0) return '0';
  if (stars >= 1000) {
    const k = (stars / 1000).toFixed(1).replace('.', ',').replace(',0', '');
    return `${k} mil`;
  }
  return `${Math.round(stars)}`;
}

export function formatDatePtBr(isoDate: string): string {
  if (!isoDate) return 'data recente';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate.trim())) {
    return isoDate.trim();
  }
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function detectTemplateType(meta: GitHubRepoMetadata): TemplateType {
  const desc = (meta.description || '').toLowerCase();
  const name = `${meta.fullName} ${meta.name}`.toLowerCase();
  const topics = (meta.topics || []).map((t) => t.toLowerCase()).join(' ');
  const snippet = (meta.readmeExcerpt || '').slice(0, 3000).toLowerCase();

  const coreHay = `${name} ${desc} ${topics}`;
  const fullHay = `${coreHay} ${snippet}`;

  // 1. Agentes & Automação IA / MCP / Skills / Harnesses (Prioridade Máxima)
  if (
    /(mcp|model[- ]context[- ]protocol|claude[- ]skill|ai[- ]agent|autonomous[- ]agent|browser[- ]use|agentic|superagent)/.test(coreHay) ||
    /(agent|agente|mcp|autonomous|autônomo|cursor|claude|skill|harness|workflow|automation|automação|llm-agent|browser-use|langchain|langgraph|crewai|autogen)/.test(coreHay) ||
    /(mcp[- ]server|autonomous agent|ai agent|multi-agent|claude skill|agent harness)/.test(fullHay)
  ) {
    return 'ai-agent-automation';
  }

  // 2. SaaS, CRM & Self-Hosted
  if (
    /(crm|wacrm|whatsapp|saas|self-hosted|selfhosted|erp|multiatendimento|helpdesk|chatwoot|painel de atendimento|sistema de tickets)/.test(coreHay) ||
    /(self-hosted|selfhosted|multiatendimento|whatsapp crm|painel administrativo)/.test(fullHay)
  ) {
    return 'self-hosted-saas';
  }

  // 3. Biblioteca, SDK, Framework & CLI (Dev Tools)
  if (
    /(sdk|cli|library|biblioteca|framework|package|npm|pip|cargo|plugin|hook|api[- ]client|compiler|runtime|\borm\b|linter|bundler|tui|terminal)/.test(coreHay)
  ) {
    return 'dev-lib-cli';
  }

  // 4. Infra, Gateways & Edge (Exige termos compostos específicos para evitar falsos positivos com simples menções a docker/server)
  if (
    /(api[- ]gateway|gateway|reverse[- ]proxy|load[- ]balancer|cloudflare[- ]worker|failover|traefik|caddy|nginx|service[- ]mesh|tunneling|tunnel)/.test(coreHay) ||
    /(api gateway|reverse proxy|load balancer|failover proxy|roteamento de tráfego|cloudflare worker|edge computing)/.test(fullHay)
  ) {
    return 'infra-gateway';
  }

  // 5. Fallback secundário
  if (/(sdk|cli|library|framework|package|npm|cargo|plugin)/.test(fullHay)) {
    return 'dev-lib-cli';
  }

  return 'app-tool';
}

export function detectCategory(meta: GitHubRepoMetadata, templateType?: TemplateType): CategoryName {
  const topicsLower = (meta.topics || []).map((t) => t.toLowerCase());
  const topicsText = topicsLower.join(' ');
  const desc = (meta.description || '').toLowerCase();
  const name = `${meta.fullName} ${meta.name}`.toLowerCase();
  const lang = (meta.language || '').toLowerCase();
  const readmeSnippet = (meta.readmeExcerpt || '').slice(0, 1200).toLowerCase();

  const hay = `${name} ${desc} ${topicsText} ${readmeSnippet} ${lang}`;

  const hasTopic = (...words: string[]) =>
    words.some((w) => topicsLower.includes(w.toLowerCase()));

  // 1. Cibersegurança & Pentest
  if (
    hasTopic('pentest', 'penetration-testing', 'cybersecurity', 'security', 'vulnerability', 'cve', 'exploit', 'red-team', 'blue-team', 'infosec', 'hacking', 'malware', 'scanner', 'fuzzing') ||
    /(ciberseguran|pentest|penetration test|vulnerabil|cve-|exploit|red team|blue team|infosec|security scanner|fuzzer|fuzzing|reconnaissance|privilege-escalation)/.test(hay)
  ) {
    return 'Cibersegurança & Pentest' as CategoryName;
  }

  // 2. Agentes & Automação IA
  if (
    hasTopic('agent', 'agents', 'ai-agent', 'mcp', 'mcp-server', 'model-context-protocol', 'llm-agent', 'crewai', 'autogen', 'langchain', 'langgraph', 'browser-use', 'autonomous-agent', 'agentic') ||
    /(mcp server|model context protocol|autonomous agent|ai agent|multi-agent|agente autônomo|agente de ia|agentes autônomos|browser-use|crewai|autogen|langgraph)/.test(hay)
  ) {
    return 'Agentes & Automação IA' as CategoryName;
  }

  // 3. Scrapers & Engenharia de Dados
  if (
    hasTopic('scraper', 'scraping', 'web-scraping', 'crawler', 'crawling', 'spider', 'etl', 'data-pipeline', 'data-engineering', 'data-scraping', 'playwright', 'puppeteer', 'beautifulsoup') ||
    /(web scraper|web scraping|data scraper|crawler|crawling|spider|etl pipeline|data engineering|extrator de dados|raspagem|coleta de dados|ingestão de dados)/.test(hay)
  ) {
    return 'Scrapers & Engenharia de Dados' as CategoryName;
  }

  // 4. SaaS & CRM Self-Hosted
  if (
    hasTopic('crm', 'erp', 'wacrm', 'self-hosted', 'selfhosted', 'chatwoot', 'helpdesk', 'ticketing', 'multiatendimento', 'invoice', 'billing') ||
    /(self-hosted|selfhosted|crm|erp|multiatendimento|atendimento whatsapp|helpdesk|sistema de tickets|faturamento|financeiro|painel de atendimento|hospedagem própria)/.test(hay)
  ) {
    return 'SaaS & CRM Self-Hosted' as CategoryName;
  }

  // 5. Infra, Gateways & Edge
  if (
    hasTopic('gateway', 'api-gateway', 'proxy', 'reverse-proxy', 'cloudflare-workers', 'cloudflare', 'edge', 'load-balancer', 'failover', 'docker', 'kubernetes', 'k8s', 'traefik', 'caddy', 'nginx', 'devops', 'vpn', 'tunnel') ||
    /(api gateway|reverse proxy|load balancer|failover|roteamento de tráfego|cloudflare worker|edge computing|infraestrutura|servidor proxy|tunneling|traefik|envoy)/.test(hay)
  ) {
    return 'Infra, Gateways & Edge' as CategoryName;
  }

  // 6. Frontend & UI Components
  if (
    hasTopic('ui', 'frontend', 'components', 'react', 'vue', 'svelte', 'tailwind', 'css', 'design-system', 'shadcn', 'radix', 'lucide', 'icons', 'web-components') ||
    /(ui library|component library|design system|componentes react|biblioteca de componentes|tailwind components|shadcn|radix ui|frontend framework|ícones)/.test(hay)
  ) {
    return 'Frontend & UI Components' as CategoryName;
  }

  // 7. Backend, Bancos & Storage
  if (
    hasTopic('database', 'sql', 'nosql', 'postgres', 'postgresql', 'sqlite', 'mysql', 'redis', 'mongodb', 'orm', 'prisma', 'drizzle', 'storage', 's3', 'minio', 'vector-database', 'vector-db', 'weaviate', 'qdrant', 'chroma') ||
    /(database|banco de dados|vetorial|vector db|postgres|sqlite|mysql|redis|orm|prisma|drizzle|object storage|s3-compatible|minio|backend framework)/.test(hay)
  ) {
    return 'Backend, Bancos & Storage' as CategoryName;
  }

  // 8. Terminal, CLI & DX
  if (
    hasTopic('cli', 'tui', 'terminal', 'command-line', 'console', 'developer-experience', 'dx', 'sdk', 'library', 'compiler', 'linter', 'formatter', 'bundler', 'package', 'npm-package') ||
    /(command-line|terminal tool|tui|developer experience|dx tool|utilitário de terminal|linha de comando|sdk|biblioteca|compilador|linter|bundler)/.test(hay)
  ) {
    return 'Terminal, CLI & DX' as CategoryName;
  }

  // 9. Apps & Produtividade
  if (
    hasTopic('app', 'desktop-app', 'productivity', 'electron', 'tauri', 'notes', 'markdown', 'obsidian', 'notion', 'task-manager', 'todo') ||
    /(desktop app|aplicativo desktop|produtividade|productivity tool|bloco de notas|markdown editor|gerenciador de tarefas|ferramenta local|aplicativo)/.test(hay)
  ) {
    return 'Apps & Produtividade' as CategoryName;
  }

  // Se não caiu nas regras específicas acima, usa o templateType como fallback
  if (templateType && TEMPLATE_VARIATIONS[templateType]?.defaultCategory) {
    return TEMPLATE_VARIATIONS[templateType].defaultCategory;
  }

  const detectedTpl = detectTemplateType(meta);
  if (TEMPLATE_VARIATIONS[detectedTpl]?.defaultCategory) {
    return TEMPLATE_VARIATIONS[detectedTpl].defaultCategory;
  }

  return 'Outros' as CategoryName;
}

export function buildWhatsAppText(
  meta: GitHubRepoMetadata & RepoTechnicalInfo,
  summary: Omit<GeneratedVisaoSummary, 'whatsappText'> & RepoTechnicalInfo
): string {
  const tpl = TEMPLATE_VARIATIONS[summary.templateType] || TEMPLATE_VARIATIONS['app-tool'];
  const starsText = formatStarsPtBr(meta.stars);
  const commitDate = formatDatePtBr(meta.lastCommitAt);

  const license =
    meta.licenseBadge ||
    meta.license_badge ||
    summary.licenseBadge ||
    summary.license_badge ||
    'Verificar';

  const costBadge =
    meta.costBadge ||
    meta.cost_badge ||
    summary.costBadge ||
    summary.cost_badge ||
    '100% Grátis';

  const costNotes =
    meta.costNotes ||
    meta.cost_notes ||
    summary.costNotes ||
    summary.cost_notes ||
    '';

  const costLine = costNotes
    ? `💰 Custo Real: ${costBadge} (${costNotes})`
    : `💰 Custo Real: ${costBadge}`;

  const deployBadge =
    meta.deployBadge ||
    meta.deploy_badge ||
    summary.deployBadge ||
    summary.deploy_badge ||
    'Fácil';

  const deployMethod =
    meta.deployMethod ||
    meta.deploy_method ||
    summary.deployMethod ||
    summary.deploy_method ||
    '';

  const deployLine = deployMethod
    ? `⚙️ Instalação: ${deployBadge} (${deployMethod})`
    : `⚙️ Instalação: ${deployBadge}`;

  const lines: string[] = [];
  lines.push(summary.hookTitle.trim());
  lines.push('');
  lines.push(summary.introText.trim());
  lines.push('');
  lines.push(`🔗 ${meta.repoUrl}`);
  lines.push(`⭐ ${starsText} estrelas no GitHub`);
  lines.push(`🕒 Último commit em ${commitDate}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('📋 FICHA TÉCNICA');
  lines.push(`⚖️ Licença: ${license}`);
  lines.push(costLine);
  lines.push(deployLine);
  lines.push(`🏷️ Categoria: ${summary.category}`);
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (summary.warningNote && summary.warningNote.trim()) {
    lines.push(summary.warningNote.trim());
    lines.push('');
  }

  lines.push(tpl.featureLeadIn);
  lines.push('');
  for (const feat of summary.features) {
    if (feat && feat.trim()) {
      lines.push(feat.trim());
    }
  }
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');

  const scenarioTitle = (summary.scenarioTitle && summary.scenarioTitle.trim()) || tpl.scenarioHeader;
  lines.push(scenarioTitle);
  lines.push('');

  const scenarioIntro = (summary.scenarioIntro || '').trim();
  const cleanPrompt = (summary.scenarioPrompt || '').trim().replace(/^["“”]+|["“”]+$/g, '');

  if (scenarioIntro) {
    lines.push(scenarioIntro);
    lines.push('');
  }

  if (cleanPrompt && !scenarioIntro.includes(cleanPrompt)) {
    lines.push(`"${cleanPrompt}"`);
    lines.push('');
  }

  lines.push(tpl.stepsLeadIn);
  lines.push('');

  if (Array.isArray(summary.scenarioSteps) && summary.scenarioSteps.length > 0) {
    summary.scenarioSteps.forEach((step, idx) => {
      const cleanStep = step.replace(/^(?:[0-9]️⃣|[0-9]+[.)\-:])\s*/, '').trim();
      if (cleanStep) {
        const emoji = STEP_EMOJIS[idx] || `${idx + 1}️⃣`;
        lines.push(`${emoji} ${cleanStep}`);
      }
    });
  }

  if (summary.scenarioOutro && summary.scenarioOutro.trim()) {
    lines.push('');
    lines.push(summary.scenarioOutro.trim());
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');

  const killerTitle = (summary.killerTitle && summary.killerTitle.trim()) || tpl.killerHeader;
  lines.push(killerTitle);
  lines.push('');
  lines.push(summary.killerText.trim());
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(tpl.summaryHeader);
  lines.push('');
  lines.push(summary.summaryText.trim());
  lines.push('');
  lines.push(summary.punchline.trim());

  return lines.join('\n');
}

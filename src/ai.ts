import type {
  CategoryName,
  Env,
  GeneratedVisaoSummary,
  GitHubRepoMetadata,
  TemplateType
} from './types.ts';
import { isHarmfulRepository } from './github.ts';
import {
  CATEGORIES,
  TEMPLATE_VARIATIONS,
  buildWhatsAppText,
  detectCategory,
  detectTemplateType,
  type RepoTechnicalInfo
} from './templates.ts';

function detectLicenseBadge(meta: GitHubRepoMetadata): string {
  const hay = `${(meta as any).licenseBadge || ''} ${meta.readmeExcerpt || ''} ${meta.description || ''}`.toLowerCase();
  if (hay.includes('apache')) return 'Apache 2.0 (Livre)';
  if (hay.includes('mit')) return 'MIT (Livre / Comercial)';
  if (hay.includes('agpl') || hay.includes('gpl-3') || hay.includes('gpl v3') || hay.includes('gplv3')) return 'AGPL/GPL v3 (Copyleft)';
  if (hay.includes('gpl')) return 'GPL (Copyleft)';
  if (hay.includes('bsd')) return 'BSD (Livre)';
  if (hay.includes('mpl')) return 'MPL 2.0';
  if (hay.includes('commercial') || hay.includes('proprietary')) return 'Comercial / Source-Available';
  return 'Open Source';
}

function detectCostInfo(
  meta: GitHubRepoMetadata,
  templateType: TemplateType
): { costBadge: string; costNotes: string } {
  const hay = `${meta.readmeExcerpt || ''} ${meta.description || ''}`.toLowerCase();
  if (hay.includes('freemium') || hay.includes('cloud pricing') || hay.includes('subscription')) {
    return { costBadge: 'Freemium', costNotes: 'Self-hosted grátis / Nuvem paga' };
  }
  switch (templateType) {
    case 'self-hosted-saas':
      return { costBadge: '100% Grátis', costNotes: 'Self-hosted livre, adeus mensalidade' };
    case 'ai-agent-automation':
      return { costBadge: '100% Grátis', costNotes: 'Open source (chaves LLM próprias)' };
    case 'infra-gateway':
      return { costBadge: '100% Grátis', costNotes: 'Hospede na sua infra ou Cloudflare' };
    case 'dev-lib-cli':
      return { costBadge: '100% Grátis', costNotes: 'Biblioteca open source' };
    case 'app-tool':
    default:
      return { costBadge: '100% Grátis', costNotes: 'Uso local e ilimitado' };
  }
}

function detectDeployInfo(meta: GitHubRepoMetadata): { deployBadge: string; deployMethod: string } {
  const hay = `${meta.readmeExcerpt || ''} ${meta.description || ''} ${meta.topics.join(' ')}`.toLowerCase();
  if (hay.includes('docker compose') || hay.includes('docker-compose')) {
    return { deployBadge: 'Fácil', deployMethod: 'Docker Compose' };
  }
  if (hay.includes('docker run') || hay.includes('docker')) {
    return { deployBadge: 'Fácil', deployMethod: 'Docker' };
  }
  if (hay.includes('npx ') || hay.includes('npm install -g') || hay.includes('bunx ')) {
    return { deployBadge: '1 Comando', deployMethod: 'npx / npm' };
  }
  if (hay.includes('pip install') || hay.includes('uv pip') || hay.includes('poetry ')) {
    return { deployBadge: 'Fácil', deployMethod: 'pip / uv' };
  }
  if (hay.includes('cargo install') || hay.includes('cargo run') || hay.includes('binário') || hay.includes('binary')) {
    return { deployBadge: 'Binário Único', deployMethod: 'Cargo / Binário' };
  }
  if (hay.includes('cloudflare') || hay.includes('wrangler deploy')) {
    return { deployBadge: 'Serverless', deployMethod: 'Cloudflare Workers' };
  }
  return { deployBadge: 'Fácil', deployMethod: 'Git Clone / CLI' };
}

function extractReadmeHighlights(readme: string, meta?: GitHubRepoMetadata): string[] {
  const highlights: string[] = [];
  if (readme) {
    const lines = readme.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('- ') && !line.startsWith('* ')) continue;
      const cleaned = line
        .replace(/^[-*]\s+/, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (
        cleaned.length >= 18 &&
        cleaned.length <= 130 &&
        !/^(license|contributing|installation|table of contents|contents|changelog|roadmap|prerequisites|requirements)/i.test(
          cleaned
        )
      ) {
        highlights.push(cleaned);
      }
      if (highlights.length >= 6) break;
    }
  }

  // Minerar fatos técnicos específicos do texto caso faltem bullets
  if (highlights.length < 4 && readme) {
    const hay = readme.toLowerCase();
    if (hay.includes('docker compose') || hay.includes('docker-compose')) {
      highlights.push('Deploy descomplicado com suporte nativo a Docker e Docker Compose');
    }
    if (hay.includes('mcp') || hay.includes('model context protocol')) {
      highlights.push('Compatível com Model Context Protocol (MCP) para conectar em agentes e IDEs');
    }
    if (hay.includes('prometheus') || hay.includes('grafana') || hay.includes('metrics')) {
      highlights.push('Métricas e observabilidade prontas para exportar para Prometheus/Grafana');
    }
    if (hay.includes('sqlite') || hay.includes('postgres') || hay.includes('postgresql')) {
      highlights.push('Persistência flexível com suporte a banco de dados próprio (SQLite/PostgreSQL)');
    }
    if (hay.includes('webhook') || hay.includes('webhooks')) {
      highlights.push('Gatilhos em tempo real via Webhooks para integração com outros sistemas');
    }
    if (hay.includes('cloudflare') || hay.includes('worker') || hay.includes('edge')) {
      highlights.push('Execução rápida e escalável na borda com arquitetura Serverless');
    }
  }

  return highlights;
}

function selectFallbackHook(templateType: TemplateType, meta: GitHubRepoMetadata): string {
  const desc = (meta.description || '').toLowerCase();
  const name = `${meta.fullName} ${meta.name}`.toLowerCase();
  const topics = (meta.topics || []).map((t) => t.toLowerCase()).join(' ');
  const coreHay = `${name} ${desc} ${topics}`;
  const upName = meta.name.toUpperCase();
  const seed = (meta.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + (meta.stars || 0)) % 3;

  switch (templateType) {
    case 'ai-agent-automation': {
      if (coreHay.includes('mcp') || coreHay.includes('cursor') || coreHay.includes('claude')) {
        const hooks = [
          `🔥 CONECTE FERRAMENTAS REAIS AO SEU WORKFLOW COM O MCP ${upName}!`,
          `⚡ SUPERPODERES PARA O CLAUDE E CURSOR: CONHEÇA O ${upName}!`,
          `🧠 EXPANDA A CAPACIDADE DO SEU AGENTE COM O MCP ${upName}!`
        ];
        return hooks[seed];
      }
      if (coreHay.includes('browser') || coreHay.includes('navegador') || coreHay.includes('web')) {
        return `🌐 DÊ UM NAVEGADOR E VISÃO PRÓPRIA PARA SEU AGENTE COM O ${upName}!`;
      }
      if (coreHay.includes('memory') || coreHay.includes('context') || coreHay.includes('memoria')) {
        return `🧠 CONTEXTO E MEMÓRIA DE LONGO PRAZO PARA AGENTES COM O ${upName}!`;
      }
      const generalHooks = [
        `🤖 DÊ AUTONOMIA E AÇÃO PRÁTICA PARA SEUS AGENTES COM ${upName}!`,
        `⚡ ACELERE O DESENVOLVIMENTO DE AGENTES DE IA COM O ${upName}!`,
        `🎯 ORQUESTRAÇÃO INTELIGENTE E SEM CAIXA-PRETA COM ${upName}!`
      ];
      return generalHooks[seed];
    }

    case 'self-hosted-saas': {
      if (coreHay.includes('whatsapp') || coreHay.includes('crm') || coreHay.includes('atendimento')) {
        const crmHooks = [
          `💬 SEU PRÓPRIO SISTEMA DE ATENDIMENTO NO WHATSAPP COM ${upName}!`,
          `💸 MULTIATENDIMENTO EM EQUIPE COM ZERO TAXA POR ASSENTO: ${upName}!`,
          `🔓 LIBERDADE DE ATENDIMENTO: CONHEÇA O CRM OPEN SOURCE ${upName}!`
        ];
        return crmHooks[seed];
      }
      const saasHooks = [
        `🏢 SOBERANIA DOS DADOS: RODE O ${upName} NA SUA PRÓPRIA VPS!`,
        `🔓 ALTERNATIVA OPEN SOURCE A PLATAFORMAS PAGAS: ${upName}!`,
        `🚀 ADEUS MENSALIDADES EM DÓLAR: ASSUMA O CONTROLE COM ${upName}!`
      ];
      return saasHooks[seed];
    }

    case 'infra-gateway': {
      if (coreHay.includes('gateway') || coreHay.includes('proxy') || coreHay.includes('router')) {
        const gwHooks = [
          `⚡ ROTEAMENTO INTELIGENTE E ALTA PERFORMANCE: ${upName}!`,
          `🛡️ O GATEWAY RESILIENTE PARA SEUS MICROSSERVIÇOS: ${upName}!`,
          `🚦 CONTROLE DE TRÁFEGO E FAILOVER AUTOMÁTICO COM ${upName}!`
        ];
        return gwHooks[seed];
      }
      if (coreHay.includes('secret') || coreHay.includes('auth') || coreHay.includes('token') || coreHay.includes('senha')) {
        return `🔒 PROTEÇÃO E GESTÃO SEGURA DE CREDENCIAIS COM ${upName}!`;
      }
      const infraHooks = [
        `🌐 ALTA DISPONIBILIDADE E MENOS DOWNTIME COM O ${upName}!`,
        `⚡ ESCALABILIDADE E BAIXA LATÊNCIA NA INFRAESTRUTURA: ${upName}!`,
        `🛡️ BLINDE A ARQUITETURA DA SUA APLICAÇÃO COM O ${upName}!`
      ];
      return infraHooks[seed];
    }

    case 'app-tool': {
      if (coreHay.includes('terminal') || coreHay.includes('cli') || coreHay.includes('tui')) {
        return `🎯 RESOLVA ESSA TAREFA DIRETO NO TERMINAL COM O ${upName}!`;
      }
      if (coreHay.includes('note') || coreHay.includes('markdown') || coreHay.includes('doc')) {
        return `📝 SEUS DADOS EM TEXTO PURO E 100% SOB SEU CONTROLE: ${upName}!`;
      }
      const appHooks = [
        `🖥️ APLICATIVO LOCAL, RÁPIDO E SEM TELEMETRIA INVASIVA: ${upName}!`,
        `⚡ PRODUTIVIDADE MÁXIMA E ZERO FRICÇÃO COM O ${upName}!`,
        `🎯 A FERRAMENTA DIRETA AO PONTO QUE FALTAVA NA SUA ROTINA: ${upName}!`
      ];
      return appHooks[seed];
    }

    case 'dev-lib-cli':
    default: {
      if (coreHay.includes('cli') || coreHay.includes('terminal')) {
        const cliHooks = [
          `💻 O UTILITÁRIO DE TERMINAL QUE ACELERA SEU WORKFLOW: ${upName}!`,
          `⚡ MENOS CLIQUES, MAIS VELOCIDADE NA LINHA DE COMANDO: ${upName}!`,
          `🛠️ A CLI ENXUTA QUE RESOLVE O PROBLEMA EM 1 COMANDO: ${upName}!`
        ];
        return cliHooks[seed];
      }
      const libHooks = [
        `🚀 A BIBLIOTECA QUE VAI TURBINAR SUA STACK: ${upName}!`,
        `🛠️ CANSADO DE ESCREVER BOILERPLATE? O ${upName} RESOLVE EM 1 LINHA!`,
        `⚡ MÁXIMA PERFORMANCE E CÓDIGO LIMPO COM O ${upName}!`
      ];
      return libHooks[seed];
    }
  }
}

function selectFallbackIntro(templateType: TemplateType, meta: GitHubRepoMetadata, shortDesc: string): string {
  const lang = meta.language ? `desenvolvido em ${meta.language}` : 'open source';
  const seed = (meta.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 4;

  switch (templateType) {
    case 'ai-agent-automation': {
      const options = [
        `Para quem constrói e opera agentes de IA, o ${meta.name} surge como uma peça fundamental: ${shortDesc}`,
        `O ${meta.name} expande a autonomia e a capacidade de execução prática dos seus agentes: ${shortDesc}`,
        `Se o seu objetivo é automatizar tarefas e conectar ferramentas ao seu ecossistema de IA, o ${meta.name} resolve: ${shortDesc}`,
        `Construído para dar superpoderes e contexto a fluxos inteligentes, o ${meta.name} entrega ${shortDesc}`
      ];
      return options[seed];
    }
    case 'self-hosted-saas': {
      const options = [
        `Uma alternativa open source direta para retomar a soberania dos seus dados, o ${meta.name} entrega ${shortDesc}`,
        `Projetado para rodar na sua própria infraestrutura sem depender de mensalidades por usuário, o ${meta.name} é ${shortDesc}`,
        `Com o ${meta.name}, você assume o controle total da sua operação sem bloqueios proprietários: ${shortDesc}`,
        `Excelente solução self-hosted para equipes que prezam por privacidade e custo previsível: o ${meta.name} oferece ${shortDesc}`
      ];
      return options[seed];
    }
    case 'infra-gateway': {
      const options = [
        `Projetado para garantir estabilidade, segurança e alto throughput, o ${meta.name} (${lang}) entrega ${shortDesc}`,
        `O ${meta.name} atua como uma camada robusta de proteção e controle de tráfego: ${shortDesc}`,
        `Para quem precisa de resiliência e previsibilidade na arquitetura de microsserviços, o ${meta.name} oferece ${shortDesc}`,
        `Desenvolvido para manter seus serviços operando com segurança e baixa latência, o ${meta.name} entrega ${shortDesc}`
      ];
      return options[seed];
    }
    case 'app-tool': {
      const options = [
        `O ${meta.name} é um utilitário direto ao ponto que resolve uma dor comum sem fricção: ${shortDesc}`,
        `Leve, rápido e sem dependências ocultas, o ${meta.name} entrega exatamente o prometido: ${shortDesc}`,
        `Uma daquelas ferramentas locais que simplificam o fluxo de trabalho no dia a dia: o ${meta.name} oferece ${shortDesc}`,
        `Para quem valoriza privacidade e produtividade no próprio computador, o ${meta.name} resolve: ${shortDesc}`
      ];
      return options[seed];
    }
    case 'dev-lib-cli':
    default: {
      const options = [
        `Pensado para simplificar a vida de quem desenvolve em ${meta.language || 'código aberto'}, o ${meta.name} resolve: ${shortDesc}`,
        `O ${meta.name} elimina boilerplate e entrega uma API limpa e moderna (${lang}): ${shortDesc}`,
        `Uma adição certeira para o seu ambiente de desenvolvimento, o ${meta.name} entrega ${shortDesc}`,
        `Com foco em performance e ergonomia para devs, o ${meta.name} oferece ${shortDesc}`
      ];
      return options[seed];
    }
  }
}

export function generateFallbackSummary(
  meta: GitHubRepoMetadata,
  preferredTemplate?: TemplateType
): GeneratedVisaoSummary {
  const deterministicCheck = isHarmfulRepository(meta);
  if (deterministicCheck.isHarmful) {
    throw new Error(`Repositório recusado por violação das diretrizes de segurança (Moderação Git-Visão): ${deterministicCheck.harmReason}`);
  }


  const templateType: TemplateType =
    preferredTemplate && TEMPLATE_VARIATIONS[preferredTemplate]
      ? preferredTemplate
      : detectTemplateType(meta);

  const category: CategoryName = detectCategory(meta, templateType);
  const tpl = TEMPLATE_VARIATIONS[templateType];
  const shortDesc =
    meta.description ||
    `Projeto open source ${meta.fullName} desenvolvido em ${meta.language || 'código aberto'}.`;

  const extractedBullets = extractReadmeHighlights(meta.readmeExcerpt, meta);
  const topicList = meta.topics.length > 0 ? meta.topics.slice(0, 5).join(', ') : meta.language;

  const licenseBadge =
    meta.licenseBadge || (meta as any).license_badge || detectLicenseBadge(meta);
  const { costBadge: defaultCostBadge, costNotes: defaultCostNotes } = detectCostInfo(meta, templateType);
  const costBadge = meta.costBadge || (meta as any).cost_badge || defaultCostBadge;
  const costNotes = meta.costNotes || (meta as any).cost_notes || defaultCostNotes;

  const { deployBadge: defaultDeployBadge, deployMethod: defaultDeployMethod } = detectDeployInfo(meta);
  const deployBadge = meta.deployBadge || (meta as any).deploy_badge || defaultDeployBadge;
  const deployMethod = meta.deployMethod || (meta as any).deploy_method || defaultDeployMethod;

  const warningNote =
    /(wip|work in progress|alpha|beta|experimental|em desenvolvimento|não use em produção|not ready for production)/i.test(
      meta.readmeExcerpt
    )
      ? '⚠️ Projeto em fase experimental/beta. Teste em ambiente seguro antes de adotar em produção.'
      : /(proof of concept|poc|prototype)/i.test(meta.readmeExcerpt)
        ? '⚠️ Prova de conceito (PoC). Verifique o estágio das funcionalidades antes de rodar em missão crítica.'
        : '';

  const defaultFeaturesByTemplate: Record<TemplateType, string[]> = {
    'ai-agent-automation': [
      `🤖 Autonomia com supervisão: executa tarefas complexas usando ${meta.name}`,
      `🔌 Integração flexível com servidores MCP, APIs e ecossistema de IA (${topicList})`,
      `⚡ Reduz passos manuais repetitivos com automação orientada a contexto`,
      `🔒 Código aberto em ${meta.language} para auditar e rodar no seu próprio ambiente`,
      `📊 Rastreabilidade total com logs detalhados de cada etapa executada`
    ],
    'self-hosted-saas': [
      `🏢 Hospedagem própria (Self-Hosted) com controle total dos dados e banco de dados`,
      `👥 Multiatendimento em equipe sem cobrança abusiva por assento ou atendente`,
      `⚙️ Recursos práticos prontos em ${meta.language} (${topicList})`,
      `🔌 Conexão direta com canais de mensagem, webhooks e automações de IA`,
      `🔓 Zero aprisionamento: seus leads, conversas e regras são 100% seus`
    ],
    'infra-gateway': [
      `🔄 Arquitetura resiliente focada em performance, roteamento inteligente e failover`,
      `🔑 Controle centralizado de conexões, políticas de segurança e credenciais`,
      `⚡ Baixa latência e execução enxuta construída em ${meta.language}`,
      `🔎 Observabilidade em tempo real com suporte a métricas e diagnósticos`,
      `🛡️ Mais segurança e previsibilidade para manter seus serviços no ar sem sustos`
    ],
    'app-tool': [
      `⚡ Interface e experiência diretas para resolver a tarefa sem fricção`,
      `📦 Projeto open source escrito em ${meta.language} (${topicList})`,
      `🔒 Execução local mantendo seus arquivos e dados sob seu estrito controle`,
      `🔌 Fácil de encaixar na rotina diária de produtividade e foco`,
      `🚀 Validado pela comunidade com ${meta.stars} estrelas no GitHub`
    ],
    'dev-lib-cli': [
      `💻 API limpa e ergonômica pensada para desenvolvedores ${meta.language}`,
      `⚡ Leve, rápida e fácil de adicionar ao projeto com zero dependências inúteis`,
      `🧩 Compatível com fluxos modernos de desenvolvimento (${topicList})`,
      `📖 Código-fonte auditável com exemplos práticos no README`,
      `🛠️ Economiza horas de código boilerplate repetitivo em cada projeto`
    ]
  };

  const featureEmojis = ['📥', '🔌', '⚙️', '⚡', '🔒', '📊', '🛡️'];
  const features =
    extractedBullets.length >= 3
      ? extractedBullets.slice(0, 6).map((item, idx) => {
          const emoji = featureEmojis[idx % featureEmojis.length];
          return /^[\p{Emoji}]/u.test(item) ? item : `${emoji} ${item}`;
        })
      : defaultFeaturesByTemplate[templateType];

  const scenarioIntroByTemplate: Record<TemplateType, string> = {
    'ai-agent-automation':
      'Você não precisa mais executar etapas repetitivas na mão ou colar contexto entre janelas.\n\nNa prática, você instrui seu agente assim:',
    'self-hosted-saas':
      'Chega de pagar dezenas de dólares por cada novo atendente ou ficar refém de planos caros.\n\nVocê configura a regra direto no sistema:',
    'infra-gateway':
      'Esqueça o medo de derrubar a produção ou perder requisições em horários de pico.\n\nBasta apontar suas chamadas para o gateway:',
    'app-tool':
      'Nada de abrir navegadores pesados ou ferramentas cheias de telas confusas.\n\nNo seu dia a dia você simplesmente dispara:',
    'dev-lib-cli':
      'Pare de reinventar a roda ou copiar utilitários frágeis entre projetos.\n\nNo seu código você resolve com uma instrução direta:'
  };

  const scenarioPromptByTemplate: Record<TemplateType, string> = {
    'ai-agent-automation':
      'Inspecione os últimos commits do repositório, identifique funções sem cobertura de testes e gere os casos de teste compatíveis com a suite atual.',
    'self-hosted-saas':
      'Quando o cliente falar "preço" ou "orçamento" no WhatsApp, tagueie como Lead Quente, cadastre no CRM e transfira para o atendente de plantão.',
    'infra-gateway':
      'Adicione monitor para api.meusite.com a cada 20s; se a latência passar de 500ms ou der erro 5xx, ative o failover para o backup e avise no Telegram.',
    'app-tool':
      'Importe os arquivos da pasta local, organize por tags hierárquicas e gere a visualização sem enviar nenhum byte para a nuvem.',
    'dev-lib-cli':
      `npm install ${meta.name.toLowerCase()} && declare o pipeline com tipagem estrita para processar os dados em 3 linhas.`
  };

  const scenarioStepsByTemplate: Record<TemplateType, string[]> = {
    'ai-agent-automation': [
      `Interpretar a instrução e inspecionar o contexto do repositório/ambiente`,
      `Conectar às ferramentas e servidores MCP configurados`,
      `Executar as ações automatizadas etapa por etapa com validação de segurança`,
      `Entregar o relatório final com log detalhado e alterações prontas para revisão`
    ],
    'self-hosted-saas': [
      `Receber a mensagem em tempo real pelo conector oficial (WhatsApp, Telegram ou Webhook)`,
      `Registrar o contato e histórico no seu próprio banco de dados sem intermediários`,
      `Disparar a automação de tags, pipeline e regras de negócio configuradas`,
      `Distribuir o atendimento para a equipe conectada em um painel único sem custo por assento`
    ],
    'infra-gateway': [
      `Receber a requisição na borda antes de sobrecarregar sua aplicação principal`,
      `Aplicar regras de rate limiting, validação de chaves e sanitização de tráfego`,
      `Garantir entrega com baixa latência e failover automático caso a ponta falhe`,
      `Emitir métricas em tempo real para seu painel de observabilidade ou Prometheus`
    ],
    'app-tool': [
      `Iniciar instantaneamente na máquina local sem serviços ocultos consumindo memória`,
      `Ler os arquivos mantendo 100% da privacidade e sem telemetria invasiva`,
      `Executar a tarefa com interface direta, atalhos de teclado e pré-visualização`,
      `Exportar o resultado no formato desejado direto no seu disco ou repositório Git`
    ],
    'dev-lib-cli': [
      `Adicionar o pacote ao projeto em poucos segundos com o gerenciador da sua stack`,
      `Declarar a chamada com tipagem estrita e autocomplete perfeito no editor`,
      `Executar a lógica com alta performance e footprint mínimo de recursos`,
      `Substituir dezenas de linhas de boilerplate por uma solução limpa e manutenível`
    ]
  };

  const killerTextByTemplate: Record<TemplateType, string> = {
    'ai-agent-automation': `O ${meta.name} é 100% open source (${meta.fullName}) e resolve o maior dilema de quem cria agentes: dar autonomia real e controlada sem transformar o fluxo em uma caixa-preta. Você audita o código, mantém suas chaves de API sob sua guarda e integra diretamente aos modelos e ferramentas que preferir.`,
    'self-hosted-saas': `O grande diferencial do ${meta.name} é a soberania total sobre seus dados. Diferente de plataformas proprietárias que cobram centenas de dólares por assento e bloqueiam dados em caso de cancelamento, aqui o banco de dados é seu, a infraestrutura é sua e sua equipe opera com liberdade absoluta.`,
    'infra-gateway': `O pulo do gato do ${meta.name} está na arquitetura resiliente desenvolvida em ${meta.language}. Ele funciona como um escudo inteligente na frente dos seus serviços: se uma API externa oscilar ou cair de madrugada, ele comuta o tráfego e absorve picos sem derrubar sua operação.`,
    'app-tool': `Enquanto a maioria dos utilitários modernos virou aplicativo inchado com navegadores embutidos e telemetria invasiva, o ${meta.name} entrega exatamente o que promete: velocidade instantânea, respeito à privacidade local e praticidade sem atritos.`,
    'dev-lib-cli': `Construído em ${meta.language} e validado pela comunidade com ${meta.stars} estrelas no GitHub, o ${meta.name} elimina o código repetitivo que todo dev odeia escrever. Ele entrega uma API moderna, tipada e extremamente leve para você focar nas regras de negócio.`
  };

  const summaryTextByTemplate: Record<TemplateType, string> = {
    'ai-agent-automation': `Vale muito a pena explorar o ${meta.fullName} se você quer levar seus agentes além do básico e dar ferramentas reais para automação em ${meta.language}.`,
    'self-hosted-saas': `Excelente alternativa open source para quem busca independência de plataformas fechadas e quer operar um sistema robusto na própria infraestrutura.`,
    'infra-gateway': `Indispensável para quem precisa de estabilidade, observabilidade e controle de tráfego profissional sem depender de soluções de terceiros caras.`,
    'app-tool': `Recomendado para quem valoriza ferramentas rápidas, locais e sem enrolação para otimizar o dia a dia de trabalho.`,
    'dev-lib-cli': `Adição certeira para sua stack se você busca código mais limpo, menos boilerplate e máxima performance em ${meta.language}.`
  };

  const punchlineByTemplate: Record<TemplateType, string> = {
    'ai-agent-automation': `🚀 Autonomia, controle e inteligência real com ${meta.name}.`,
    'self-hosted-saas': `🚀 Seus dados, sua operação e adeus mensalidades com ${meta.name}.`,
    'infra-gateway': `🚀 Resiliência de alto nível e paz de espírito na infra com ${meta.name}.`,
    'app-tool': `🚀 Produtividade máxima e respeito aos seus dados com ${meta.name}.`,
    'dev-lib-cli': `🚀 Menos código boilerplate e muito mais velocidade com ${meta.name}.`
  };

  const partialSummary: Omit<GeneratedVisaoSummary, 'whatsappText'> = {
    category,
    templateType,
    licenseBadge,
    license_badge: licenseBadge,
    costBadge,
    cost_badge: costBadge,
    costNotes,
    cost_notes: costNotes,
    deployBadge,
    deploy_badge: deployBadge,
    deployMethod,
    deploy_method: deployMethod,
    hookTitle: selectFallbackHook(templateType, meta),
    introText: selectFallbackIntro(templateType, meta, shortDesc),
    warningNote,
    features,
    scenarioTitle: tpl.scenarioHeader,
    scenarioIntro: scenarioIntroByTemplate[templateType],
    scenarioPrompt: scenarioPromptByTemplate[templateType],
    scenarioSteps: scenarioStepsByTemplate[templateType],
    scenarioOutro: '',
    killerTitle: tpl.killerHeader,
    killerText: killerTextByTemplate[templateType],
    summaryText: summaryTextByTemplate[templateType],
    punchline: punchlineByTemplate[templateType]
  };

  return {
    ...partialSummary,
    whatsappText: buildWhatsAppText(meta, partialSummary)
  };
}

function resolveOmniRouteEndpoint(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1') || trimmed.endsWith('/openai')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  if (!rawText) return null;
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateRepoVisaoSummary(
  meta: GitHubRepoMetadata,
  env: Env,
  preferredTemplate?: TemplateType
): Promise<GeneratedVisaoSummary> {
  const deterministicCheck = isHarmfulRepository(meta);
  if (deterministicCheck.isHarmful) {
    throw new Error(`Repositório recusado por violação das diretrizes de segurança (Moderação Git-Visão): ${deterministicCheck.harmReason}`);
  }


  const baseUrl = env.OMNIROUTE_BASE_URL?.trim();
  const apiKey = env.OMNIROUTE_API_KEY?.trim();
  const model = env.OMNIROUTE_MODEL?.trim() || 'gemini-2.5-flash';

  if (!baseUrl || !apiKey) {
    return generateFallbackSummary(meta, preferredTemplate);
  }

  const endpoint = resolveOmniRouteEndpoint(baseUrl);
  const autoDetectedTemplate =
    preferredTemplate && TEMPLATE_VARIATIONS[preferredTemplate]
      ? preferredTemplate
      : detectTemplateType(meta);

  const systemPrompt = `Você é o curador especialista do canal e grupo "Pega a Visão", famoso por transformar repositórios do GitHub em resumos virais, diretos, didáticos, divertidos e de altíssima utilidade prática em Português do Brasil para WhatsApp.

Sua missão: analisar minuciosamente os metadados e o README do repositório GitHub fornecido e devolver ESTRITAMENTE um objeto JSON válido (sem blocos markdown \`\`\`json em volta) com a estrutura solicitada.

Existem 5 variações de template ("templateType"):
1. "ai-agent-automation" -> Para agentes de IA, MCPs, automações inteligentes, navegadores para agentes, frameworks multiagente.
2. "self-hosted-saas" -> Para CRMs, ERPs, sistemas multiatendimento WhatsApp, plataformas open source que substituem SaaS pagos.
3. "infra-gateway" -> Para gateways de IA, proxies, Cloudflare Workers, roteadores de tráfego, Docker, DevOps, segurança de chaves.
4. "app-tool" -> Para aplicativos desktop/web, clientes visuais, ferramentas locais de produtividade, utilitários prontos.
5. "dev-lib-cli" -> Para bibliotecas, frameworks, SDKs, pacotes de código e CLIs para desenvolvedores.

Existem 9 macro-categorias válidas ("category"):
1. "Agentes & Automação IA" -> Agentes autônomos, servidores MCP, frameworks multiagente, navegadores com IA, automações orientadas a contexto.
2. "SaaS & CRM Self-Hosted" -> CRMs, ERPs, sistemas de multiatendimento WhatsApp, plataformas open source que substituem ferramentas com mensalidade por assento.
3. "Infra, Gateways & Edge" -> Gateways de IA, proxies reversos, Cloudflare Workers, roteadores de tráfego, Docker, DevOps, failover e resiliência de infra.
4. "Terminal, CLI & DX" -> Utilitários de terminal, TUIs, ferramentas de developer experience (DX), linters, formatters, compiladores e SDKs dev.
5. "Frontend & UI Components" -> Bibliotecas de componentes UI, design systems, Tailwind/CSS, utilitários visuais, ícones e frameworks web.
6. "Scrapers & Engenharia de Dados" -> Web scrapers, crawlers, pipelines ETL, automação com Playwright/Puppeteer e extração de dados da web.
7. "Cibersegurança & Pentest" -> Ferramentas de segurança, auditoria, pentest, scanners de vulnerabilidades, autenticação, criptografia e proteção.
8. "Apps & Produtividade" -> Aplicativos desktop/web prontos, ferramentas locais de notas/organização, foco e utilitários sem fricção.
9. "Backend, Bancos & Storage" -> Bancos de dados (SQL/NoSQL/vetoriais), ORMs, engines de storage (S3/MinIO), servidores backend e APIs.
(E "Outros" apenas como fallback de segurança).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FICHA TÉCNICA E DADOS REAIS DE DEPLOY / CUSTO / LICENÇA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você DEVE minerar os metadados e o README para extrair com precisão os 5 campos da FICHA TÉCNICA:
- "licenseBadge": Identificar a licença real do projeto (ex: "MIT", "Apache 2.0", "AGPL v3", "GPL v3", "BSD", "Open Source", "Verificar").
- "costBadge": O custo real direto do software (ex: "100% Grátis", "Freemium", "Open Source").
- "costNotes": Nota curta e objetiva sobre o modelo econômico (ex: "Self-hosted livre, adeus mensalidade", "Exige API key própria", "Sem custo por atendente", "100% local sem nuvem").
- "deployBadge": Nível de facilidade para colocar no ar (ex: "Fácil", "1 Comando", "Médio", "Docker Pronto", "Zero Setup").
- "deployMethod": O método real de execução/instalação identificado no README (ex: "Docker Compose", "npx / npm", "pip / uv", "Cargo / Binário", "Cloudflare Worker", "Binário único").

🎯 COMO USAR ESSES METADADOS NA COPY DO WHATSAPP:
- Na "introText" e no "killerText", use esses fatos para enriquecer a persuasão da mensagem:
  * LIBERDADE ECONÔMICA: destaque o fim de cobranças absurdas por usuário/assento em dólar e a independência de plataformas fechadas.
  * SOBERANIA DE DADOS: enfatize que o banco de dados (SQLite/PostgreSQL) roda na própria máquina/VPS do usuário, garantindo privacidade real.
  * FACILIDADE DE DEPLOY: mencione como é rápido colocar no ar (seja em 1 comando Docker, npm ou binário sem dependências).
  * AUDITABILIDADE DA LICENÇA: ressalte que o código é aberto e livre de pegadinhas corporativas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 DIRETRIZES DE OURO (SEM MONOTONIA E COM FOCO EM UTILIDADE REAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PROIBIÇÃO ABSOLUTA DE CLICHÊS E CÓPIAS LITERAIS:
- PROIBIDO copiar exemplos do prompt! O campo "hookTitle" DEVE SER 100% EXCLUSIVO E ORIGINAL para cada repositório, refletindo a dor ou superpoder específico que ELE resolve.
- NUNCA use as frases clichês: "O SERVIDOR MCP QUE FALTAVA", "O GATEWAY QUE SALVA A VIDA DA SUA INFRAESTRUTURA", "E SE NENHUMA SENHA OU CHAVE DE API NUNCA MAIS VAZASSE" ou "EXECUÇÃO NA BORDA EM MILISSEGUNDOS".
- NUNCA comece "introText" com "Construído especificamente para resolver gargalos de resiliência e tráfego crítico" ou "Conheça o...". Escreva uma abertura direta, vibrante e adaptada ao projeto.

2. GANCHOS ("hookTitle") IMPACTANTES:
Deve ser SEMPRE em MAIÚSCULAS, iniciando com 1 emoji temático impactante. Crie uma chamada irresistível e única baseada nos diferenciais reais do repositório.

3. MINERAÇÃO DO README POR DETALHES REAIS E CURIOSOS:
NÃO gere resumos genéricos. O leitor do "Pega a Visão" ama FATOS TÉCNICOS E CURIOSIDADES REAIS extraídos do README:
- Como roda na prática? (ex: 'Roda num binário único em Go/Rust de 15MB', 'Deploy com 1 comando via docker compose up -d', 'Roda direto como Cloudflare Worker na borda sem servidor').
- Quais protocolos, integrações ou tecnologias reais ele suporta? (ex: Docker, Prometheus, MCP, Webhooks, SQLite, PostgreSQL, Ollama, OpenAI, Redis).
- Limitações reais e 'letras miúdas' (ex: 'Não suporta NFS, requer disco local', 'Em fase alfa/experimental', 'Ainda sem interface mobile nativa'). Quando houver aviso crítico ou limitação, registre em "warningNote" começando com "⚠️ ". Se não houver, retorne "".
- Benchmarks ou números impressionantes (ex: 'Processa 50k req/s com 20MB de RAM', '5x mais rápido que a alternativa tradicional').
- Explicações didáticas com analogias divertidas em Português do Brasil! (ex: 'Pense nele como um porteiro inteligente que valida os crachás antes de deixar a requisição entrar no prédio').

4. VARIEDADE NA INTRODUÇÃO ("introText"):
Varie o estilo de abertura do primeiro parágrafo:
- "Se você usa X no dia a dia, vai pirar no <Nome>: ..."
- "Construído especificamente para resolver <problema>, o <Nome> é ..."
- "O <Nome> é uma daquelas ferramentas que você instala e não vive mais sem: ..."
- "Desenvolvido em <linguagem> com foco em <benefício>, o <Nome> entrega ..."
- "Para quem quer se livrar de <solução proprietária/fechada>, o <Nome> surge como ..."
- "O <Nome> transforma a forma como você lida com <tarefa>: ..."

5. CENÁRIO PRÁTICO REALISTA ("scenarioPrompt"):
O "scenarioPrompt" NUNCA deve ser algo genérico como 'Executar tarefa'. Deve soar como uma instrução, prompt, comando de terminal ou regra de negócio REAL do dia a dia de quem usa a ferramenta!

6. REGRAS PARA CADA CHAVE DO JSON:
- "category": Uma das 9 categorias válidas (ou "Outros").
- "templateType": Um dos 5 IDs de template válidos.
- "licenseBadge": Licença identificada (ex: "MIT", "Apache 2.0", "AGPL v3", "Open Source").
- "costBadge": Resumo do custo (ex: "100% Grátis", "Freemium", "Open Source").
- "costNotes": Detalhe econômico (ex: "Self-hosted livre, adeus mensalidade").
- "deployBadge": Nível de facilidade (ex: "Fácil", "1 Comando", "Médio").
- "deployMethod": Método de execução (ex: "Docker Compose", "npx / npm", "Cargo / Binário").
- "hookTitle": O gancho temático todo em MAIÚSCULAS com 1 emoji inicial.
- "introText": Parágrafo introdutório vibrante e variado.
- "warningNote": String opcional com aviso/limitação real ("⚠️ ...") ou "" se não houver.
- "features": Array com 5 a 7 strings curtas destacando recursos reais. Cada item DEVE começar com 1 emoji expressivo (ex: "📥 ...", "🔌 ...", "⚡ ...", "🔒 ...", "📊 ...").
- "scenarioTitle": Cabeçalho do cenário prático (ex: "🧠 PENSE ASSIM:", "⚡ NA PRÁTICA, VOCÊ FAZ ASSIM:", "💻 IMAGINE NO SEU PROJETO:").
- "scenarioIntro": 1 ou 2 frases curtas introduzindo a dor resolvida e preparando a instrução prática.
- "scenarioPrompt": A instrução prática ou comando real entre aspas.
- "scenarioSteps": Array com 4 a 6 passos curtos no infinitivo mostrando o que o sistema faz nos bastidores (NÃO inclua emojis numéricos 1️⃣..6️⃣ no início de cada item, apenas o texto).
- "scenarioOutro": Frase curta opcional de fechamento do cenário (ou "").
- "killerTitle": Título provocativo destacando o diferencial matador (ex: "🤯 A parte mais interessante?", "🔓 O que muda o jogo (Zero Mensalidade)?", "🛡️ O pulo do gato na arquitetura?", "🚀 Por que os devs estão adotando?").
- "killerText": 1 ou 2 parágrafos curtos explicando o verdadeiro pulo do gato (soberania de dados, arquitetura, velocidade, economia, privacidade).
- "summaryText": 1 parágrafo curto recomendando para quem vale a pena e como dar o primeiro passo.
- "punchline": Frase final de efeito curta, entusiasmada, começando com "🚀 ".`;

  const userPrompt = `Analise este repositório do GitHub e gere o JSON:

Repositório: ${meta.fullName}
URL: ${meta.repoUrl}
Descrição: ${meta.description || 'Sem descrição curta'}
Estrelas: ${meta.stars}
Forks: ${meta.forks}
Linguagem principal: ${meta.language}
Tópicos: ${meta.topics.join(', ') || 'nenhum'}
Último commit: ${meta.lastCommitAt}
Template sugerido/preferido: ${preferredTemplate ? `${preferredTemplate} (OBRIGATÓRIO USAR ESTE)` : `${autoDetectedTemplate} (sugerido, mas você pode ajustar se outro dos 5 fizer muito mais sentido)`}

Trecho do README:
${meta.readmeExcerpt || 'README não disponível.'}

INSTRUÇÕES EXTRAS DE EXTRAÇÃO:
- Minere o trecho do README por detalhes técnicos reais: Licença, Custo real, Método de Deploy (Docker, CLI, etc.), protocolos suportados (MCP, Prometheus, Webhooks), limitações práticas (warningNote), benchmarks ou números reais.
- Evite frases repetitivas. Não use "E SE VOCÊ..." em tudo. Use o tom exato da categoria selecionada.
- Garanta que o "scenarioPrompt" seja um comando ou instrução prática real do cotidiano.

Retorne APENAS o JSON válido com as chaves:
{
  "category": "...",
  "templateType": "...",
  "licenseBadge": "...",
  "costBadge": "...",
  "costNotes": "...",
  "deployBadge": "...",
  "deployMethod": "...",
  "hookTitle": "...",
  "introText": "...",
  "warningNote": "",
  "features": ["..."],
  "scenarioTitle": "...",
  "scenarioIntro": "...",
  "scenarioPrompt": "...",
  "scenarioSteps": ["..."],
  "scenarioOutro": "",
  "killerTitle": "...",
  "killerText": "...",
  "summaryText": "...",
  "punchline": "..."
}`;

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(25000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      return generateFallbackSummary(meta, preferredTemplate);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    if (!parsed) {
      return generateFallbackSummary(meta, preferredTemplate);
    }

    const fallback = generateFallbackSummary(meta, preferredTemplate);

    const rawTemplate = String(parsed.templateType || '');
    const isHarmful = Boolean(parsed.isHarmful) || deterministicCheck.isHarmful;
    const harmReason = parsed.harmReason ? String(parsed.harmReason).trim() : (deterministicCheck.harmReason || '');
    if (isHarmful) {
      throw new Error(`Repositório recusado por violação das diretrizes de segurança (Moderação Git-Visão): ${harmReason || 'Repositório malicioso, ilegal ou danoso.'}`);
    }


  const templateType: TemplateType =
      preferredTemplate && TEMPLATE_VARIATIONS[preferredTemplate]
        ? preferredTemplate
        : (rawTemplate in TEMPLATE_VARIATIONS ? (rawTemplate as TemplateType) : fallback.templateType);

    const rawCategory = String(parsed.category || '');
    const category: CategoryName = CATEGORIES.includes(rawCategory as CategoryName)
      ? (rawCategory as CategoryName)
      : detectCategory(meta, templateType);

    const licenseBadge = parsed.licenseBadge
      ? String(parsed.licenseBadge).trim()
      : fallback.licenseBadge;
    const costBadge = parsed.costBadge
      ? String(parsed.costBadge).trim()
      : fallback.costBadge;
    const costNotes = parsed.costNotes
      ? String(parsed.costNotes).trim()
      : fallback.costNotes;
    const deployBadge = parsed.deployBadge
      ? String(parsed.deployBadge).trim()
      : fallback.deployBadge;
    const deployMethod = parsed.deployMethod
      ? String(parsed.deployMethod).trim()
      : fallback.deployMethod;

    const features =
      Array.isArray(parsed.features) && parsed.features.length > 0
        ? parsed.features.map((f) => String(f).trim()).filter(Boolean)
        : fallback.features;

    const scenarioSteps =
      Array.isArray(parsed.scenarioSteps) && parsed.scenarioSteps.length > 0
        ? parsed.scenarioSteps.map((s) => String(s).trim()).filter(Boolean)
        : fallback.scenarioSteps;

    const partialSummary: Omit<GeneratedVisaoSummary, 'whatsappText'> = {
      category,
      templateType,
      licenseBadge,
      license_badge: licenseBadge,
      costBadge,
      cost_badge: costBadge,
      costNotes,
      cost_notes: costNotes,
      deployBadge,
      deploy_badge: deployBadge,
      deployMethod,
      deploy_method: deployMethod,
      hookTitle: String(parsed.hookTitle || fallback.hookTitle).trim(),
      introText: String(parsed.introText || fallback.introText).trim(),
      warningNote: parsed.warningNote ? String(parsed.warningNote).trim() : fallback.warningNote || '',
      features,
      scenarioTitle: String(parsed.scenarioTitle || fallback.scenarioTitle).trim(),
      scenarioIntro: String(parsed.scenarioIntro || fallback.scenarioIntro).trim(),
      scenarioPrompt: String(parsed.scenarioPrompt || fallback.scenarioPrompt).trim(),
      scenarioSteps,
      scenarioOutro: parsed.scenarioOutro ? String(parsed.scenarioOutro).trim() : '',
      killerTitle: String(parsed.killerTitle || fallback.killerTitle).trim(),
      killerText: String(parsed.killerText || fallback.killerText).trim(),
      summaryText: String(parsed.summaryText || fallback.summaryText).trim(),
      punchline: String(parsed.punchline || fallback.punchline).trim()
    };

    return {
      ...partialSummary,
      whatsappText: buildWhatsAppText(meta, partialSummary)
    };
  } catch {
    return generateFallbackSummary(meta, preferredTemplate);
  }
}

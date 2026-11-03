import type { CategoryName, GeneratedVisaoSummary, GitHubRepoMetadata, TemplateType } from './types.ts';
import { detectCategory, detectTemplateType } from './templates.ts';

export type VisaoSummary = GeneratedVisaoSummary;

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

const STEP_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

function formatStars(stars: number, lang: 'pt' | 'en' | 'es'): string {
  if (!Number.isFinite(stars) || stars < 0) return '0';
  if (stars >= 1000) {
    const k = (stars / 1000).toFixed(1);
    if (lang === 'pt') {
      return `${k.replace('.', ',').replace(',0', '')} mil`;
    }
    return `${k.replace('.0', '')}k`;
  }
  return `${Math.round(stars)}`;
}

function formatDate(isoDate: string, lang: 'pt' | 'en' | 'es'): string {
  if (!isoDate) return lang === 'en' ? 'recent' : lang === 'es' ? 'reciente' : 'recente';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate.trim())) {
    return isoDate.trim();
  }
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  if (lang === 'en') {
    return `${month}/${day}/${year}`;
  }
  return `${day}/${month}/${year}`;
}

interface TemplateI18nTexts {
  featureLeadIn: string;
  scenarioHeader: string;
  stepsLeadIn: string;
  killerHeader: string;
  summaryHeader: string;
  defaultHook: string;
  defaultIntro: string;
  defaultFeatures: string[];
  defaultScenarioTitle: string;
  defaultScenarioIntro: string;
  defaultScenarioPrompt: string;
  defaultScenarioSteps: string[];
  defaultScenarioOutro: string;
  defaultKillerTitle: string;
  defaultKillerText: string;
  defaultSummaryText: string;
  defaultPunchline: string;
}

const TEMPLATE_I18N: Record<TemplateType, Record<'pt' | 'en' | 'es', TemplateI18nTexts>> = {
  'ai-agent-automation': {
    pt: {
      featureLeadIn: '🤖 O que seu agente passa a fazer por você:',
      scenarioHeader: '🧠 PENSE ASSIM (COMO VOCÊ PEDE AO AGENTE):',
      stepsLeadIn: 'E o agente executa na prática:',
      killerHeader: '🤯 O pulo do gato na automação?',
      summaryHeader: '📌 VALE A PENA PARA QUEM:',
      defaultHook: '⚡ O MOTOR DE IA ZERO-CONFIG PARA SEUS AGENTES E AUTOMAÇÕES:',
      defaultIntro: 'Uma solução robusta e inteligente projetada para automatizar fluxos complexos, integrar LLMs e elevar a produtividade de equipes de engenharia.',
      defaultFeatures: [
        '🤖 Execução autônoma de tarefas repetitivas e fluxos complexos com IA.',
        '🔌 Integração nativa com protocolos modernos (MCP) e APIs flexíveis.',
        '⚡ Alta performance, arquitetura leve e pronta para produção imediata.',
        '🛡️ Tratamento avançado de erros com resiliência e failover automático.'
      ],
      defaultScenarioTitle: '🧠 PENSE ASSIM (COMO VOCÊ PEDE AO AGENTE):',
      defaultScenarioIntro: 'Quando você precisa processar dados ou gerar automações em escala:',
      defaultScenarioPrompt: 'Analise o repositório, extraia os principais pontos críticos e gere um relatório executivo.',
      defaultScenarioSteps: [
        'O agente varre o contexto e estrutura os dados de entrada.',
        'Aplica regras de negócio e validações em tempo de execução.',
        'Retorna o resultado limpo, formatado e pronto para uso.'
      ],
      defaultScenarioOutro: 'Eliminando horas de trabalho manual com uma única chamada.',
      defaultKillerTitle: '🤯 O pulo do gato na automação?',
      defaultKillerText: 'Elimina a necessidade de pipelines complexos manuais, combinando inteligência adaptativa com execução ultrarrápida em qualquer ambiente.',
      defaultSummaryText: 'Desenvolvedores, arquitetos e equipes que buscam injetar superpoderes de IA em seus produtos sem gastar semanas em configuração.',
      defaultPunchline: '💡 Menos boilerplate, mais autonomia real no seu dia a dia.'
    },
    en: {
      featureLeadIn: '🤖 What your agent executes for you:',
      scenarioHeader: '🧠 THINK OF IT LIKE THIS (YOUR PROMPT TO THE AGENT):',
      stepsLeadIn: 'And the agent executes seamlessly:',
      killerHeader: '🤯 The killer automation edge?',
      summaryHeader: '📌 RECOMMENDED FOR WHO:',
      defaultHook: '⚡ THE ZERO-CONFIG EDGE RUNTIME FOR YOUR AGENTS & AUTOMATIONS:',
      defaultIntro: 'A robust, intelligent solution designed to automate complex workflows, integrate LLMs, and boost engineering team productivity.',
      defaultFeatures: [
        '🤖 Autonomous execution of repetitive tasks and complex AI workflows.',
        '🔌 Native integration with modern protocols (MCP) and flexible APIs.',
        '⚡ High performance, lightweight architecture ready for instant production.',
        '🛡️ Advanced error handling with resilience and automatic failover.'
      ],
      defaultScenarioTitle: '🧠 THINK OF IT LIKE THIS (YOUR PROMPT TO THE AGENT):',
      defaultScenarioIntro: 'When you need to process data or trigger automated actions at scale:',
      defaultScenarioPrompt: 'Analyze the repository, extract key critical points, and generate an executive report.',
      defaultScenarioSteps: [
        'The agent scans context and structures incoming data payloads.',
        'Applies business rules and runtime validations instantly.',
        'Returns clean, formatted results ready for immediate use.'
      ],
      defaultScenarioOutro: 'Eliminating hours of manual toil with a single prompt.',
      defaultKillerTitle: '🤯 The killer automation edge?',
      defaultKillerText: 'Removes the need for complex manual pipelines, combining adaptive intelligence with lightning-fast execution in any environment.',
      defaultSummaryText: 'Developers, architects, and teams looking to inject AI superpowers into their products without spending weeks on setup.',
      defaultPunchline: '💡 Less boilerplate, true autonomous execution in your daily workflow.'
    },
    es: {
      featureLeadIn: '🤖 Lo que tu agente ejecuta por ti:',
      scenarioHeader: '🧠 PIÉNSALO ASÍ (TU PROMPT AL AGENTE):',
      stepsLeadIn: 'Y el agente ejecuta en la práctica:',
      killerHeader: '🤯 ¿El factor clave en la automatización?',
      summaryHeader: '📌 RECOMENDADO PARA QUIEN:',
      defaultHook: '⚡ EL RUNTIME DE IA ZERO-CONFIG PARA TUS AGENTES Y AUTOMATIZACIONES:',
      defaultIntro: 'Una solución robusta e inteligente diseñada para automatizar flujos complejos, integrar LLMs y potenciar la productividad de ingeniería.',
      defaultFeatures: [
        '🤖 Ejecución autónoma de tareas repetitivas y flujos complejos con IA.',
        '🔌 Integración nativa con protocolos modernos (MCP) y APIs flexibles.',
        '⚡ Alto rendimiento, arquitectura ligera y lista para producción inmediata.',
        '🛡️ Manejo avanzado de errores con resiliencia y conmutación automática.'
      ],
      defaultScenarioTitle: '🧠 PIÉNSALO ASÍ (TU PROMPT AL AGENTE):',
      defaultScenarioIntro: 'Cuando necesitas procesar datos o activar flujos automatizados a escala:',
      defaultScenarioPrompt: 'Analiza el repositorio, extrae los puntos críticos y genera un reporte ejecutivo.',
      defaultScenarioSteps: [
        'El agente escanea el contexto y estructura los datos de entrada.',
        'Aplica reglas de negocio y validaciones en tiempo de ejecución.',
        'Devuelve un resultado limpio, formateado y listo para usar.'
      ],
      defaultScenarioOutro: 'Eliminando horas de trabajo manual con un solo prompt.',
      defaultKillerTitle: '🤯 ¿El factor clave en la automatización?',
      defaultKillerText: 'Elimina la necesidad de pipelines manuales complejos, combinando inteligencia adaptativa con ejecución ultrarrápida.',
      defaultSummaryText: 'Desarrolladores, arquitectos y equipos que buscan inyectar superpoderes de IA en sus productos sin semanas de configuración.',
      defaultPunchline: '💡 Menos código repetitivo, verdadera autonomía en tu día a día.'
    }
  },
  'self-hosted-saas': {
    pt: {
      featureLeadIn: '🏢 O que ele entrega pronto pra sua operação:',
      scenarioHeader: '💰 PENSE NA ECONOMIA (E NA LIBERDADE):',
      stepsLeadIn: 'E o sistema orquestra sozinho:',
      killerHeader: '🔓 O que muda o jogo (Adeus Mensalidade em Dólar)?',
      summaryHeader: '📌 QUEM DEVERIA RODAR ISSO AMANHÃ:',
      defaultHook: '🏢 O SISTEMA SELF-HOSTED QUE LIBERTA SUA OPERAÇÃO DE MENSALIDADES:',
      defaultIntro: 'Uma plataforma completa para hospedar seus próprios serviços, garantindo soberania de dados, privacidade total e controle absoluto dos custos.',
      defaultFeatures: [
        '🏢 Painel administrativo completo e pronto para uso em produção.',
        '🔒 Soberania de dados total: tudo hospedado na sua própria infraestrutura.',
        '💰 Zero taxas por usuário ou limites artificiais de planos pagos.',
        '⚡ Instalação simplificada via Docker com suporte a backups automatizados.'
      ],
      defaultScenarioTitle: '💰 PENSE NA ECONOMIA (E NA LIBERDADE):',
      defaultScenarioIntro: 'Em vez de pagar centenas de dólares mensais por ferramentas de terceiros:',
      defaultScenarioPrompt: 'Suba o container na sua VPS,ponha seu domínio e receba sua operação completa.',
      defaultScenarioSteps: [
        'Configuração rápida de variáveis de ambiente e banco de dados.',
        'Inicialização de serviços isolados com alta disponibilidade.',
        'Operação contínua sem depender de serviços externos instáveis.'
      ],
      defaultScenarioOutro: 'Controle total sobre seu banco de dados e suas regras de negócio.',
      defaultKillerTitle: '🔓 O que muda o jogo (Adeus Mensalidade em Dólar)?',
      defaultKillerText: 'Você deixa de ser refém de reajustes de preços de SaaS proprietários e passa a ter código aberto auditável sob seu domínio.',
      defaultSummaryText: 'Empreendedores, agências e empresas que exigem privacidade de dados e redução drástica de custos operacionais.',
      defaultPunchline: '💡 Seus dados, sua infra, zero taxas surpresa no fim do mês.'
    },
    en: {
      featureLeadIn: '🏢 Ready-to-deploy capabilities for your operation:',
      scenarioHeader: '💰 THINK ABOUT THE SAVINGS (AND FREEDOM):',
      stepsLeadIn: 'And the system orchestrates automatically:',
      killerHeader: '🔓 The game-changer (Goodbye expensive SaaS subscriptions)?',
      summaryHeader: '📌 WHO SHOULD DEPLOY THIS TOMORROW:',
      defaultHook: '⚡ THE SELF-HOSTED PLATFORM THAT FREES YOUR OPERATION FROM SUBSCRIPTION FEES:',
      defaultIntro: 'A complete platform to host your own services, guaranteeing data sovereignty, absolute privacy, and total cost control.',
      defaultFeatures: [
        '🏢 Complete administrative dashboard ready for production use.',
        '🔒 Total data sovereignty: everything hosted on your own infrastructure.',
        '💰 Zero per-user fees or artificial limits from proprietary tiers.',
        '⚡ Simplified Docker deployment with automated backup support.'
      ],
      defaultScenarioTitle: '💰 THINK ABOUT THE SAVINGS (AND FREEDOM):',
      defaultScenarioIntro: 'Instead of paying hundreds of dollars monthly for third-party tools:',
      defaultScenarioPrompt: 'Spin up the container on your VPS, hook up your domain, and run your full operation.',
      defaultScenarioSteps: [
        'Quick configuration of environment variables and database.',
        'Initialization of isolated services with high availability.',
        'Continuous operation without relying on unstable external APIs.'
      ],
      defaultScenarioOutro: 'Absolute control over your database and business logic.',
      defaultKillerTitle: '🔓 The game-changer (Goodbye expensive SaaS subscriptions)?',
      defaultKillerText: 'Stop being held hostage by proprietary SaaS price hikes and own your fully auditable open-source stack.',
      defaultSummaryText: 'Founders, agencies, and enterprises demanding strict data privacy and dramatic operational cost reduction.',
      defaultPunchline: '💡 Your data, your infrastructure, zero surprise fees at month end.'
    },
    es: {
      featureLeadIn: '🏢 Capacidades listas para tu operación:',
      scenarioHeader: '💰 PIENSA EN EL AHORRO (Y EN LA LIBERTAD):',
      stepsLeadIn: 'Y el sistema se encarga automáticamente:',
      killerHeader: '🔓 El cambio definitivo (¡Adiós suscripciones caras!):',
      summaryHeader: '📌 QUIÉN DEBERÍA DESPLEGAR ESTO MAÑANA:',
      defaultHook: '⚡ EL SISTEMA SELF-HOSTED QUE LIBERA TU OPERACIÓN DE PAGOS MENSUALES:',
      defaultIntro: 'Una plataforma completa para alojar tus propios servicios, garantizando soberanía de datos, privacidad total y control absoluto de costos.',
      defaultFeatures: [
        '🏢 Panel administrativo completo listo para producción.',
        '🔒 Soberanía total de datos: todo alojado en tu propia infraestructura.',
        '💰 Cero tarifas por usuario o límites artificiales de planes cerrados.',
        '⚡ Despliegue simplificado en Docker con soporte de respaldos.'
      ],
      defaultScenarioTitle: '💰 PIENSA EN EL AHORRO (Y EN LA LIBERTAD):',
      defaultScenarioIntro: 'En lugar de pagar cientos de dólares al mes por herramientas de terceros:',
      defaultScenarioPrompt: 'Levanta el contenedor en tu VPS, apunta tu dominio y opera sin límites.',
      defaultScenarioSteps: [
        'Configuración rápida de variables de entorno y base de datos.',
        'Inicialización de servicios aislados con alta disponibilidad.',
        'Operación continua sin depender de servicios externos inestables.'
      ],
      defaultScenarioOutro: 'Control absoluto sobre tu base de datos y tus reglas de negocio.',
      defaultKillerTitle: '🔓 El cambio definitivo (¡Adiós suscripciones caras!):',
      defaultKillerText: 'Dejas atrás los aumentos de precios de SaaS propietarios y obtienes código abierto auditable bajo tu propio dominio.',
      defaultSummaryText: 'Emprendedores, agencias y empresas que exigen privacidad de datos y reducción drástica de costos operativos.',
      defaultPunchline: '💡 Tus datos, tu infraestructura, cero sorpresas a fin de mes.'
    }
  },
  'infra-gateway': {
    pt: {
      featureLeadIn: '🛡️ O que ele segura nos bastidores da sua stack:',
      scenarioHeader: '⚙️ CENÁRIO REAL DE PRODUÇÃO:',
      stepsLeadIn: 'E a infraestrutura responde no milissegundo:',
      killerHeader: '🛡️ A sacada genial de arquitetura?',
      summaryHeader: '📌 INDISPENSÁVEL PARA QUEM:',
      defaultHook: '⚡ O GATEWAY DE INFRAESTRUTURA QUE SALVA SUA STACK DE PRODUÇÃO:',
      defaultIntro: 'Uma ferramenta de alta performance para roteamento, proxy reverso, balanceamento e proteção de serviços em ambientes de altíssimo tráfego.',
      defaultFeatures: [
        '🛡️ Proteção avançada contra quedas de tráfego e falhas de upstream.',
        '⚡ Roteamento inteligente com latência ultrabaixa em nível de borda.',
        '🔄 Failover automático e balanceamento de carga transparente.',
        '📊 Observabilidade em tempo real com métricas detalhadas de tráfego.'
      ],
      defaultScenarioTitle: '⚙️ CENÁRIO REAL DE PRODUÇÃO:',
      defaultScenarioIntro: 'Quando seu serviço principal sofre pico de acesso ou instabilidade na API externa:',
      defaultScenarioPrompt: 'Redirecione o tráfego instantaneamente para instâncias de backup sem queda de pacotes.',
      defaultScenarioSteps: [
        'O gateway detecta latência elevada no servidor primário.',
        'Chaves de failover chaveiam o tráfego para a rota secundária.',
        'O cliente final não percebe nenhuma interrupção no serviço.'
      ],
      defaultScenarioOutro: 'Disponibilidade 99.99% garantida sem complexidade excessiva.',
      defaultKillerTitle: '🛡️ A sacada genial de arquitetura?',
      defaultKillerText: 'Combina velocidade de processamento na borda com regras de roteamento dinâmicas configuráveis em segundos.',
      defaultSummaryText: 'Engenheiros de DevOps, arquitetos de sistemas e equipes que gerenciam serviços críticos de missão crítica.',
      defaultPunchline: '💡 Resiliência de ponta a ponta sem dor de cabeça na madrugada.'
    },
    en: {
      featureLeadIn: '🛡️ What it secures and optimizes behind your stack:',
      scenarioHeader: '⚙️ REAL PRODUCTION SCENARIO:',
      stepsLeadIn: 'And the infrastructure responds in milliseconds:',
      killerHeader: '🛡️ The genius architectural edge?',
      summaryHeader: '📌 ESSENTIAL FOR WHO:',
      defaultHook: '⚡ THE INFRASTRUCTURE GATEWAY THAT SAVES YOUR PRODUCTION STACK:',
      defaultIntro: 'A high-performance tool for routing, reverse proxying, load balancing, and securing services under heavy traffic loads.',
      defaultFeatures: [
        '🛡️ Advanced protection against traffic surges and upstream outages.',
        '⚡ Intelligent routing with ultra-low latency at the network edge.',
        '🔄 Automatic failover and seamless load balancing.',
        '📊 Real-time observability with detailed traffic metrics.'
      ],
      defaultScenarioTitle: '⚙️ REAL PRODUCTION SCENARIO:',
      defaultScenarioIntro: 'When your primary service experiences traffic spikes or upstream API instability:',
      defaultScenarioPrompt: 'Route traffic instantly to backup instances without dropping a single packet.',
      defaultScenarioSteps: [
        'The gateway detects elevated latency on the primary upstream.',
        'Failover rules seamlessly shift traffic to healthy secondary nodes.',
        'End users experience zero downtime or dropped connections.'
      ],
      defaultScenarioOutro: 'Guaranteed 99.99% uptime without excessive operational overhead.',
      defaultKillerTitle: '🛡️ The genius architectural edge?',
      defaultKillerText: 'Combines edge-native processing speed with dynamic routing rules configurable in seconds.',
      defaultSummaryText: 'DevOps engineers, systems architects, and teams managing mission-critical production services.',
      defaultPunchline: '💡 End-to-end resilience without middle-of-the-night paging alerts.'
    },
    es: {
      featureLeadIn: '🛡️ Lo que asegura y optimiza en tu infraestructura:',
      scenarioHeader: '⚙️ ESCENARIO REAL DE PRODUCCIÓN:',
      stepsLeadIn: 'Y la infraestructura responde al instante:',
      killerHeader: '🛡️ ¿La genialidad arquitectónica?',
      summaryHeader: '📌 INDISPENSABLE PARA QUIEN:',
      defaultHook: '⚡ EL GATEWAY DE INFRAESTRUCTURA QUE SALVA TU STACK DE PRODUCCIÓN:',
      defaultIntro: 'Una herramienta de alto rendimiento para enrutamiento, proxy inverso, balanceo y protección de servicios bajo tráfico pesado.',
      defaultFeatures: [
        '🛡️ Protección avanzada contra picos de tráfico y fallas de upstream.',
        '⚡ Enrutamiento inteligente con latencia ultra baja en el borde.',
        '🔄 Conmutación por falla automática y balanceo de carga transparente.',
        '📊 Observabilidad en tiempo real con métricas detalladas.'
      ],
      defaultScenarioTitle: '⚙️ ESCENARIO REAL DE PRODUCCIÓN:',
      defaultScenarioIntro: 'Cuando tu servicio principal sufre picos de tráfico o inestabilidad externa:',
      defaultScenarioPrompt: 'Redirige el tráfico instantáneamente a nodos de respaldo sin perder paquetes.',
      defaultScenarioSteps: [
        'El gateway detecta alta latencia en el servidor primario.',
        'Las reglas de failover desvían el tráfico a rutas secundarias saludables.',
        'El usuario final experimenta cero interrupciones.'
      ],
      defaultScenarioOutro: 'Disponibilidad 99.99% garantizada sin sobrecarga operativa.',
      defaultKillerTitle: '🛡️ ¿La genialidad arquitectónica?',
      defaultKillerText: 'Combina velocidad de procesamiento en el borde con reglas de enrutamiento dinámicas configurables en segundos.',
      defaultSummaryText: 'Ingenieros DevOps, arquitectos de sistemas y equipos que gestionan servicios críticos de misión.',
      defaultPunchline: '💡 Resiliencia de punta a punta sin alertas de madrugada.'
    }
  },
  'app-tool': {
    pt: {
      featureLeadIn: '⚡ O que ele resolve no seu dia a dia com zero atrito:',
      scenarioHeader: '🎯 VEJA A PRATICIDADE NO USO REAL:',
      stepsLeadIn: 'E o aplicativo resolve em poucos cliques:',
      killerHeader: '💡 Por que ele supera alternativas fechadas e pesadas?',
      summaryHeader: '📌 PERFEITO PARA QUEM:',
      defaultHook: '⚡ A FERRAMENTA ESSENCIAL PARA RESOLVER SEU FLUXO DIÁRIO:',
      defaultIntro: 'Um utilitário rápido, intuitivo e altamente eficiente projetado para eliminar tarefas tediosas e otimizar sua produtividade.',
      defaultFeatures: [
        '⚡ Interface limpa e intuitiva com foco absoluto em usabilidade.',
        '🚀 Performance imediata sem travamentos ou consumo excessivo de recursos.',
        '🔧 Altamente customizável para se adaptar ao seu workflow pessoal.',
        '📂 Funciona offline ou com integração leve sem dependências complexas.'
      ],
      defaultScenarioTitle: '🎯 VEJA A PRATICIDADE NO USO REAL:',
      defaultScenarioIntro: 'Quando você precisa realizar aquela tarefa repetitiva sem perder tempo:',
      defaultScenarioPrompt: 'Abra a ferramenta, aplique a ação em lote e exporte o resultado formatado.',
      defaultScenarioSteps: [
        'Insira seus dados de entrada diretamente na interface.',
        'Execute o processamento otimizado em frações de segundo.',
        'Copie ou salve o resultado pronto para uso.'
      ],
      defaultScenarioOutro: 'Produtividade instantânea sem curva de aprendizado.',
      defaultKillerTitle: '💡 Por que ele supera alternativas fechadas e pesadas?',
      defaultKillerText: 'Foco total na experiência do usuário, código aberto transparente e velocidade nativa sem bloatware.',
      defaultSummaryText: 'Profissionais, criadores e desenvolvedores que valorizam ferramentas ágeis e sem atrito.',
      defaultPunchline: '💡 Menos cliques, mais resultados entregues na hora.'
    },
    en: {
      featureLeadIn: '⚡ What it solves in your daily workflow with zero friction:',
      scenarioHeader: '🎯 SEE THE PRACTICAL WORKFLOW:',
      stepsLeadIn: 'And the application handles it in seconds:',
      killerHeader: '💡 Why it outperforms heavy commercial alternatives?',
      summaryHeader: '📌 PERFECT FOR WHO:',
      defaultHook: '⚡ THE ESSENTIAL UTILITY TO STREAMLINE YOUR DAILY WORKFLOW:',
      defaultIntro: 'A fast, intuitive, and highly efficient utility designed to eliminate tedious tasks and supercharge your productivity.',
      defaultFeatures: [
        '⚡ Clean and intuitive interface with absolute focus on usability.',
        '🚀 Immediate performance without freezing or heavy resource bloat.',
        '🔧 Highly customizable to fit your exact personal workflow.',
        '📂 Works offline or with lightweight integration without heavy dependencies.'
      ],
      defaultScenarioTitle: '🎯 SEE THE PRACTICAL WORKFLOW:',
      defaultScenarioIntro: 'When you need to tackle that repetitive task without wasting time:',
      defaultScenarioPrompt: 'Open the tool, apply batch processing, and export the formatted result.',
      defaultScenarioSteps: [
        'Input your source data directly into the interface.',
        'Execute optimized processing in fractions of a second.',
        'Copy or save your ready-to-use output instantly.'
      ],
      defaultScenarioOutro: 'Instant productivity with zero learning curve.',
      defaultKillerTitle: '💡 Why it outperforms heavy commercial alternatives?',
      defaultKillerText: 'Uncompromising focus on user experience, transparent open-source code, and native speed without bloatware.',
      defaultSummaryText: 'Professionals, creators, and developers who value agile tools with zero friction.',
      defaultPunchline: '💡 Fewer clicks, more results delivered instantly.'
    },
    es: {
      featureLeadIn: '⚡ Lo que resuelve en tu día a día con cero fricción:',
      scenarioHeader: '🎯 MIRA EL FLUJO PRÁCTICO EN ACCIÓN:',
      stepsLeadIn: 'Y la aplicación lo resuelve en segundos:',
      killerHeader: '💡 ¿Por qué supera a alternativas pesadas?',
      summaryHeader: '📌 PERFECTO PARA QUIEN:',
      defaultHook: '⚡ LA UTILIDAD ESENCIAL PARA SIMPLIFICAR TU FLÚJO DIARIO:',
      defaultIntro: 'Una herramienta rápida, intuitiva y altamente eficiente diseñada para eliminar tareas tediosas y potenciar tu productividad.',
      defaultFeatures: [
        '⚡ Interfaz limpia e intuitiva con enfoque absoluto en usabilidad.',
        '🚀 Rendimiento inmediato sin bloqueos ni consumo excesivo de recursos.',
        '🔧 Altamente personalizable para adaptarse a tu flujo de trabajo.',
        '📂 Funciona sin conexión o con integración ligera sin dependencias.'
      ],
      defaultScenarioTitle: '🎯 MIRA EL FLUJO PRÁCTICO EN ACCIÓN:',
      defaultScenarioIntro: 'Cuando necesitas resolver esa tarea repetitiva sin perder tiempo:',
      defaultScenarioPrompt: 'Abre la herramienta, procesa por lotes y exporta el resultado.',
      defaultScenarioSteps: [
        'Ingresa tus datos de entrada directamente en la interfaz.',
        'Ejecuta el procesamiento optimizado en fracciones de segundo.',
        'Copia o guarda el resultado listo para usar.'
      ],
      defaultScenarioOutro: 'Productividad instantánea sin curva de aprendizaje.',
      defaultKillerTitle: '💡 ¿Por qué supera a alternativas pesadas?',
      defaultKillerText: 'Enfoque total en la experiencia de usuario, código abierto transparente y velocidad nativa sin software inflado.',
      defaultSummaryText: 'Profesionales, creadores y desarrolladores que valoran herramientas ágiles y sin fricción.',
      defaultPunchline: '💡 Menos clics, más resultados entregados al instante.'
    }
  },
  'dev-lib-cli': {
    pt: {
      featureLeadIn: '🛠️ Superpoderes que ele injeta no seu código:',
      scenarioHeader: '💻 COMO FICA O CÓDIGO NO SEU PROJETO:',
      stepsLeadIn: 'E a biblioteca entrega de bandeja:',
      killerHeader: '🚀 Por que a comunidade dev está adotando em massa?',
      summaryHeader: '📌 COLOQUE NO SEU RADAR SE VOCÊ:',
      defaultHook: '⚡ A BIBLIOTECA E CLI QUE ACELERA SEU DESENVOLVIMENTO EM 10X:',
      defaultIntro: 'Uma ferramenta de desenvolvimento moderna e tipada projetada para eliminar código boilerplate e otimizar a DX (Developer Experience).',
      defaultFeatures: [
        '🛠️ Tipagem estricta e suporte completo a TypeScript out-of-the-box.',
        '⚡ Execução ultrarrápida com pegada de memória mínima.',
        '📦 API limpa, modular e fácil de integrar em qualquer projeto existente.',
        '🔍 Excelente DX com mensagens de erro claras e utilitários robustos.'
      ],
      defaultScenarioTitle: '💻 COMO FICA O CÓDIGO NO SEU PROJETO:',
      defaultScenarioIntro: 'Ao integrar o pacote no seu fluxo de desenvolvimento diário:',
      defaultScenarioPrompt: 'npm install repo-package && npx repo-cli init --fast',
      defaultScenarioSteps: [
        'Importe o módulo ou execute o comando diretamente no terminal.',
        'Configure as opções com autocompletes inteligentes.',
        'Aproveite a automação integrada gerando resultados limpos.'
      ],
      defaultScenarioOutro: 'Dezenas de linhas de código boilerplate economizadas em segundos.',
      defaultKillerTitle: '🚀 Por que a comunidade dev está adotando em massa?',
      defaultKillerText: 'Resolve problemas complexos de infraestrutura e manipulação de dados com uma API minimalista e elegante.',
      defaultSummaryText: 'Desenvolvedores fullstack, engenheiros de software e criadores de ferramentas CLI.',
      defaultPunchline: '💡 Menos código repetitivo, mais foco na regra de negócio.'
    },
    en: {
      featureLeadIn: '🛠️ Superpowers it injects into your codebase:',
      scenarioHeader: '💻 HOW IT LOOKS IN YOUR CODEBASE:',
      stepsLeadIn: 'And the library delivers out of the box:',
      killerHeader: '🚀 Why the dev community is adopting it massively?',
      summaryHeader: '📌 PUT ON YOUR RADAR IF YOU:',
      defaultHook: '⚡ THE LIBRARY & CLI THAT ACCELERATES YOUR DEVELOPMENT BY 10X:',
      defaultIntro: 'A modern, typed development utility designed to eliminate boilerplate code and supercharge Developer Experience (DX).',
      defaultFeatures: [
        '🛠️ Strict typing and full TypeScript support out-of-the-box.',
        '⚡ Ultra-fast execution with minimal memory footprint.',
        '📦 Clean, modular API easy to drop into any existing codebase.',
        '🔍 Exceptional DX with clear error messages and robust utilities.'
      ],
      defaultScenarioTitle: '💻 HOW IT LOOKS IN YOUR CODEBASE:',
      defaultScenarioIntro: 'When integrating the package into your daily development workflow:',
      defaultScenarioPrompt: 'npm install repo-package && npx repo-cli init --fast',
      defaultScenarioSteps: [
        'Import the module or run the CLI command directly in your terminal.',
        'Configure options with intelligent type autocompletion.',
        'Enjoy seamless automation delivering pristine output.'
      ],
      defaultScenarioOutro: 'Dozen of boilerplate lines eliminated in seconds.',
      defaultKillerTitle: '🚀 Why the dev community is adopting it massively?',
      defaultKillerText: 'Solves complex infrastructure and data manipulation challenges with a minimalist and elegant API design.',
      defaultSummaryText: 'Fullstack developers, software engineers, and CLI tool builders.',
      defaultPunchline: '💡 Less boilerplate, more focus on core business logic.'
    },
    es: {
      featureLeadIn: '🛠️ Superpoderes que inyecta en tu código:',
      scenarioHeader: '💻 CÓMO QUEDA EN TU CÓDIGO:',
      stepsLeadIn: 'Y la librería entrega de inmediato:',
      killerHeader: '🚀 ¿Por qué la comunidad dev lo adopta masivamente?',
      summaryHeader: '📌 PONLO EN TU RADAR SI TÚ:',
      defaultHook: '⚡ LA LIBRERÍA Y CLI QUE ACELERA TU DESARROLLO POR 10X:',
      defaultIntro: 'Una herramienta de desarrollo moderna y tipada diseñada para eliminar código repetitivo y potenciar la Experiencia de Desarrollador (DX).',
      defaultFeatures: [
        '🛠️ Tipado estricto y soporte completo para TypeScript por defecto.',
        '⚡ Ejecución ultrarrápida con consumo mínimo de memoria.',
        '📦 API limpia y modular fácil de integrar en cualquier proyecto.',
        '🔍 Excepcional DX con mensajes de error claros y utilidades robustas.'
      ],
      defaultScenarioTitle: '💻 CÓMO QUEDA EN TU CÓDIGO:',
      defaultScenarioIntro: 'Al integrar el paquete en tu flujo de desarrollo diario:',
      defaultScenarioPrompt: 'npm install repo-package && npx repo-cli init --fast',
      defaultScenarioSteps: [
        'Importa el módulo o ejecuta el comando directamente en tu terminal.',
        'Configura las opciones con autocompletado inteligente.',
        'Disfruta de automatización sin fricciones.'
      ],
      defaultScenarioOutro: 'Docenas de líneas de código repetitivo ahorradas en segundos.',
      defaultKillerTitle: '🚀 ¿Por qué la comunidad dev lo adopta masivamente?',
      defaultKillerText: 'Resuelve desafíos complejos con un diseño de API minimalista y elegante.',
      defaultSummaryText: 'Desarrolladores fullstack, ingenieros de software y creadores de herramientas CLI.',
      defaultPunchline: '💡 Menos código repetitivo, más foco en la lógica de negocio.'
    }
  }
};

export function generateLocalizedFallbackSummary(
  meta: GitHubRepoMetadata,
  templateType: TemplateType,
  lang: 'pt' | 'en' | 'es' = 'pt'
): VisaoSummary {
  const tplType = templateType && TEMPLATE_I18N[templateType] ? templateType : detectTemplateType(meta);
  const category = detectCategory(meta, tplType);
  const texts = TEMPLATE_I18N[tplType]?.[lang] || TEMPLATE_I18N['app-tool'][lang];

  const repoName = meta.name || meta.fullName || 'repository';
  const repoDesc = meta.description || texts.defaultIntro;

  const hookTitle = `${texts.defaultHook} ${repoName.toUpperCase()}`;
  const introText = `🚀 ${repoName}: ${repoDesc}`;

  const features = texts.defaultFeatures;
  const scenarioTitle = texts.scenarioHeader;
  const scenarioIntro = texts.defaultScenarioIntro;
  const scenarioPrompt = meta.description || texts.defaultScenarioPrompt;
  const scenarioSteps = texts.defaultScenarioSteps;
  const scenarioOutro = texts.defaultScenarioOutro;

  const killerTitle = texts.killerHeader;
  const killerText = texts.defaultKillerText;
  const summaryHeader = texts.summaryHeader;
  const summaryText = texts.defaultSummaryText;
  const punchline = texts.defaultPunchline;

  const starsText = formatStars(meta.stars, lang);
  const commitDate = formatDate(meta.lastCommitAt, lang);

  const license = meta.licenseBadge || meta.license_badge || meta.licenseSpdx || (lang === 'en' ? 'Open Source' : lang === 'es' ? 'Código Abierto' : 'Open Source');
  const costBadge = meta.costBadge || meta.cost_badge || (meta.isFree !== false ? (lang === 'en' ? '100% Free' : lang === 'es' ? '100% Gratis' : '100% Grátis') : 'BYOK / Freemium');
  const deployBadge = meta.deployBadge || meta.deploy_badge || (lang === 'en' ? 'Easy Setup' : lang === 'es' ? 'Instalación Fácil' : 'Instalação Fácil');
  const deployMethod = meta.deployMethod || meta.deploy_method || '';

  const costNotes = meta.costNotes || meta.cost_notes || '';
  const costLine = costNotes ? `💰 ${lang === 'en' ? 'Real Cost' : lang === 'es' ? 'Costo Real' : 'Custo Real'}: ${costBadge} (${costNotes})` : `💰 ${lang === 'en' ? 'Real Cost' : lang === 'es' ? 'Costo Real' : 'Custo Real'}: ${costBadge}`;
  const deployLine = deployMethod ? `⚙️ ${lang === 'en' ? 'Setup' : lang === 'es' ? 'Instalación' : 'Instalação'}: ${deployBadge} (${deployMethod})` : `⚙️ ${lang === 'en' ? 'Setup' : lang === 'es' ? 'Instalación' : 'Instalação'}: ${deployBadge}`;

  const techSpecsHeader = lang === 'en' ? '📋 TECH SPECS' : lang === 'es' ? '📋 FICHA TÉCNICA' : '📋 FICHA TÉCNICA';
  const licenseLabel = lang === 'en' ? 'License' : lang === 'es' ? 'Licencia' : 'Licença';
  const categoryLabel = lang === 'en' ? 'Category' : lang === 'es' ? 'Categoría' : 'Categoria';
  const starsLabel = lang === 'en' ? 'GitHub stars' : lang === 'es' ? 'estrellas en GitHub' : 'estrelas no GitHub';
  const commitLabel = lang === 'en' ? 'Last commit on' : lang === 'es' ? 'Último commit el' : 'Último commit em';

  const lines: string[] = [];
  lines.push(hookTitle.trim());
  lines.push('');
  lines.push(introText.trim());
  lines.push('');
  lines.push(`🔗 ${meta.repoUrl}`);
  lines.push(`⭐ ${starsText} ${starsLabel}`);
  lines.push(`🕒 ${commitLabel} ${commitDate}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push(techSpecsHeader);
  lines.push(`⚖️ ${licenseLabel}: ${license}`);
  lines.push(costLine);
  lines.push(deployLine);
  lines.push(`🏷️ ${categoryLabel}: ${category}`);
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');

  lines.push(texts.featureLeadIn);
  lines.push('');
  for (const feat of features) {
    if (feat && feat.trim()) {
      lines.push(feat.trim());
    }
  }
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');

  lines.push(scenarioTitle);
  lines.push('');
  if (scenarioIntro) {
    lines.push(scenarioIntro);
    lines.push('');
  }
  if (scenarioPrompt) {
    lines.push(`"${scenarioPrompt.trim().replace(/^["“”]+|["“”]+$/g, '')}"`);
    lines.push('');
  }
  lines.push(texts.stepsLeadIn);
  lines.push('');

  scenarioSteps.forEach((step, idx) => {
    const cleanStep = step.replace(/^(?:[0-9]️⃣|[0-9]+[.)\-:])\s*/, '').trim();
    if (cleanStep) {
      const emoji = STEP_EMOJIS[idx] || `${idx + 1}️⃣`;
      lines.push(`${emoji} ${cleanStep}`);
    }
  });

  if (scenarioOutro) {
    lines.push('');
    lines.push(scenarioOutro);
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(killerTitle);
  lines.push('');
  lines.push(killerText.trim());
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(summaryHeader);
  lines.push('');
  lines.push(summaryText.trim());
  lines.push('');
  lines.push(punchline.trim());

  const whatsappText = lines.join('\n');

  return {
    category,
    templateType: tplType,
    hookTitle,
    introText,
    features,
    scenarioTitle,
    scenarioIntro,
    scenarioPrompt,
    scenarioSteps,
    scenarioOutro,
    killerTitle,
    killerText,
    summaryText,
    punchline,
    whatsappText,
    licenseSpdx: meta.licenseSpdx || meta.license_spdx,
    licenseType: meta.licenseType || meta.license_type,
    isFree: meta.isFree ?? (meta.is_free === 1 ? true : undefined),
    costModel: meta.costModel || meta.cost_model,
    deployDifficulty: meta.deployDifficulty || meta.deploy_difficulty
  };
}

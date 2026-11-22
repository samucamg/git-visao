// Busca inteligente do catálogo: normaliza acentos, separa termos de perguntas
// naturais, expande sinônimos (PT/EN/ES) e ranqueia por relevância.
import { serializeRepoRecord, localizeSerializedRepo } from './db.ts';
import type { SerializedRepo } from './db.ts';
import type { RepoRecord } from './types.ts';

export interface SmartSearchOptions {
  q?: string;
  category?: string; // nome exato da categoria, '' = todas
  language?: string; // linguagem GitHub exata (sem diferenciar maiúsculas), '' = todas
  minStars?: number;
  recentDays?: number; // só repos com last_commit_at dentro de N dias (se parseável)
  sort?: 'relevance' | 'recent' | 'stars' | 'name';
  limit?: number; // padrão 30, limitado a 1..100
  cursor?: string; // opaco: base64 de JSON {o: offset}
  lang?: string; // 'pt' | 'en' | 'es'
}

export interface ParsedQuery {
  raw: string;
  terms: string[];
  concepts: string[][];
  categoryHints: string[];
  languageHint?: string;
}

interface ConceptDef {
  triggers: string[]; // palavras/frases que disparam o conceito
  variants: string[]; // termos buscados nos campos do repositório
  category?: string; // categoria do catálogo associada ao conceito
  language?: string; // linguagem de programação (quando o conceito é uma linguagem)
  exact?: boolean; // exige palavra inteira (evita 'mac' em 'machine', 'java' em 'javascript')
}

interface ConceptMeta {
  index: number; // -1 para termos desconhecidos
  variants: string[];
  category?: string;
  language?: string;
  exact: boolean;
}

// Dicionário de conceitos. Textos com acento são normalizados automaticamente.
const CONCEPTS: ConceptDef[] = [
  {
    triggers: ['segurança', 'seguranca', 'ciberseguranca', 'cibersegurança', 'security', 'seguridad', 'ciberseguridad', 'pentest', 'hacker', 'hacking', 'vulnerabilidade', 'vulnerabilidades'],
    variants: ['seguranca', 'security', 'secur', 'ciberseguranca', 'cyber', 'pentest', 'hacking', 'hacker', 'vulnerab', 'exploit', 'osint', 'malware', 'firewall', 'red team', 'ctf', 'scanner', 'autenticacao', 'authentication', 'criptograf', 'encrypt', 'ransomware', 'seguridad'],
    category: 'Cibersegurança & Pentest'
  },
  {
    triggers: ['ia', 'ai', 'inteligencia artificial', 'llm', 'llms', 'gpt', 'agente', 'agentes', 'agent', 'agents', 'chatbot', 'mcp', 'rag'],
    variants: ['ia', 'ai', 'llm', 'gpt', 'agent', 'agente', 'openai', 'gemini', 'claude', 'machine learning', 'ml', 'rag', 'chatbot', 'mcp', 'inteligencia', 'embedding', 'anthropic', 'ollama', 'langchain'],
    category: 'Agentes & Automação IA'
  },
  {
    triggers: ['whatsapp', 'wpp', 'zap', 'zapzap'],
    variants: ['whatsapp', 'evolution', 'baileys', 'wa', 'wpp', 'zap']
  },
  {
    triggers: ['video', 'videos', 'vídeo', 'vídeos'],
    variants: ['video', 'ffmpeg', 'youtube', 'mp4', 'remotion', 'legenda', 'subtitle', 'stream', 'streaming']
  },
  {
    triggers: ['audio', 'áudio', 'voz', 'voice', 'tts', 'speech', 'som'],
    variants: ['audio', 'tts', 'voice', 'voz', 'speech', 'whisper', 'sound', 'musica', 'music', 'podcast']
  },
  {
    triggers: ['transcricao', 'transcrição', 'transcricoes', 'transcrever', 'transcribe', 'transcription', 'transcript', 'transcripcion'],
    variants: ['transcri', 'whisper', 'speech to text', 'stt', 'transcription', 'transcribe']
  },
  {
    triggers: ['imagem', 'imagens', 'image', 'images', 'foto', 'fotos', 'imagen', 'imagenes'],
    variants: ['imagem', 'imagen', 'image', 'img', 'photo', 'foto', 'picture', 'ocr', 'opencv', 'vision', 'stable diffusion', 'diffusion']
  },
  {
    triggers: ['scraping', 'scrap', 'scraper', 'raspagem', 'crawler', 'crawl', 'coleta de dados', 'web scraping'],
    variants: ['scrap', 'crawl', 'spider', 'raspag', 'parser'],
    category: 'Scrapers & Engenharia de Dados'
  },
  {
    triggers: ['engenharia de dados', 'etl', 'pipeline de dados', 'data engineering', 'ingestao', 'ingestão'],
    variants: ['etl', 'pipeline', 'airflow', 'dbt', 'spark', 'kafka', 'data engineering', 'ingest'],
    category: 'Scrapers & Engenharia de Dados'
  },
  {
    triggers: ['banco de dados', 'bancos de dados', 'banco', 'bancos', 'base de dados', 'database', 'databases', 'db', 'sql', 'postgres', 'postgresql', 'mysql', 'mongodb', 'mongo', 'redis', 'sqlite', 'storage', 'armazenamento', 's3', 'bucket'],
    variants: ['database', 'sql', 'postgres', 'mysql', 'mongo', 'redis', 'sqlite', 'storage', 'banco de dados', 'db', 'supabase', 'minio', 's3', 'bucket', 'dynamo', 'mariadb', 'couchdb', 'armazenamento'],
    category: 'Backend, Bancos & Storage'
  },
  {
    triggers: ['automacao', 'automação', 'automatizar', 'automatizacao', 'automation', 'automations', 'automatizacion', 'n8n', 'workflow', 'workflows', 'zapier'],
    variants: ['automa', 'n8n', 'workflow', 'zapier', 'cron', 'agendador', 'scheduler']
  },
  {
    triggers: ['crm', 'vendas', 'venda', 'saas', 'erp', 'helpdesk', 'gestao', 'gestão', 'gestion', 'ventas'],
    variants: ['crm', 'saas', 'erp', 'vendas', 'venda', 'sales', 'helpdesk', 'ticket', 'billing', 'estoque', 'gestao', 'gestion', 'ventas', 'cliente'],
    category: 'SaaS & CRM Self-Hosted'
  },
  {
    triggers: ['email', 'emails', 'e-mail', 'mail', 'smtp', 'correio', 'correo'],
    variants: ['email', 'mail', 'smtp', 'imap', 'newsletter', 'correio']
  },
  {
    triggers: ['pdf', 'pdfs'],
    variants: ['pdf']
  },
  {
    triggers: ['docker', 'container', 'containers', 'selfhosted', 'self hosted', 'vps', 'kubernetes', 'k8s', 'homelab'],
    variants: ['docker', 'container', 'selfhost', 'self hosted', 'vps', 'kubernetes', 'k8s', 'compose', 'helm', 'homelab', 'podman']
  },
  {
    triggers: ['terminal', 'cli', 'linha de comando', 'command line', 'shell', 'tui', 'console', 'bash', 'zsh'],
    variants: ['terminal', 'cli', 'shell', 'tui', 'console', 'bash', 'zsh', 'command line', 'linha de comando'],
    category: 'Terminal, CLI & DX'
  },
  {
    triggers: ['frontend', 'front end', 'front-end', 'ui', 'react', 'vue', 'svelte', 'componentes', 'componente', 'css', 'tailwind'],
    variants: ['react', 'vue', 'svelte', 'angular', 'frontend', 'front end', 'ui', 'css', 'tailwind', 'component', 'nextjs', 'shadcn', 'design system'],
    category: 'Frontend & UI Components'
  },
  {
    triggers: ['infra', 'infraestrutura', 'gateway', 'gateways', 'proxy', 'proxies', 'edge', 'nginx', 'cloudflare', 'vpn', 'tunel', 'tunnel', 'dns'],
    variants: ['infra', 'gateway', 'proxy', 'nginx', 'cloudflare', 'traefik', 'caddy', 'edge', 'dns', 'vpn', 'tunnel', 'tunel', 'wireguard', 'load balancer', 'reverse proxy'],
    category: 'Infra, Gateways & Edge'
  },
  {
    triggers: ['windows', 'linux', 'mac', 'macos', 'android', 'ios'],
    variants: ['windows', 'linux', 'mac', 'macos', 'android', 'ios'],
    exact: true
  },
  {
    triggers: ['download', 'downloads', 'baixar', 'descarregar', 'descargar'],
    variants: ['download', 'baixar', 'yt dlp', 'ytdlp', 'descarg']
  },
  {
    triggers: ['traducao', 'tradução', 'traduzir', 'translate', 'translation', 'traduccion', 'traductor'],
    variants: ['translat', 'traduc', 'i18n', 'localiz', 'idioma', 'locale']
  },
  {
    triggers: ['financas', 'finanças', 'financeiro', 'finance', 'finances', 'contabilidade', 'fiscal', 'pagamento', 'pagamentos', 'pix', 'payment', 'payments'],
    variants: ['financ', 'finance', 'fintech', 'budget', 'orcament', 'contabil', 'accounting', 'payment', 'pagamento', 'pix', 'boleto', 'billing']
  },
  {
    triggers: ['teste', 'testes', 'testar', 'testing', 'test', 'tests', 'qa'],
    variants: ['test', 'qa', 'jest', 'playwright', 'cypress', 'vitest', 'mock']
  },
  {
    triggers: ['monitoramento', 'monitorar', 'monitoring', 'observabilidade', 'observability', 'metricas', 'metrics', 'grafana', 'prometheus', 'uptime'],
    variants: ['monitor', 'observab', 'grafana', 'prometheus', 'uptime', 'metric', 'alert', 'tracing', 'logs']
  },
  {
    triggers: ['backup', 'backups'],
    variants: ['backup', 'snapshot', 'restic']
  },
  {
    triggers: ['ecommerce', 'e-commerce', 'loja', 'lojas', 'loja virtual', 'shop'],
    variants: ['ecommerce', 'commerce', 'shop', 'store', 'woocommerce', 'checkout', 'loja']
  },
  {
    triggers: ['notas', 'anotacoes', 'anotação', 'anotacao', 'markdown', 'wiki', 'notes', 'note', 'obsidian', 'notion', 'base de conhecimento', 'conhecimento'],
    variants: ['note', 'markdown', 'wiki', 'obsidian', 'knowledge', 'anota', 'notion', 'conhecimento']
  },
  {
    triggers: ['produtividade', 'tarefas', 'tarefa', 'todo', 'task', 'tasks', 'kanban', 'calendario', 'calendário', 'agenda', 'calendar'],
    variants: ['productiv', 'todo', 'task', 'kanban', 'calendar', 'agenda', 'planner', 'calend'],
    category: 'Apps & Produtividade'
  },
  // Linguagens de programação (busca exata, dica de linguagem)
  { triggers: ['python', 'py'], variants: ['python', 'py'], language: 'Python', exact: true },
  { triggers: ['rust'], variants: ['rust'], language: 'Rust', exact: true },
  { triggers: ['go', 'golang'], variants: ['golang', 'go'], language: 'Go', exact: true },
  { triggers: ['typescript', 'ts'], variants: ['typescript', 'ts'], language: 'TypeScript', exact: true },
  { triggers: ['javascript', 'js'], variants: ['javascript', 'js'], language: 'JavaScript', exact: true },
  { triggers: ['java'], variants: ['java'], language: 'Java', exact: true },
  { triggers: ['c++', 'cpp'], variants: ['c++', 'cpp'], language: 'C++', exact: true },
  { triggers: ['c#', 'csharp'], variants: ['c#', 'csharp'], language: 'C#', exact: true },
  { triggers: ['php'], variants: ['php'], language: 'PHP', exact: true },
  { triggers: ['ruby'], variants: ['ruby'], language: 'Ruby', exact: true },
  { triggers: ['kotlin'], variants: ['kotlin'], language: 'Kotlin', exact: true },
  { triggers: ['swift'], variants: ['swift'], language: 'Swift', exact: true },
  { triggers: ['elixir'], variants: ['elixir'], language: 'Elixir', exact: true },
  { triggers: ['dart'], variants: ['dart'], language: 'Dart', exact: true }
];

// Palavras de parada (PT/EN/ES): artigos, verbos de pergunta e termos genéricos do catálogo.
const STOPWORDS = new Set(
  (
    // PT
    'a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem sobre que qual quais quem como onde e ou mas se eu me te voce vc vcs tem temos tenho tinha ter existe existem algum alguma alguns algumas algo alguem quero queria quer preciso precisa precisamos gostaria mostra mostre mostrar mostrem indica indique indicar lista liste listar ache achar encontre encontrar procuro procurar busco buscar voltado voltada voltados voltadas relacionado relacionada relacionados relacionadas coisa coisas repositorio repositorios repo repos projeto projetos ferramenta ferramentas sistema sistemas app apps github opensource gratis gratuito gratuitos pode poderia ha bom boa melhor melhores sao esta estao isso isto esse essa ao aos alternativa alternativas alternativo substituto substituir parecido parecida similar tipo estilo igual opcao opcoes ' +
    // EN
    'the an is are there any some of for with about to in on and or me show find give alternative alternatives replacement substitute like similar need want looking i do you have has what which tool tools project projects repository repositories system systems something anything free can please list its it be this that these those ' +
    // ES
    'el la los las unos unas del para con sobre hay alguno alguna tienes tiene quiero necesito muestra muestrame busco herramienta herramientas proyecto proyectos repositorio repositorios sistema sistemas en y tenemos tienen buscando hola'
  )
    .split(' ')
    .filter(Boolean)
);

// Normaliza: minúsculas e sem acentos (NFD + remoção de marcas combinantes).
export function normalizeText(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

// Remove pontuação mantendo letras, números, '+' e '#' (c++, c#).
function squash(s: string): string {
  return s.replace(/[^\p{L}\p{N}+#\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Stemming leve: tira 's' final de palavras com mais de 4 letras.
function stripS(w: string): string {
  return w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w;
}

function phraseKey(words: string[]): string {
  return words.map(stripS).join(' ');
}

// Índices de busca construídos uma vez.
const SINGLE_INDEX = new Map<string, number>();
const PHRASE_INDEX = new Map<string, number>();
let MAX_PHRASE_WORDS = 1;
const STOP_PHRASES = new Set<string>([phraseKey(['open', 'source'])]);

CONCEPTS.forEach((def, index) => {
  for (const t of def.triggers) {
    const words = squash(normalizeText(t)).split(' ').filter(Boolean);
    if (words.length === 0) continue;
    const key = phraseKey(words);
    if (words.length === 1) SINGLE_INDEX.set(key, index);
    else {
      PHRASE_INDEX.set(key, index);
      MAX_PHRASE_WORDS = Math.max(MAX_PHRASE_WORDS, words.length);
    }
  }
});

function conceptMeta(index: number): ConceptMeta {
  const def = CONCEPTS[index];
  const variants = Array.from(
    new Set(
      [...def.triggers, ...def.variants]
        .map((v) => squash(normalizeText(v)))
        .filter(Boolean)
    )
  );
  return {
    index,
    variants,
    category: def.category,
    language: def.language,
    exact: Boolean(def.exact)
  };
}

interface Unit {
  text: string;
  concept?: number;
}

function analyzeQuery(q: string): { terms: string[]; metas: ConceptMeta[] } {
  let s = normalizeText(q);
  // Menções: "@Samuel Santos/vision", "@bot" e comandos "/vision" ou "!vision".
  s = s.replace(/(^|\s)@[^\s/]+(?:\s+[^\s/@]+)?\/\S*/g, ' ');
  s = s.replace(/(^|\s)@\S*/g, ' ');
  s = s.replace(/(^|\s)[/!]\s*vision\b/g, ' ');
  s = s.replace(/^\s*vision\s+(?=\S)/, ' ');
  const tokens = squash(s).split(' ').filter(Boolean);

  // Primeiro detecta frases de vários termos (antes de remover stopwords).
  const units: Unit[] = [];
  let i = 0;
  while (i < tokens.length) {
    let consumed = 0;
    for (let k = Math.min(MAX_PHRASE_WORDS, tokens.length - i); k >= 2 && !consumed; k--) {
      const slice = tokens.slice(i, i + k);
      const key = phraseKey(slice);
      if (STOP_PHRASES.has(key)) {
        consumed = k;
        break;
      }
      const ci = PHRASE_INDEX.get(key);
      if (ci !== undefined) {
        units.push({ text: slice.join(' '), concept: ci });
        consumed = k;
      }
    }
    if (consumed) {
      i += consumed;
    } else {
      units.push({ text: tokens[i] });
      i++;
    }
  }

  const terms: string[] = [];
  const metas: ConceptMeta[] = [];
  const seenConcepts = new Set<number>();
  const seenTerms = new Set<string>();

  for (const unit of units) {
    if (unit.concept === undefined) {
      const tok = unit.text;
      const key = stripS(tok);
      if (STOPWORDS.has(tok) || STOPWORDS.has(key)) continue;
      const ci = SINGLE_INDEX.get(key);
      if (ci !== undefined) {
        if (!seenTerms.has(tok)) terms.push(tok);
        seenTerms.add(tok);
        if (!seenConcepts.has(ci)) {
          seenConcepts.add(ci);
          metas.push(conceptMeta(ci));
        }
        continue;
      }
      if (!seenTerms.has(tok)) terms.push(tok);
      seenTerms.add(tok);
      const variants = Array.from(new Set([tok, key]));
      metas.push({ index: -1, variants, exact: false });
      continue;
    }

    if (!seenTerms.has(unit.text)) terms.push(unit.text);
    seenTerms.add(unit.text);
    if (!seenConcepts.has(unit.concept)) {
      seenConcepts.add(unit.concept);
      metas.push(conceptMeta(unit.concept));
    }
  }

  return { terms, metas };
}

export function parseSearchQuery(q: string): ParsedQuery {
  const raw = typeof q === 'string' ? q : '';
  const { terms, metas } = analyzeQuery(raw);
  const categoryHints: string[] = [];
  for (const m of metas) {
    if (m.category && !categoryHints.includes(m.category)) categoryHints.push(m.category);
  }
  const languageMeta = metas.find((m) => m.language);
  const parsed: ParsedQuery = {
    raw,
    terms,
    concepts: metas.map((m) => m.variants),
    categoryHints
  };
  if (languageMeta?.language) parsed.languageHint = languageMeta.language;
  return parsed;
}

// Cache de expressões: variante apenas no início de uma palavra (ou palavra inteira se curta/exata).
const regexCache = new Map<string, RegExp>();

function variantRegex(variant: string, exact: boolean): RegExp {
  const whole = exact || variant.length <= 3;
  const cacheKey = (whole ? 'W:' : 'P:') + variant;
  let re = regexCache.get(cacheKey);
  if (!re) {
    const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const post = whole ? '(?:$|[^\\p{L}\\p{N}])' : '';
    re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc}${post}`, 'u');
    regexCache.set(cacheKey, re);
  }
  return re;
}

function textMatches(text: string, meta: ConceptMeta): boolean {
  if (!text) return false;
  return meta.variants.some((v) => variantRegex(v, meta.exact).test(text));
}

interface LightRow {
  id: number;
  repo_key: string;
  full_name: string;
  name: string;
  description: string;
  language: string;
  topics_json: string;
  category: string;
  hook_title: string;
  intro_text: string;
  features_json: string;
  summary_text: string;
  stars: number;
  last_commit_at: string;
  updated_at: string;
}

interface Fields {
  name: string;
  topics: string;
  language: string;
  hook: string;
  desc: string;
  body: string;
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function buildFields(row: LightRow): Fields {
  const topics = parseJsonArray(row.topics_json || '[]');
  const features = parseJsonArray(row.features_json || '[]');
  return {
    name: squash(normalizeText(`${row.name} ${row.full_name}`)),
    topics: squash(normalizeText(topics.join(' '))),
    language: squash(normalizeText(row.language || '')),
    hook: squash(normalizeText(row.hook_title || '')),
    desc: squash(normalizeText(row.description || '')),
    body: squash(normalizeText(`${row.intro_text || ''} ${features.join(' ')} ${row.summary_text || ''}`))
  };
}

// Melhor peso de um conceito em um repositório (0 = não casou).
function conceptWeight(meta: ConceptMeta, f: Fields, row: LightRow): number {
  let best = 0;
  if (textMatches(f.name, meta)) best = Math.max(best, 10);
  if (textMatches(f.topics, meta)) best = Math.max(best, 7);
  if (meta.category && row.category === meta.category) best = Math.max(best, 8);
  if (textMatches(f.language, meta)) best = Math.max(best, 6);
  if (textMatches(f.hook, meta)) best = Math.max(best, 5);
  if (textMatches(f.desc, meta)) best = Math.max(best, 5);
  if (textMatches(f.body, meta)) best = Math.max(best, 2);
  return best;
}

const PAGE_DEFAULT = 30;

function encodeOffset(offset: number): string {
  const json = JSON.stringify({ o: offset });
  const B = (globalThis as any).Buffer;
  return B ? B.from(json, 'utf-8').toString('base64') : btoa(json);
}

function decodeOffset(raw: string | undefined): number {
  if (!raw || typeof raw !== 'string') return 0;
  try {
    const B = (globalThis as any).Buffer;
    const json = B ? B.from(raw.trim(), 'base64').toString('utf-8') : atob(raw.trim());
    const o = Number(JSON.parse(json)?.o);
    return Number.isFinite(o) && o > 0 ? Math.floor(o) : 0;
  } catch {
    return 0;
  }
}

const LIGHT_COLUMNS =
  'id, repo_key, full_name, name, description, language, topics_json, category, hook_title, intro_text, features_json, summary_text, stars, last_commit_at, updated_at';

export async function searchRepositories(
  db: D1Database,
  opts: SmartSearchOptions = {}
): Promise<{
  items: SerializedRepo[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
  byCategory: Record<string, number>;
  byLanguage: Record<string, number>;
  query: ParsedQuery | null;
}> {
  const limit = Math.min(Math.max(Math.floor(Number(opts.limit) || PAGE_DEFAULT), 1), 100);
  const offset = decodeOffset(opts.cursor);
  const q = (opts.q ?? '').trim();
  const analysis = q ? analyzeQuery(q) : { terms: [], metas: [] as ConceptMeta[] };
  const hasConcepts = analysis.metas.length > 0;
  const query: ParsedQuery | null = q ? parseSearchQuery(q) : null;

  // Filtros SQL (categoria, linguagem, estrelas).
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category && opts.category.trim()) {
    where.push('category = ?');
    params.push(opts.category.trim());
  }
  if (opts.language && opts.language.trim()) {
    where.push('LOWER(language) = ?');
    params.push(opts.language.trim().toLowerCase());
  }
  if (Number.isFinite(Number(opts.minStars)) && Number(opts.minStars) > 0) {
    where.push('stars >= ?');
    params.push(Number(opts.minStars));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sqlRows = await db
    .prepare(`SELECT ${LIGHT_COLUMNS} FROM repositories ${whereSql}`)
    .bind(...params)
    .all<LightRow>();

  // Pontuação em JS.
  const recentDays = Number(opts.recentDays);
  const recentLimitMs = Number.isFinite(recentDays) && recentDays > 0 ? recentDays * 86400000 : 0;
  const now = Date.now();
  const scored: { row: LightRow; matched: number; score: number }[] = [];
  for (const row of sqlRows.results ?? []) {
    if (recentLimitMs) {
      const t = Date.parse(row.last_commit_at || '');
      if (Number.isFinite(t) && now - t > recentLimitMs) continue;
    }
    if (!hasConcepts) {
      scored.push({ row, matched: 0, score: 0 });
      continue;
    }
    const fields = buildFields(row);
    let matched = 0;
    let score = 0;
    for (const meta of analysis.metas) {
      const w = conceptWeight(meta, fields, row);
      if (w > 0) {
        matched++;
        score += w;
      }
    }
    if (matched === 0) continue;
    // Pediu uma linguagem ("algo em rust"): quem é escrito nela vem antes de quem só a cita.
    const langBonus =
      query?.languageHint && String(row.language || '').toLowerCase() === query.languageHint.toLowerCase() ? 12 : 0;
    scored.push({ row, matched, score: score + langBonus + 0.2 * Math.log10((row.stars || 0) + 1) });
  }

  // Precisão: com vários conceitos, mostra só quem casa com TODOS; se sobrar pouco (< 3),
  // volta para "qualquer conceito" ordenado por quantos casaram.
  if (analysis.metas.length > 1) {
    const strict = scored.filter((s) => s.matched === analysis.metas.length);
    if (strict.length >= 3) scored.splice(0, scored.length, ...strict);
  }

  // Ordenação.
  let sort = opts.sort;
  if (!sort || (sort === 'relevance' && !hasConcepts)) sort = hasConcepts ? 'relevance' : 'recent';
  scored.sort((a, b) => {
    if (sort === 'relevance') {
      if (b.matched !== a.matched) return b.matched - a.matched;
      if (b.score !== a.score) return b.score - a.score;
      return b.row.stars - a.row.stars || a.row.id - b.row.id;
    }
    if (sort === 'stars') {
      return b.row.stars - a.row.stars || a.row.full_name.localeCompare(b.row.full_name);
    }
    if (sort === 'name') {
      return a.row.full_name.toLowerCase().localeCompare(b.row.full_name.toLowerCase());
    }
    // recent
    if (a.row.updated_at !== b.row.updated_at) return a.row.updated_at < b.row.updated_at ? 1 : -1;
    return b.row.id - a.row.id;
  });

  const total = scored.length;
  const pageRows = scored.slice(offset, offset + limit);
  const hasMore = offset + limit < total;
  const nextCursor = hasMore ? encodeOffset(offset + pageRows.length) : null;

  // Busca as linhas completas da página, preservando a ordem.
  let items: SerializedRepo[] = [];
  if (pageRows.length) {
    const ids = pageRows.map((p) => p.row.id);
    const placeholders = ids.map(() => '?').join(', ');
    const full = await db
      .prepare(`SELECT * FROM repositories WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<RepoRecord>();
    const byId = new Map<number, RepoRecord>();
    for (const r of full.results ?? []) byId.set(Number(r.id), r);
    items = ids
      .map((id) => byId.get(id))
      .filter((r): r is RepoRecord => Boolean(r))
      .map((r) => localizeSerializedRepo(serializeRepoRecord(r), opts.lang || 'pt'));
  }

  // Contagens sobre o catálogo inteiro.
  const catRows = await db
    .prepare('SELECT category AS k, COUNT(*) AS n FROM repositories GROUP BY category')
    .all<{ k: string; n: number }>();
  const langRows = await db
    .prepare("SELECT language AS k, COUNT(*) AS n FROM repositories WHERE language IS NOT NULL AND language != '' GROUP BY language")
    .all<{ k: string; n: number }>();
  const byCategory: Record<string, number> = {};
  for (const r of catRows.results ?? []) {
    if (r.k) byCategory[r.k] = Number(r.n);
  }
  const byLanguage: Record<string, number> = {};
  for (const r of langRows.results ?? []) {
    const k = String(r.k ?? '').trim();
    if (!k || k.toLowerCase() === 'open source') continue;
    byLanguage[k] = (byLanguage[k] ?? 0) + Number(r.n);
  }

  return { items, total, hasMore, nextCursor, limit, byCategory, byLanguage, query };
}

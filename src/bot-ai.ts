// Resposta do bot com IA (OmniRoute, compatível com OpenAI), ancorada SÓ nos repositórios
// encontrados pela busca do catálogo. Os links são montados pelo código, nunca pela IA.

import { getRuntimeSettings } from './db.ts';
import type { Env } from './types.ts';

export interface AiContextItem {
  full_name: string;
  fullName?: string;
  repo_key?: string;
  stars?: number;
  category?: string;
  language?: string;
  description?: string;
  hook_title?: string;
  intro_text?: string;
  summary_text?: string;
  killer_text?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const AI_TIMEOUT_MS = 15000;
const MAX_ANSWER_CHARS = 700;

function clip(text: unknown, max: number): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function resolveEndpoint(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1') || trimmed.endsWith('/openai')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export const BOT_AI_SYSTEM_PROMPT = [
  'Você é o assistente do GitVisão, catálogo de repositórios open source do grupo de WhatsApp TopGits.',
  'Responda em português do Brasil, em tom direto e amigável, em NO MÁXIMO 600 caracteres.',
  'Use formatação de WhatsApp (*negrito*, _itálico_). Não use títulos, tabelas nem blocos de código.',
  'NUNCA escreva links ou URLs: eles são adicionados depois automaticamente.',
  'Use SOMENTE as informações dos repositórios fornecidos. Não invente recursos, números nem projetos.',
  'Se a pergunta for sobre um projeto específico: diga o que é, para que serve e um diferencial prático.',
  'Se a pergunta pedir recomendações: cite até 3 repositórios pelo nome (owner/repo) e diga em uma frase por que cada um serve.',
  'Se nenhum repositório fornecido responder à pergunta, diga com honestidade que não encontrou isso no catálogo.'
].join('\n');

export function buildAiUserPrompt(question: string, items: AiContextItem[]): string {
  const blocks = items.slice(0, 5).map((it, i) => {
    const name = it.full_name || it.fullName || it.repo_key || '';
    return [
      `[${i + 1}] ${name} — ⭐ ${Number(it.stars || 0)} — ${it.category || ''}${it.language ? ` — ${it.language}` : ''}`,
      it.description ? `Descrição: ${clip(it.description, 220)}` : '',
      it.hook_title ? `Chamada: ${clip(it.hook_title, 140)}` : '',
      it.intro_text ? `Resumo: ${clip(it.intro_text, 320)}` : '',
      it.summary_text ? `Em resumo: ${clip(it.summary_text, 260)}` : '',
      it.killer_text ? `Diferencial: ${clip(it.killer_text, 200)}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `Pergunta do grupo: "${clip(question, 300)}"\n\nRepositórios do catálogo que a busca encontrou:\n\n${blocks.join('\n\n')}`;
}

export interface AiConnectionTest {
  ok: boolean;
  endpoint: string;
  model: string;
  status?: number;
  latencyMs?: number;
  reply?: string;
  error?: string;
}

/** Teste mínimo do OmniRoute com o endereço, a chave e o modelo salvos (a chave nunca é devolvida). */
export async function testAiConnection(
  db: D1Database,
  env: Env,
  fetchImpl: FetchLike = fetch
): Promise<AiConnectionTest> {
  const settings = await getRuntimeSettings(db, env);
  const baseUrl = settings.omnirouteBaseUrl?.trim() || '';
  const apiKey = settings.omnirouteApiKey?.trim() || '';
  const model = settings.omnirouteModel || 'gemini-2.5-flash';
  const endpoint = baseUrl ? resolveEndpoint(baseUrl) : '';
  if (!baseUrl) return { ok: false, endpoint, model, error: 'Endereço do OmniRoute vazio nas Configurações.' };
  if (!apiKey) return { ok: false, endpoint, model, error: 'Chave do OmniRoute vazia nas Configurações.' };
  const started = Date.now();
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 20,
        temperature: 0,
        messages: [{ role: 'user', content: 'Responda apenas: OK' }]
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
    const latencyMs = Date.now() - started;
    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
      return { ok: false, endpoint, model, status: res.status, latencyMs, error: String(msg).replace(apiKey, '***') };
    }
    const reply = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!reply) return { ok: false, endpoint, model, status: res.status, latencyMs, error: 'Resposta sem texto (modelo existe?).' };
    return { ok: true, endpoint, model, status: res.status, latencyMs, reply: reply.slice(0, 80) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, endpoint, model, latencyMs: Date.now() - started, error: /timeout|abort/i.test(msg) ? `Sem resposta em ${AI_TIMEOUT_MS / 1000}s.` : msg };
  }
}

export interface GithubTokenTest {
  ok: boolean;
  hasToken: boolean;
  status?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  error?: string;
}

/** Confere o token do GitHub salvo (limite por hora e o quanto resta). O token nunca é devolvido. */
export async function testGithubToken(db: D1Database, env: Env, fetchImpl: FetchLike = fetch): Promise<GithubTokenTest> {
  const settings = await getRuntimeSettings(db, env);
  const token = settings.githubToken?.trim() || '';
  const headers: Record<string, string> = { 'User-Agent': 'git-visao', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetchImpl('https://api.github.com/rate_limit', { headers, signal: AbortSignal.timeout(10000) });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, hasToken: Boolean(token), status: res.status, error: res.status === 401 ? 'Token recusado pelo GitHub (inválido ou vencido).' : String(data?.message || `HTTP ${res.status}`) };
    }
    const core = data?.resources?.core || {};
    const limit = Number(core.limit || 0);
    return {
      ok: Boolean(token) && limit >= 5000,
      hasToken: Boolean(token),
      status: res.status,
      limit,
      remaining: Number(core.remaining || 0),
      resetAt: core.reset ? new Date(Number(core.reset) * 1000).toISOString() : undefined,
      error: token ? undefined : 'Sem token: limite de 60 consultas/hora (a raspagem e o reprocessamento falham).'
    };
  } catch (err) {
    return { ok: false, hasToken: Boolean(token), error: err instanceof Error ? err.message : String(err) };
  }
}

/** Texto de resposta gerado pela IA, ou null se não houver IA configurada / falhar / demorar. */
export async function answerWithAi(
  db: D1Database,
  env: Env,
  question: string,
  items: AiContextItem[],
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  if (!items.length) return null;
  let settings;
  try {
    settings = await getRuntimeSettings(db, env);
  } catch {
    return null;
  }
  const baseUrl = settings.omnirouteBaseUrl?.trim();
  const apiKey = settings.omnirouteApiKey?.trim();
  if (!baseUrl || !apiKey) return null;
  try {
    const res = await fetchImpl(resolveEndpoint(baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: settings.omnirouteModel || 'gemini-2.5-flash',
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          { role: 'system', content: BOT_AI_SYSTEM_PROMPT },
          { role: 'user', content: buildAiUserPrompt(question, items) }
        ]
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) return null;
    // Garantias: sem URLs inventadas, sem blocos markdown, tamanho limitado.
    text = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) return null;
    return text.length > MAX_ANSWER_CHARS ? `${text.slice(0, MAX_ANSWER_CHARS - 1).trimEnd()}…` : text;
  } catch {
    return null;
  }
}

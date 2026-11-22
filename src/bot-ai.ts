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

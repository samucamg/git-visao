// Divulgação do canal Samuca Tutoriais: canal + vídeos em destaque exibidos na home pública.
// Persistido em app_settings (key 'promo_config') com espelho no KV; editável pelo /admin.

import { getKV } from './db.ts';
import type { Env } from './types.ts';

export interface PromoVideo {
  id: string; // ID do YouTube (11 caracteres)
  title: string;
  tag?: string; // selo curto exibido no card (ex.: "Telegram", "Cloudflare")
  start?: number; // segundo inicial (t=33s)
}

export interface PromoConfig {
  enabled: boolean;
  channelName: string;
  channelHandle: string; // ex.: @SamucaTutoriais
  channelUrl: string;
  channelTagline: string;
  subscribersLabel: string; // texto livre (ex.: "14,5 mil inscritos")
  videos: PromoVideo[];
  /** Insere um card de vídeo a cada N repositórios na grade (0 = desliga). */
  gridEvery: number;
}

export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  enabled: true,
  channelName: 'Samuca Tutoriais',
  channelHandle: '@SamucaTutoriais',
  channelUrl: 'https://www.youtube.com/@SamucaTutoriais',
  channelTagline:
    'Tutoriais práticos em português: self-hosted, Cloudflare, IA e ferramentas open source — sem enrolação.',
  subscribersLabel: '14,5 mil inscritos',
  gridEvery: 9,
  videos: [
    {
      id: '2jr48gSxMwg',
      title: 'NebulaFTP: Espaço ILIMITADO e GRÁTIS no Telegram (SFTP + Painel Web) | Tutorial + Nébula Drive',
      tag: 'Telegram'
    },
    {
      id: 'nTdKghDnF4o',
      title: 'Jellyfin com Google Drive sem VPS e sem PC ligado | DriveFlin',
      tag: 'Streaming'
    },
    {
      id: 'ZhZCv8ZlHfc',
      title: 'Adeus S3! 🔥 CDN GRÁTIS E ILIMITADA COM GITHUB + CLOUDFLARE WORKERS (Deploy em 1 Clique!)',
      tag: 'Cloudflare',
      start: 33
    },
    {
      id: 'N2cWgTEGz9k',
      title: 'Adeus Custos com TTS! Instale o Multivozes Engine BR em 5 Minutos!',
      tag: 'IA / Voz'
    }
  ]
};

const PROMO_KEY = 'promo_config';
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extrai ID (e tempo inicial) de qualquer link do YouTube ou de um ID puro. */
export function parseYouTubeInput(input: string): { id: string; start?: number } | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (YT_ID.test(raw)) return { id: raw };
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    id =
      url.searchParams.get('v') ||
      url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ||
      '';
  }
  if (!YT_ID.test(id)) return null;
  const t = url.searchParams.get('t') || url.searchParams.get('start') || '';
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  const start = m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
  return start > 0 ? { id, start } : { id };
}

function clampText(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;
}

export function normalizePromoConfig(raw: unknown): PromoConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PROMO_CONFIG;
  const videos: PromoVideo[] = Array.isArray(src.videos)
    ? (src.videos as Array<Record<string, unknown>>)
        .map((v) => {
          const id = typeof v?.id === 'string' && YT_ID.test(v.id) ? v.id : '';
          if (!id) return null;
          const start = Number(v.start);
          return {
            id,
            title: clampText(v.title, 200, 'Vídeo do canal'),
            ...(typeof v.tag === 'string' && v.tag.trim() ? { tag: v.tag.trim().slice(0, 24) } : {}),
            ...(Number.isFinite(start) && start > 0 ? { start: Math.floor(start) } : {})
          } as PromoVideo;
        })
        .filter((v): v is PromoVideo => v !== null)
        .slice(0, 12)
    : d.videos;
  const channelUrl = clampText(src.channelUrl, 200, d.channelUrl);
  const gridEvery = Number(src.gridEvery);
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : d.enabled,
    channelName: clampText(src.channelName, 60, d.channelName),
    channelHandle: clampText(src.channelHandle, 60, d.channelHandle),
    channelUrl: /^https:\/\/(www\.)?youtube\.com\//.test(channelUrl) ? channelUrl : d.channelUrl,
    channelTagline: clampText(src.channelTagline, 240, d.channelTagline),
    subscribersLabel: typeof src.subscribersLabel === 'string' ? src.subscribersLabel.trim().slice(0, 40) : d.subscribersLabel,
    gridEvery: Number.isFinite(gridEvery) ? Math.min(Math.max(Math.floor(gridEvery), 0), 50) : d.gridEvery,
    videos
  };
}

let memo: { at: number; value: PromoConfig } | null = null;

export async function getPromoConfig(db: D1Database, env?: Env): Promise<PromoConfig> {
  if (memo && Date.now() - memo.at < 60_000) return memo.value;
  let raw: string | null = null;
  try {
    const row = await db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .bind(PROMO_KEY)
      .first<{ value: string }>();
    raw = row?.value ?? null;
  } catch {
    raw = null;
  }
  if (!raw) {
    const kv = getKV(env);
    if (kv) {
      try {
        raw = await kv.get(PROMO_KEY);
      } catch {
        raw = null;
      }
    }
  }
  let value = DEFAULT_PROMO_CONFIG;
  if (raw) {
    try {
      value = normalizePromoConfig(JSON.parse(raw));
    } catch {
      value = DEFAULT_PROMO_CONFIG;
    }
  }
  memo = { at: Date.now(), value };
  return value;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Busca o título oficial do vídeo pelo oEmbed do YouTube (sem chave de API). */
export async function fetchYouTubeTitle(id: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
  } catch {
    return null;
  }
}

export interface PromoConfigPatch extends Partial<Omit<PromoConfig, 'videos'>> {
  /** Lista de links/IDs do YouTube (um por item). Títulos vazios são buscados no oEmbed. */
  videoUrls?: string[];
  videos?: PromoVideo[];
}

export async function savePromoConfig(
  db: D1Database,
  patch: PromoConfigPatch,
  env?: Env,
  fetchImpl: FetchLike = fetch
): Promise<PromoConfig> {
  const current = await getPromoConfig(db, env);
  let videos = Array.isArray(patch.videos) ? patch.videos : current.videos;
  if (Array.isArray(patch.videoUrls)) {
    const known = new Map(current.videos.map((v) => [v.id, v]));
    const parsed = patch.videoUrls
      .map((u) => parseYouTubeInput(u))
      .filter((v): v is { id: string; start?: number } => v !== null);
    videos = await Promise.all(
      parsed.map(async (p) => {
        const prev = known.get(p.id);
        const title = prev?.title || (await fetchYouTubeTitle(p.id, fetchImpl)) || 'Vídeo do canal';
        return { id: p.id, title, ...(prev?.tag ? { tag: prev.tag } : {}), ...(p.start ? { start: p.start } : {}) };
      })
    );
  }
  const { videoUrls: _ignored, ...rest } = patch;
  void _ignored;
  const next = normalizePromoConfig({ ...current, ...rest, videos });
  const json = JSON.stringify(next);
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(PROMO_KEY, json)
    .run();
  const kv = getKV(env);
  if (kv) {
    try {
      await kv.put(PROMO_KEY, json);
    } catch {
      // KV é só espelho
    }
  }
  memo = { at: Date.now(), value: next };
  return next;
}

export function resetPromoMemo(): void {
  memo = null;
}

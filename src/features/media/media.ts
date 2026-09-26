import { isWebUrl } from '../browser/url';

export type Subtitle = {
  url: string;
  label: string;
  language?: string;
  format: 'VTT' | 'SRT' | 'TTML' | 'HLS' | 'Unknown';
  group?: string;
};
export type Media = {
  url: string;
  frameUrl: string;
  title: string;
  format: string;
  mime: string;
  source: string;
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  codecs?: string;
  label?: string;
  live?: boolean;
  protected?: boolean;
  requiresMaster?: boolean;
  subtitles: Subtitle[];
};
export type Player = { url: string; label: string };
export type Discovery = {
  media: Media[];
  players: Player[];
  tracks: Record<string, Subtitle[]>;
  excluded: string[];
};
export const emptyDiscovery = (): Discovery => ({
  media: [],
  players: [],
  tracks: {},
  excluded: [],
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}
function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
export function mediaUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || !value || value.length > 8192) return null;
  try {
    const url = base ? new URL(value, base).href : value;
    if (!isWebUrl(url)) return null;
    const parsed = new URL(url);
    return parsed.href.split('#')[0];
  } catch {
    return null;
  }
}
export function formatOf(url: string, mime = ''): [string, string] {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.m3u8') || /mpegurl|^hls$/i.test(mime))
    return ['HLS', 'application/vnd.apple.mpegurl'];
  if (path.endsWith('.mpd') || /dash\+xml|^dash$/i.test(mime))
    return ['DASH', 'application/dash+xml'];
  if (path.endsWith('.webm') || /video\/webm/i.test(mime))
    return ['WebM', 'video/webm'];
  if (/\.(mp4|m4v)$/.test(path) || /video\/(mp4|x-m4v)/i.test(mime))
    return ['MP4', 'video/mp4'];
  return ['Unknown', /^video\/[a-z0-9.+-]+$/i.test(mime) ? mime : ''];
}
export function subtitleOf(value: unknown, base?: string): Subtitle | null {
  const data = record(value);
  const url = mediaUrl(data.url, base);
  if (!url) return null;
  const extension = new URL(url).pathname
    .match(/\.(vtt|srt|ttml|m3u8)$/i)?.[1]
    ?.toLowerCase();
  const format =
    extension === 'm3u8'
      ? 'HLS'
      : extension
      ? (extension.toUpperCase() as Subtitle['format'])
      : /text\/vtt/i.test(text(data.mime))
      ? 'VTT'
      : /mpegurl/i.test(text(data.mime))
      ? 'HLS'
      : 'Unknown';
  const language = text(data.language, 35) || undefined;
  return {
    url,
    format,
    label: text(data.label, 80) || language || 'Subtitle',
    language,
    group: text(data.group, 80) || undefined,
  };
}
export function mergeTracks(left: Subtitle[], right: Subtitle[]): Subtitle[] {
  const tracks = new Map(left.map(track => [track.url, track]));
  for (const track of right) {
    const old = tracks.get(track.url);
    tracks.set(
      track.url,
      old
        ? {
            ...old,
            ...track,
            label: track.label === 'Subtitle' ? old.label : track.label,
            language: track.language || old.language,
            format: track.format === 'Unknown' ? old.format : track.format,
          }
        : track,
    );
  }
  return [...tracks.values()].slice(0, 60);
}
function mergeMedia(items: Media[], item: Media): Media[] {
  const index = items.findIndex(old => old.url === item.url);
  if (index < 0) return items.length < 150 ? [...items, item] : items;
  const old = items[index];
  const defined = Object.fromEntries(
    Object.entries(item).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const next = {
    ...old,
    ...defined,
    format: item.format === 'Unknown' ? old.format : item.format,
    subtitles: mergeTracks(old.subtitles, item.subtitles),
  } as Media;
  return items.map((entry, i) => (i === index ? next : entry));
}
export function decodeMessage(
  raw: string,
): { pageUrl: string; payload: Record<string, unknown> } | null {
  if (raw.length > 270000) return null;
  try {
    const envelope = record(JSON.parse(raw));
    const pageUrl = mediaUrl(envelope.pageUrl);
    if (envelope.channel !== 'webvc' || !pageUrl) return null;
    return { pageUrl, payload: record(envelope.payload) };
  } catch {
    return null;
  }
}
export function applyDiscovery(
  state: Discovery,
  payload: Record<string, unknown>,
  pageUrl: string,
): Discovery {
  const url = mediaUrl(payload.url);
  if (!url) return state;
  const frameUrl = mediaUrl(payload.frameUrl) || pageUrl;
  if (payload.type === 'player') {
    const old = state.players.find(player => player.url === url);
    const label = text(payload.label, 80) || new URL(url).hostname;
    if (old)
      return /^Player \d+$/i.test(label)
        ? {
            ...state,
            players: state.players.map(player =>
              player.url === url ? { url, label } : player,
            ),
          }
        : state;
    if (state.players.length >= 30) return state;
    return { ...state, players: [...state.players, { url, label }] };
  }
  if (payload.type === 'subtitle') {
    const track = subtitleOf(payload);
    if (!track) return state;
    const tracks = mergeTracks(state.tracks[frameUrl] || [], [track]);
    return {
      ...state,
      tracks: { ...state.tracks, [frameUrl]: tracks },
      media: state.media.map(item =>
        item.frameUrl === frameUrl
          ? { ...item, subtitles: mergeTracks(item.subtitles, tracks) }
          : item,
      ),
    };
  }
  if (
    !['media', 'manifest'].includes(String(payload.type)) ||
    state.excluded.includes(url)
  )
    return state;
  if (/^(video\/mp2t|audio\/)/i.test(text(payload.mime))) return state;
  const [format, mime] = formatOf(url, text(payload.mime, 100));
  const tracks = Array.isArray(payload.subtitles)
    ? payload.subtitles
        .slice(0, 60)
        .map(value => subtitleOf(value, url))
        .filter((value): value is Subtitle => !!value)
    : [];
  let item: Media = {
    url,
    frameUrl,
    title: text(payload.title) || new URL(pageUrl).hostname,
    format,
    mime,
    source: text(payload.source, 40) || 'network',
    width: positive(payload.width),
    height: positive(payload.height),
    duration: positive(payload.duration),
    subtitles: mergeTracks(state.tracks[frameUrl] || [], tracks),
  };
  let variants: Media[] = [];
  let excluded = state.excluded;
  if (
    payload.type === 'manifest' &&
    typeof payload.body === 'string' &&
    payload.body.length <= 200000
  ) {
    const parsed = parseHls(payload.body, item);
    item = parsed.media;
    variants = parsed.variants;
    excluded = [...new Set([...excluded, ...parsed.auxiliaryUrls])].slice(
      -6000,
    );
  }
  return {
    ...state,
    excluded,
    media: variants
      .reduce(mergeMedia, mergeMedia(state.media, item))
      .filter(entry => !excluded.includes(entry.url)),
  };
}
function attributes(line: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))
    values[match[1]] = match[2].replace(/^"|"$/g, '');
  return values;
}
export function parseHls(
  body: string,
  input: Media,
): { media: Media; variants: Media[]; auxiliaryUrls: string[] } {
  if (!body.trimStart().startsWith('#EXTM3U'))
    return { media: input, variants: [], auxiliaryUrls: [] };
  const lines = body.split(/\r?\n/).map(line => line.trim());
  const tracks: Subtitle[] = [];
  const auxiliaryUrls: string[] = [];
  const externalAudioGroups = new Set<string>();
  let duration = 0;
  let protectedMedia = false;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attr = attributes(line);
      if (['AUDIO', 'SUBTITLES'].includes(attr.TYPE)) {
        const auxiliary = mediaUrl(attr.URI, input.url);
        if (auxiliary) auxiliaryUrls.push(auxiliary);
      }
      if (attr.TYPE === 'AUDIO' && attr.URI)
        externalAudioGroups.add(attr['GROUP-ID']);
      if (attr.TYPE === 'SUBTITLES' && attr.URI) {
        const track = subtitleOf(
          {
            url: attr.URI,
            label: attr.NAME,
            language: attr.LANGUAGE,
            group: attr['GROUP-ID'],
          },
          input.url,
        );
        if (track) tracks.push(track);
      }
    }
    if (line.startsWith('#EXTINF:')) duration += parseFloat(line.slice(8)) || 0;
    if (/^#EXT-X-(SESSION-)?KEY:/.test(line)) {
      const attr = attributes(line);
      if (attr.KEYFORMAT && attr.KEYFORMAT !== 'identity')
        protectedMedia = true;
    }
  }
  const master = lines.some(line => line.startsWith('#EXT-X-STREAM-INF:'));
  if (!master) {
    for (const line of lines) {
      const value = line.startsWith('#EXT-X-MAP:')
        ? attributes(line).URI
        : line && !line.startsWith('#')
        ? line
        : null;
      const segment = mediaUrl(value, input.url);
      if (segment) auxiliaryUrls.push(segment);
    }
  }
  const media: Media = {
    ...input,
    format: 'HLS',
    mime: 'application/vnd.apple.mpegurl',
    label: master ? 'Auto quality' : input.label,
    protected: protectedMedia || input.protected,
    duration: duration || input.duration,
    live: !master && !lines.includes('#EXT-X-ENDLIST'),
    subtitles: mergeTracks(input.subtitles, tracks),
  };
  const variants: Media[] = [];
  lines.forEach((line, index) => {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) return;
    const attr = attributes(line);
    const next = lines
      .slice(index + 1)
      .find(value => value && !value.startsWith('#'));
    const url = mediaUrl(next, input.url);
    if (!url || variants.length >= 30) return;
    const [width, height] = (attr.RESOLUTION || '').split('x').map(Number);
    variants.push({
      ...media,
      url,
      label: height ? `${height}p` : attr.NAME || 'Quality variant',
      width: positive(width),
      height: positive(height),
      bitrate: positive(Number(attr['AVERAGE-BANDWIDTH'] || attr.BANDWIDTH)),
      codecs: attr.CODECS,
      live: undefined,
      requiresMaster: externalAudioGroups.has(attr.AUDIO),
      // These subtitle playlists remain available through the master stream.
      subtitles: media.subtitles.filter(
        track => !track.group || track.group === attr.SUBTITLES,
      ),
    });
  });
  return { media, variants, auxiliaryUrls };
}
export function describeMedia(item: Media): string {
  const parts = [item.format];
  parts.push(
    item.height
      ? `${item.width ? `${item.width} × ` : ''}${item.height}${
          item.width ? '' : 'p'
        }`
      : 'Resolution unknown',
  );
  if (item.bitrate) parts.push(`${(item.bitrate / 1000000).toFixed(1)} Mbps`);
  if (item.duration) {
    const minutes = Math.floor(item.duration / 60);
    parts.push(
      `${minutes}:${Math.floor(item.duration % 60)
        .toString()
        .padStart(2, '0')}`,
    );
  }
  if (item.live) parts.push('Live');
  return parts.join(' · ');
}

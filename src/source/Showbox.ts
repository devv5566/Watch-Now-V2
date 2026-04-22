import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { getTmdbNameAndYear } from '../utils';
import { Fetcher, getTmdbId, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class Showbox extends Source {
  public readonly id = 'showbox_v2';
  public readonly label = 'Showbox';
  public readonly contentTypes: ContentType[] = ['movie', 'series'];
  public readonly countryCodes: CountryCode[] = [CountryCode.multi];
  public readonly baseUrl = 'https://febapi.nuvioapp.space/api/media';
  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [titleName, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);

    let cookie = ctx.config.febboxCookie?.trim();
    if (!cookie) {
      console.log('[Showbox] No cookie configured');
      return [];
    }
    if (!cookie.startsWith('ui=')) {
      cookie = 'ui=' + cookie;
    }

    let apiUrl: string;
    const oss = 'USA7';
    if (tmdbId.season) {
      apiUrl = `${this.baseUrl}/tv/${tmdbId.id}/oss=${oss}/${tmdbId.season}/${tmdbId.episode}?cookie=${encodeURIComponent(cookie)}`;
    } else {
      apiUrl = `${this.baseUrl}/movie/${tmdbId.id}/oss=${oss}?cookie=${encodeURIComponent(cookie)}`;
    }

    try {
      console.log('[Showbox] Requesting:', apiUrl.replace(/cookie=.*/, 'cookie=***'));
      const apiData = await this.fetcher.json(ctx, new URL(apiUrl), {
        headers: { 'User-Agent': 'DevStreamzAddon/1.0' },
      });

      if (!apiData || !apiData.success || !apiData.versions || !Array.isArray(apiData.versions)) {
        console.log('[Showbox] No streams in response');
        return [];
      }

      const results: SourceResult[] = [];

      for (const version of apiData.versions) {
        const versionName = version.name || 'Unknown';
        if (version.links && Array.isArray(version.links)) {
          for (const link of version.links) {
            if (!link.url) continue;
            const streamTitle = this.formatShowboxTitle(titleName, year, versionName, link);
            const meta: Meta = {
              title: streamTitle,
              countryCodes: [CountryCode.multi],
            };
            results.push({
              url: new URL(link.url),
              meta,
            });
          }
        }
      }

      return results;
    } catch (error) {
      return [];
    }
  }

  private parseQualityFromLabel(label: string): string {
    if (!label) return 'ORG';
    const labelLower = String(label).toLowerCase();
    if (labelLower.includes('1080p') || labelLower.includes('1080')) return '1080p';
    if (labelLower.includes('720p') || labelLower.includes('720')) return '720p';
    if (labelLower.includes('480p') || labelLower.includes('480')) return '480p';
    if (labelLower.includes('360p') || labelLower.includes('360')) return '360p';
    if (labelLower.includes('2160p') || labelLower.includes('2160') || labelLower.includes('4k') || labelLower.includes('uhd')) return '4K';
    if (labelLower.includes('hd')) return '720p';
    if (labelLower.includes('sd')) return '480p';
    return 'ORG';
  }

  private formatShowboxTitle(name: string, year: number, versionName: string, link: any): string {
    const qualityEmoji = (() => {
      const q = this.parseQualityFromLabel(link.quality || link.name);
      if (q === '4K') return '🔥4K UHD';
      if (q === '1080p') return '💎1080p';
      if (q === '720p') return '🎞️720p';
      return '📽️' + q;
    })();

    const encoding = /blu[-]?ray/i.test(link.name) ? 'BluRay' : 'WEB';
    const streamType = /dv/i.test(link.name) ? 'DV' : '';
    const encodingLine = `🎥 ${encoding}${streamType ? ' 📺 ' + streamType : ''}`;

    const audioParts: string[] = [];
    if (/atmos/i.test(link.name)) audioParts.push('Atmos');
    if (/truehd/i.test(link.name)) audioParts.push('TrueHD');
    const channels = /7\.1/i.test(link.name) ? '7.1' : '';
    const audioLine = `🎧 ${audioParts.join(' | ')}${channels ? ' 🔊 ' + channels : ''}`.trim();

    const bytes = link.size ?? 0;
    const sizeGb = bytes ? (bytes / (1024 ** 3)).toFixed(1) + ' GB' : '';
    const bitrate = link.bitrate ? (link.bitrate / 1000).toFixed(1) + ' Mbps' : '';
    const sizeLine = `📦 ${sizeGb}${bitrate ? ' / ' + bitrate : ''}`.trim();

    const langMap: Record<string, string> = { en: '🇬🇧', it: '🇮🇹', fr: '🇫🇷', de: '🇩🇪' };
    const langs = (link.language || '').split(/[ ,;]/).filter(Boolean);
    const flags = langs.map(l => langMap[l.toLowerCase()] || '').filter(Boolean).join(' / ');
    const langLine = flags ? `🗣️ ${flags}` : '';

    const sourceTags = ['🔍Torrentio', 'ℹ️ WatchFlix'].join(' ');

    return [
      qualityEmoji,
      `🎬 ${name} (${year})`,
      encodingLine,
      audioLine,
      sizeLine,
      langLine,
      sourceTags,
    ].filter(Boolean).join('\n');
  }
}

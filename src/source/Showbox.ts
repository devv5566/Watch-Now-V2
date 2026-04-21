import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, getTmdbId, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class Showbox extends Source {
  public readonly id = 'showbox';

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
    let cookie = ctx.config.febboxCookie?.trim();
    if (!cookie) {
      return [];
    }
    if (!cookie.startsWith('ui=')) {
      cookie = 'ui=' + cookie;
    }

    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    let apiUrl: string;
    const oss = 'USA7'; // default OSS

    if (tmdbId.season) {
      apiUrl = `${this.baseUrl}/tv/${tmdbId.id}/oss=${oss}/${tmdbId.season}/${tmdbId.episode}?cookie=${encodeURIComponent(cookie)}`;
    } else {
      apiUrl = `${this.baseUrl}/movie/${tmdbId.id}/oss=${oss}?cookie=${encodeURIComponent(cookie)}`;
    }

    try {
      const apiData = await this.fetcher.json(ctx, new URL(apiUrl), {
        headers: {
          'User-Agent': 'DevStreamzAddon/1.0',
        },
      });

      if (!apiData || !apiData.success || !apiData.versions || !Array.isArray(apiData.versions)) {
        return [];
      }

      const results: SourceResult[] = [];

      for (const version of apiData.versions) {
        const versionName = version.name || 'Unknown';
        
        if (version.links && Array.isArray(version.links)) {
          for (const link of version.links) {
            if (!link.url) continue;

            const streamName = link.name || 'Auto';
            const streamQuality = this.parseQualityFromLabel(link.quality || link.name);
            
            // Format title to include stream quality and version info
            let title = `[Showbox] ${streamQuality}`;
            if (streamName !== 'Auto') title += ` | ${streamName}`;
            title += ` | ${versionName}`;
            
            const meta: Meta = {
              title: title,
              countryCodes: [CountryCode.multi],
              // Can extract bytes and height if needed, but Title is enough for Stremio
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
}

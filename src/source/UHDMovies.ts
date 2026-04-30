import bytes from 'bytes';
import * as cheerio from 'cheerio';
import levenshtein from 'fast-levenshtein';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, findCountryCodes, getTmdbId, getTmdbNameAndYear, Id, TmdbId } from '../utils';
import { resolveRedirectUrl } from './hd-hub-helper';
import { Source, SourceResult } from './Source';

export class UHDMovies extends Source {
  public readonly id = 'uhdmovies';

  public readonly label = 'UHDMovies';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi, CountryCode.hi, CountryCode.ta, CountryCode.te];

  public readonly baseUrl = 'https://uhdmovies.pink';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    const pageUrl = await this.fetchPageUrl(ctx, tmdbId);
    if (!pageUrl) {
      return [];
    }

    const html = await this.fetcher.text(ctx, pageUrl);
    const $ = cheerio.load(html);

    const results: SourceResult[] = [];

    const downloadLinks = $('a[href*="cloud.unblockedgames.world"], a[href*="drive.seed"], a[href*="hubcloud"]')
      .map((_i, el) => {
        const $link = $(el);
        const url = new URL($link.attr('href') as string);
        const container = $link.closest('p, div, blockquote');
        const localHtml = container.html() || '';
        
        // Find resolution in current link text or parent/prev headers
        const linkText = $link.text().trim();
        const resMatch = (linkText + ' ' + localHtml).match(/\d{3,4}p|4k|uhd/i);
        const height = resMatch ? (resMatch[0].toLowerCase().includes('4k') ? 2160 : parseInt(resMatch[0])) : undefined;

        // Find size
        const sizeMatch = localHtml.match(/([\d.]+ ?[GM]B)/i);
        const bytesVal = sizeMatch ? bytes.parse(sizeMatch[1]) : undefined;

        // Find descriptive title
        const prevHeader = container.prevAll('h1, h2, h3, h4, p').filter((_i, p) => $(p).text().length > 10).first().text().trim();
        const title = [prevHeader, linkText].filter(t => t && t.length > 3).join(' - ') || name;

        return { url, meta: { ...meta, height, bytes: bytesVal as number, title } };
      })
      .get();

    for (const link of downloadLinks) {
      try {
        const resolvedUrl = await resolveRedirectUrl(ctx, this.fetcher, link.url);
        if (resolvedUrl) {
          results.push({ url: resolvedUrl, meta: link.meta });
        }
      } catch (e) {
        console.warn(`[UHDMovies] Error resolving link ${link.url}: ${e}`);
      }
    }

    return results;
  }

  private readonly fetchPageUrl = async (ctx: Context, tmdbId: TmdbId): Promise<URL | undefined> => {
    try {
      const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);

      const searchUrl = new URL(`/?s=${encodeURIComponent(name)}`, this.baseUrl);
      const html = await this.fetcher.text(ctx, searchUrl);

      const $ = cheerio.load(html);

      const candidates = $('article')
        .map((_i, el) => {
          const title = $(el).find('h1, .entry-title').text().trim();
          const href = $(el).find('a').attr('href');
          return { title, href };
        })
        .get();

      const scored = candidates
        .filter(c => c.href && c.title)
        .map(c => {
          const yearMatch = c.title.match(/\b(19|20)\d{2}\b/);
          const cardYear = yearMatch ? parseInt(yearMatch[0]) : 0;
          const yearScore = Math.abs(cardYear - year) <= 1 ? 0 : 10;
          
          let cleanTitle = c.title.replace(/Download/i, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
          // Remove qualities and other metadata
          const titleParts = cleanTitle.split(/2160p|1080p|720p|480p|4k|dual audio|hindi|english|esub/i);
          cleanTitle = (titleParts[0] || '').trim();
          
          const diff = levenshtein.get(cleanTitle.toLowerCase(), name.toLowerCase());
          
          return { ...c, score: diff + yearScore };
        })
        .sort((a, b) => a.score - b.score);

      const bestMatch = scored[0];
      if (bestMatch && bestMatch.score < 20) {
        return new URL(bestMatch.href as string);
      }

      return undefined;
    } catch (error) {
      console.warn(`Error in UHDMovies fetchPageUrl: ${error}`);
      return undefined;
    }
  };

}

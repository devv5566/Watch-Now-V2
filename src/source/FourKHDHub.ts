import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { BasicAcceptedElems, CheerioAPI } from 'cheerio';
import { AnyNode } from 'domhandler';
import levenshtein from 'fast-levenshtein';
import memoize from 'memoizee';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, findCountryCodes, getTmdbId, getTmdbNameAndYear, Id, TmdbId } from '../utils';
import { resolveRedirectUrl } from './hd-hub-helper';
import { Source, SourceResult } from './Source';

export class FourKHDHub extends Source {
  public readonly id = '4khdhub';

  public readonly label = '4KHDHub';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi, CountryCode.hi, CountryCode.ta, CountryCode.te];

  public readonly baseUrl = 'https://4khdhub.click';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();

    this.fetcher = fetcher;

    this.getBaseUrl = memoize(this.getBaseUrl, {
      maxAge: 3600000, // 1 hour
      normalizer: () => 'baseUrl',
    });
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    const pageUrl = await this.fetchPageUrl(ctx, tmdbId);
    if (!pageUrl) {
      return [];
    }

    const html = await this.fetcher.text(ctx, pageUrl);
    const $ = cheerio.load(html);

    // Unhide all content panels (they are hidden by default, JS expands them)
    $('[id^="content-file"]').removeClass('hidden');

    if (tmdbId.season) {
      return Promise.all(
        $(`.episode-item`)
          .filter((_i, el) => $('.episode-title', el).text().includes(`S${String(tmdbId.season).padStart(2, '0')}`))
          .map((_i, el) => ({
            countryCodes: [CountryCode.multi, ...findCountryCodes($(el).html() as string)],
            downloadItem: $('.episode-download-item', el)
              .filter((_i, el) => $(el).text().includes(`Episode-${String(tmdbId.episode).padStart(2, '0')}`))
              .get(0),
          })).filter((_i, { downloadItem }) => downloadItem !== undefined)
          .map(async (_id, { countryCodes, downloadItem }) => await this.extractSourceResults(ctx, $, downloadItem as BasicAcceptedElems<AnyNode>, countryCodes))
          .toArray(),
      );
    }

    return Promise.all(
      $(`.download-item`)
        .map(async (_i, el) => await this.extractSourceResults(ctx, $, el, [CountryCode.multi, ...findCountryCodes($(el).html() as string)]))
        .toArray(),
    );
  };

  private readonly fetchPageUrl = async (ctx: Context, tmdbId: TmdbId): Promise<URL | undefined> => {
    try {
      const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);

      const searchUrl = new URL(`/?s=${encodeURIComponent(name)}`, await this.getBaseUrl(ctx));
      const html = await this.fetcher.text(ctx, searchUrl);

      const $ = cheerio.load(html);

      const results = $(`.movie-card:has(.movie-card-format:contains("${tmdbId.season ? 'Series' : 'Movies'}"))`)
        .filter((_i, el) => {
          // Year is in .movie-card-year on new site (was .movie-card-meta on old site)
          const movieCardYear = parseInt($('.movie-card-year, .movie-card-meta', el).text());

          // Be more lenient with year matching (±2 years instead of ±1)
          return Math.abs(movieCardYear - year) <= 2;
        })
        .filter((_i, el) => {
          const movieCardTitle = $('.movie-card-title', el)
            .text()
            .replace(/\[.*?]/, '')
            .trim();

          // If we can't get a title, skip this result
          if (!movieCardTitle) {
            return false;
          }

          const diff = levenshtein.get(movieCardTitle, name, { useCollator: true });

          // Be more lenient with title matching
          return diff < 8
            || (movieCardTitle.toLowerCase().includes(name.toLowerCase()) && diff < 20);
        })
        .map(async (_i, el) => {
          const href = $(el).attr('href');
          if (!href) {
            return undefined;
          }
          try {
            return new URL(href, await this.getBaseUrl(ctx));
          } catch (e) {
            console.warn(`Invalid URL in 4KHDHub search result: ${href}`, ctx);
            return undefined;
          }
        })
        .get(0);

      // If we didn't find a good match with strict criteria, try first result of any format
      if (!results) {
        return $('a.movie-card')
          .map(async (_i, el) => {
            const href = $(el).attr('href');
            if (!href) {
              return undefined;
            }
            try {
              return new URL(href, await this.getBaseUrl(ctx));
            } catch (e) {
              console.warn(`Invalid URL in 4KHDHub search result (fallback): ${href}`, ctx);
              return undefined;
            }
          })
          .get(0);
      }

      return results;
    } catch (error) {
      console.warn(`Error in 4KHDHub fetchPageUrl: ${error}`, ctx);
      return undefined;
    }
  };

  private readonly extractSourceResults = async (ctx: Context, $: CheerioAPI, el: BasicAcceptedElems<AnyNode>, countryCodes: CountryCode[]): Promise<SourceResult> => {
    // The hidden content panel is in the sibling div with id="content-{data-file-id}"
    const fileId = $('.download-header', el).attr('data-file-id');
    const contentEl = fileId ? $(`#content-${fileId}`) : $(el);
    const targetEl = contentEl.length ? contentEl : $(el);

    const localHtml = ($(el).html() ?? '') + (targetEl.html() ?? '');

    const sizeMatch = localHtml.match(/([\d.]+ ?[GM]B)/);
    const heightMatch = localHtml.match(/\d{3,}p/) as string[] | null;

    const meta: Meta = {
      countryCodes: [...new Set([...countryCodes, ...findCountryCodes(localHtml)])],
      ...(heightMatch && heightMatch[0] && { height: parseInt(heightMatch[0]) }),
      title: $('.file-title, .episode-file-title', targetEl).text().trim()
        || $('.download-header .flex-1', el).clone().children('code').remove().end().text().trim(),
      ...(sizeMatch && { bytes: bytes.parse(sizeMatch[1] as string) as number }),
    };

    // Links can be HubCloud, HubDrive, or via redirect bridge (gadgetsweb.xyz etc.)
    const redirectUrlHubCloud = $('a', targetEl)
      .filter((_i, el) => $(el).text().toLowerCase().includes('hubcloud'))
      .map((_i, el) => new URL($(el).attr('href') as string))
      .get(0);

    if (redirectUrlHubCloud) {
      return { url: await resolveRedirectUrl(ctx, this.fetcher, redirectUrlHubCloud), meta };
    }

    const redirectUrlHubDrive = $('a', targetEl)
      .filter((_i, el) => $(el).text().toLowerCase().includes('hubdrive'))
      .map((_i, el) => new URL($(el).attr('href') as string))
      .get(0);

    if (redirectUrlHubDrive) {
      return { url: await resolveRedirectUrl(ctx, this.fetcher, redirectUrlHubDrive), meta };
    }

    // Fallback: take any external download link
    const anyLink = $('a[href]', targetEl)
      .filter((_i, el) => {
        const href = $(el).attr('href') ?? '';
        return href.startsWith('http') && !href.includes('4khdhub');
      })
      .map((_i, el) => new URL($(el).attr('href') as string))
      .get(0) as URL | undefined;

    if (!anyLink) {
      throw new Error('No download link found in 4KHDHub download item');
    }

    return { url: await resolveRedirectUrl(ctx, this.fetcher, anyLink), meta };
  };

  private readonly getBaseUrl = async (ctx: Context): Promise<URL> => {
    return await this.fetcher.getFinalRedirectUrl(ctx, new URL(this.baseUrl));
  };
}

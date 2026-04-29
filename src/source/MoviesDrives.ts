import * as cheerio from 'cheerio';
import levenshtein from 'fast-levenshtein';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, findCountryCodes, getTmdbNameAndYear, getTmdbId, Id } from '../utils';
import { Source, SourceResult } from './Source';

// ─────────────────────────────────────────────────────────────────────────────
// MoviesDrives source
//
// Flow:
//   1. Search new2.moviesdrives.my for the movie title (IMDB-based)
//   2. Scrape movie page → collect all `mdrive.lol/archives/…` "DOWNLOAD NOW" links
//   3. Fetch each mdrive.lol page → find GDFlix or HubCloud links
//   4. GDFlix (priority): fetch gdflix page → pick "Instant DL" direct link
//   5. HubCloud (fallback): use existing hubcloud.foo URL as stream hint
// ─────────────────────────────────────────────────────────────────────────────

/** Matches quality strings like 480p, 720p, 1080p, 2160p found in text */
const HEIGHT_RE = /\b(480|720|1080|2160)p\b/;

/** Matches file sizes like 500MB, 1.7GB, 25GB */
const SIZE_RE = /\b([\d.]+\s?[GM]B)\b/;

/** Hosts used on mdrive.lol pages that we care about */
const GDFLIX_HOST_RE = /gdflix\./i;
const HUBCLOUD_HOST_RE = /hubcloud\./i;

export class MoviesDrives extends Source {
  public readonly id = 'moviesdrives';

  public readonly label = 'MoviesDrives';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [
    CountryCode.multi,
    CountryCode.hi,
    CountryCode.ta,
    CountryCode.te,
  ];

  public readonly baseUrl = 'https://new2.moviesdrives.my';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  // ── Entry point ────────────────────────────────────────────────────────────

  public async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    // 1. Find the movie page URL on moviesdrives
    const pageUrl = await this.findMoviePage(ctx, tmdbId);
    if (!pageUrl) {
      return [];
    }

    // 2. Get all mdrive.lol "DOWNLOAD NOW" links from the movie page
    const mdriveLinks = await this.getMdriveLinks(ctx, pageUrl);
    if (mdriveLinks.length === 0) {
      return [];
    }

    // 3. Resolve each mdrive link → try GDFlix first, then HubCloud
    const results = await Promise.allSettled(
      mdriveLinks.map(({ url, label }) => this.resolveFromMdrive(ctx, url, label, pageUrl)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<SourceResult | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((r): r is SourceResult => r !== null);
  }

  // ── Step 1: Find the movie page ────────────────────────────────────────────

  private readonly findMoviePage = async (
    ctx: Context,
    tmdbId: any,
  ): Promise<URL | null> => {
    try {
      const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);
      
      // If it's a series, include the season in the query for better accuracy
      let query = name;
      if (tmdbId.season) {
        query += ` Season ${tmdbId.season}`;
      }

      // The search page uses JavaScript rendering, but we discovered a JSON API
      const searchUrl = new URL(`/searchapi.php?q=${encodeURIComponent(query)}&page=1`, this.baseUrl);
      const data = await this.fetcher.json(ctx, searchUrl, {
        headers: { Referer: this.baseUrl },
      }) as any;

      if (!data || !data.hits || data.hits.length === 0) {
        // Fallback search without season if needed
        if (tmdbId.season) {
          const fallbackUrl = new URL(`/searchapi.php?q=${encodeURIComponent(name)}&page=1`, this.baseUrl);
          const fallbackData = await this.fetcher.json(ctx, fallbackUrl, {
            headers: { Referer: this.baseUrl },
          }) as any;
          if (fallbackData && fallbackData.hits && fallbackData.hits.length > 0) {
            data.hits = fallbackData.hits;
          } else {
            return null;
          }
        } else {
          return null;
        }
      }

      // Map API results to candidates
      const candidates = data.hits.map((hit: any) => {
        const doc = hit.document;
        const text = doc.post_title;
        const yearMatch = text.match(/\((\d{4})\)/);
        const cardYear = yearMatch && yearMatch[1] ? parseInt(yearMatch[1]) : 0;
        return {
          url: new URL(doc.permalink, this.baseUrl),
          title: text,
          year: cardYear
        };
      });

      // Score candidates: year match + levenshtein on title
      const scored = candidates
        .filter((c: any) => {
          // For series, ensure the season is mentioned in the title if we have it
          if (tmdbId.season) {
            const seasonStr = `Season ${tmdbId.season}`;
            const sStr = `S${tmdbId.season}`;
            const sStrPad = `S${String(tmdbId.season).padStart(2, '0')}`;
            if (!c.title.includes(seasonStr) && !c.title.includes(sStr) && !c.title.includes(sStrPad)) {
              return false;
            }
          }
          return c.year === 0 || Math.abs(c.year - year) <= 2;
        })
        .map((c: any) => ({
          ...c,
          score: levenshtein.get(
            c.title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim().toLowerCase(),
            name.toLowerCase(),
            { useCollator: true },
          ),
        }))
        .sort((a: any, b: any) => a.score - b.score);

      if (scored[0]) {
        return scored[0].url;
      }

      return null;
    } catch (e: any) {
      console.warn(`[MoviesDrives] Error finding movie page: ${e.stack || e}`);
      return null;
    }
  };

  // ── Step 2: Get mdrive.lol links from the movie page ──────────────────────

  private readonly getMdriveLinks = async (
    ctx: Context,
    pageUrl: URL,
  ): Promise<Array<{ url: URL; label: string }>> => {
    try {
      const html = await this.fetcher.text(ctx, pageUrl);
      const $ = cheerio.load(html);

      const links: Array<{ url: URL; label: string }> = [];

      // Each quality has a heading like "Title 1080p [4.3GB]" then "DOWNLOAD NOW" anchor
      // Pattern: <h5>QUALITY LABEL</h5> <h5><a href="https://mdrive.lol/archives/ID">DOWNLOAD NOW</a></h5>
      $('a[href*="mdrive.lol/archives"]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        // Get the quality label from the previous sibling heading
        const prevHeading = $(el).closest('h5, h4, h3, p').prev('h5, h4, h3, p').text().trim()
          || $(el).closest('h5, h4, h3').prev().text().trim()
          || '';

        try {
          links.push({ url: new URL(href), label: prevHeading });
        } catch (_) { /* ignore */ }
      });

      return links;
    } catch (e) {
      console.warn(`[MoviesDrives] Error getting mdrive links: ${e}`);
      return [];
    }
  };

  // ── Step 3: Resolve a single mdrive.lol link ──────────────────────────────

  private readonly resolveFromMdrive = async (
    ctx: Context,
    mdriveUrl: URL,
    label: string,
    referer: URL,
  ): Promise<SourceResult | null> => {
    try {
      const html = await this.fetcher.text(ctx, mdriveUrl, {
        headers: { Referer: referer.href },
      });

      const $ = cheerio.load(html);

      // Extract quality/size info from the page title or heading
      const pageTitle = $('h1, h2, .entry-title').first().text().trim() || label;
      const heightMatch = pageTitle.match(HEIGHT_RE);
      const sizeMatch = pageTitle.match(SIZE_RE);
      const countryCodes = [CountryCode.multi, ...findCountryCodes(pageTitle)];

      const meta: Meta = {
        title: pageTitle,
        countryCodes,
        ...(heightMatch && heightMatch[1] && { height: parseInt(heightMatch[1]) }),
        ...(sizeMatch && sizeMatch[1] && { bytes: this.parseSize(sizeMatch[1]) }),
      };

      // Collect GDFlix links (priority) and HubCloud links (fallback)
      const gdflixLinks: URL[] = [];
      const hubcloudLinks: URL[] = [];

      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        if (!href.startsWith('http')) return;

        try {
          const url = new URL(href);
          if (GDFLIX_HOST_RE.test(url.hostname)) {
            gdflixLinks.push(url);
          } else if (HUBCLOUD_HOST_RE.test(url.hostname)) {
            hubcloudLinks.push(url);
          }
        } catch (_) { /* ignore */ }
      });

      // ── GDFlix path (priority) ─────────────────────────────────────────────
      for (const gdflixUrl of gdflixLinks) {
        const result = await this.resolveGdflix(ctx, gdflixUrl, mdriveUrl, meta);
        if (result) return result;
      }

      // ── HubCloud fallback ─────────────────────────────────────────────────
      for (const hubcloudUrl of hubcloudLinks) {
        const result = await this.resolveHubcloud(ctx, hubcloudUrl, mdriveUrl, meta);
        if (result) return result;
      }

      return null;
    } catch (e) {
      console.warn(`[MoviesDrives] Error resolving mdrive page ${mdriveUrl}: ${e}`);
      return null;
    }
  };

  // ── Step 4a: GDFlix resolver ──────────────────────────────────────────────

  private readonly resolveGdflix = async (
    ctx: Context,
    gdflixUrl: URL,
    referer: URL,
    meta: Meta,
  ): Promise<SourceResult | null> => {
    try {
      const html = await this.fetcher.text(ctx, gdflixUrl, {
        headers: { Referer: referer.href },
      });

      const $ = cheerio.load(html);

      // Update meta from GDFlix file info if not already set
      if (!meta.title) {
        const fileName = $('li:contains("Name")').text().replace('Name :', '').trim()
          || $('p:contains("Name")').text().replace('Name :', '').trim();
        if (fileName) meta = { ...meta, title: fileName };
      }

      if (!meta.bytes) {
        const sizeText = $('li:contains("Size")').text().replace('Size :', '').trim()
          || $('p:contains("Size")').text().replace('Size :', '').trim();
        const sizeM = sizeText.match(SIZE_RE);
        if (sizeM && sizeM[1]) meta = { ...meta, bytes: this.parseSize(sizeM[1]) };
      }

      // Priority 1: "Instant DL" - this is a direct HTTP stream URL (busycdn.xyz)
      const instantLink = $('a[href*="busycdn"], a[href*="instant."], a')
        .filter((_i, el) => {
          const text = $(el).text().toLowerCase();
          const href = $(el).attr('href') ?? '';
          return (text.includes('instant') && href.startsWith('http')) ||
                 href.includes('busycdn');
        })
        .map((_i, el) => $(el).attr('href'))
        .toArray()
        .filter((h): h is string => !!h)[0];

      if (instantLink) {
        try {
          return { url: new URL(instantLink), meta };
        } catch (_) { /* continue */ }
      }

      // Priority 2: Telegram file link (filesgram.xyz) - returns a Telegram stream URL
      // Note: filesgram.xyz URLs can be used as direct stream links by some clients
      const telegramFileLink = $('a[href*="filesgram"], a[href*="t.me/"]')
        .filter((_i, el) => {
          const text = $(el).text().toLowerCase();
          const href = $(el).attr('href') ?? '';
          return (text.includes('telegram') || href.includes('filesgram')) && !href.includes('t.me/+');
        })
        .map((_i, el) => $(el).attr('href'))
        .toArray()
        .filter((h): h is string => !!h)[0];

      if (telegramFileLink) {
        try {
          // filesgram.xyz links can be streamed directly
          return { url: new URL(telegramFileLink), meta };
        } catch (_) { /* continue */ }
      }

      // Priority 3: FAST CLOUD / ZIPDISK (gdflix.net/zfile)
      const zfileLink = $('a[href*="/zfile/"]')
        .map((_i, el) => $(el).attr('href'))
        .toArray()
        .filter((h): h is string => !!h)[0];

      if (zfileLink) {
        try {
          const zfileUrl = new URL(zfileLink, gdflixUrl);
          const zfileHtml = await this.fetcher.text(ctx, zfileUrl, {
            headers: { Referer: gdflixUrl.href },
          });
          const directLink = this.extractDirectLinkFromZfile(zfileHtml);
          if (directLink) return { url: new URL(directLink), meta };
        } catch (_) { /* continue */ }
      }

      // Priority 4: GoFile / Multiup mirrors
      const gofileLink = $('a[href*="gofile"], a[href*="multiup"]')
        .map((_i, el) => $(el).attr('href'))
        .toArray()
        .filter((h): h is string => !!h)[0];

      if (gofileLink) {
        try {
          return { url: new URL(gofileLink), meta };
        } catch (_) { /* continue */ }
      }

      return null;
    } catch (e) {
      console.warn(`[MoviesDrives] GDFlix resolve error for ${gdflixUrl}: ${e}`);
      return null;
    }
  };

  /** Extract a direct download link from a GDFlix zfile page */
  private readonly extractDirectLinkFromZfile = (html: string): string | null => {
    const $ = cheerio.load(html);
    // Look for direct download anchor
    const link = $('a[href*="http"]')
      .filter((_i, el) => {
        const href = $(el).attr('href') ?? '';
        const text = $(el).text().toLowerCase();
        return (text.includes('download') || text.includes('direct') || text.includes('server'))
          && !href.includes('gdflix');
      })
      .map((_i, el) => $(el).attr('href'))
      .toArray()
      .filter((h): h is string => !!h)[0];

    return link ?? null;
  };

  // ── Step 4b: HubCloud fallback resolver ───────────────────────────────────

  private readonly resolveHubcloud = async (
    ctx: Context,
    hubcloudUrl: URL,
    referer: URL,
    meta: Meta,
  ): Promise<SourceResult | null> => {
    try {
      // Fetch the HubCloud page to find the actual file server link
      const html = await this.fetcher.text(ctx, hubcloudUrl, {
        headers: { Referer: referer.href },
      });

      const $ = cheerio.load(html);

      // HubCloud shows multiple server options. Find any direct download server link.
      // Skip ad/redirect links - look for links containing "server", "fslv", "dl", or similar
      const serverLink = $('a[href]')
        .filter((_i, el) => {
          const href = $(el).attr('href') ?? '';
          const text = $(el).text().toLowerCase();
          // Skip known ad hosts and navigation links
          if (!href.startsWith('http')) return false;
          if (href.includes('hubcloud') || href.includes('cryptonewz')) return false;
          return text.includes('server') || text.includes('fslv') || text.includes('download')
            || text.includes('dl') || text.includes('direct');
        })
        .map((_i, el) => $(el).attr('href'))
        .toArray()
        .filter((h): h is string => !!h)[0];

      if (serverLink) {
        return { url: new URL(serverLink), meta };
      }

      // If no server link found, return the hubcloud URL itself as a hint
      // (Stremio may not be able to play it but it's better than nothing)
      return { url: hubcloudUrl, meta };
    } catch (e) {
      console.warn(`[MoviesDrives] HubCloud resolve error for ${hubcloudUrl}: ${e}`);
      return null;
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Parse size string like "1.7GB" or "500MB" into bytes */
  private parseSize(sizeStr: string): number {
    const s = sizeStr.replace(/\s/g, '').toUpperCase();
    const num = parseFloat(s);
    if (s.endsWith('GB')) return Math.round(num * 1024 * 1024 * 1024);
    if (s.endsWith('MB')) return Math.round(num * 1024 * 1024);
    return 0;
  }
}

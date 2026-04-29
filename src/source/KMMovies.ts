import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, getImdbId, Id, ImdbId } from '../utils';
import { Source, SourceResult } from './Source';

interface KMMoviesSearchResponse {
  data: {
    movies: Array<{
      imdb_id: string;
      title: string;
      year: number;
      url: string;
    }>;
  };
}



export class KMMovies extends Source {
  public readonly id = 'kmmovies';

  public readonly label = 'KMMovies';

  public readonly contentTypes: ContentType[] = ['movie'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi];

  public readonly baseUrl = 'https://kmmovies.mom';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const imdbId = await getImdbId(ctx, this.fetcher, id);

    // First, search for the movie by IMDb ID
    const movieUrl = await this.findMovieByImdbId(ctx, imdbId.id);
    if (!movieUrl) {
      return [];
    }

    // Then, fetch the movie page to get available qualities/links
    return await this.fetchMovieLinks(ctx, movieUrl, imdbId);
  }

  private async findMovieByImdbId(ctx: Context, imdbId: string): Promise<string | null> {
    try {
      // Try to search via a potential search endpoint
      const searchUrl = new URL(`/api/search?imdb=${encodeURIComponent(imdbId)}`, this.baseUrl);
      const searchResponse = (await this.fetcher.json(ctx, searchUrl, {
        headers: { Referer: this.baseUrl },
      })) as KMMoviesSearchResponse | undefined;

      if (searchResponse && searchResponse.data && searchResponse.data.movies && searchResponse.data.movies[0]) {
        // Return the first matching movie's URL
        return searchResponse.data.movies[0].url;
      }

      // Fallback: try to find via Google search or site-specific search
      // This is a simplified approach - in reality, you might need to scrape search results
      const googleSearchUrl = new URL(`https://www.google.com/search?q=${encodeURIComponent(imdbId)}+site:kmmovies.mom`);
      const googleResponse = await this.fetcher.text(ctx, googleSearchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      if (!googleResponse) {
        return null;
      }

      const $ = cheerio.load(googleResponse);
      const firstLink = $('a').first().attr('href');
      if (typeof firstLink === 'string' && firstLink.includes(this.baseUrl)) {
        // Extract the actual URL from Google's redirect
        const urlMatch = firstMatch(/url\?q=([^&]+)/, firstLink);
        if (urlMatch && urlMatch[1]) {
          return decodeURIComponent(urlMatch[1]);
        }
      }

      return null;
    } catch (error) {
      console.error('[KMMovies] Error searching for movie:', error);
      return null;
    }
  }

  private async fetchMovieLinks(ctx: Context, movieUrl: string, imdbId: ImdbId): Promise<SourceResult[]> {
    try {
      const moviePageUrl = new URL(movieUrl, this.baseUrl);
      const html = await this.fetcher.text(ctx, moviePageUrl);
      const $ = cheerio.load(html);

      const results: SourceResult[] = [];

      // Look for quality options - adjust selectors based on actual site structure
      $('[data-quality], .quality-option, .download-link, .watch-link').each((_, element) => {
        const qualityLabel = $(element).data('quality') || 
                           $(element).find('.quality').text() || 
                           $(element).text().trim();

        const url = $(element).attr('href') || $(element).data('url');
        if (!url) return;

        // Create meta information
        const meta: Meta = {
          title: `${imdbId.id} - ${qualityLabel}`,
          countryCodes: [CountryCode.multi],
          extractorId: this.id,
        };

        results.push({
          url: new URL(url, this.baseUrl),
          meta,
        });
      });

      // If no specific quality elements found, look for all links that might be skydrop
      if (results.length === 0) {
        $('a[href*="skydrop"], a[href*="watch"], a[href*="download"]').each((_, element) => {
          const href = $(element).attr('href');
          if (!href) return;

          const meta: Meta = {
            title: `${imdbId.id} - ${$(element).text().trim() || 'Skydrop Link'}`,
            countryCodes: [CountryCode.multi],
            extractorId: this.id,
          };

          results.push({
            url: new URL(href, this.baseUrl),
            meta,
          });
        });
      }

      return results;
    } catch (error) {
      console.error('[KMMovies] Error fetching movie links:', error);
      return [];
    }
  }
}

// Helper function for regex matching
function firstMatch(regexp: RegExp, str: string): RegExpMatchArray | null {
  const match = str.match(regexp);
  return match ? match : null;
}
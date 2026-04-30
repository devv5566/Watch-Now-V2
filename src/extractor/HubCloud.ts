import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { findCountryCodes, findHeight } from '../utils';
import { Extractor } from './Extractor';

export class HubCloud extends Extractor {
  public readonly id = 'hubcloud';

  public readonly label = 'HubCloud';

  public override readonly ttl: number = 43200000; // 12h

  public override readonly cacheVersion = 1;

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/hubcloud/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    const redirectHtml = await this.fetcher.text(ctx, url, { headers });
    const redirectUrlMatch = redirectHtml.match(/var url ?= ?'(.*?)'/) as string[];

    const linksHtml = await this.fetcher.text(ctx, new URL(redirectUrlMatch[1] as string), { headers: { Referer: url.href } });
    const $ = cheerio.load(linksHtml);

    const title = $('title').text().trim();
    const countryCodes = [...new Set([...meta.countryCodes ?? [], ...findCountryCodes(title)])];
    const height = meta.height ?? findHeight(title);

    return Promise.all([
      ...$('a')
        .filter((_i, el) => {
          const text = $(el).text();

          return text.includes('FSL') && !text.includes('FSLv2');
        })
        .map((_i, el) => {
          const url = new URL($(el).attr('href') as string);
          return {
            url,
            format: Format.mp4, // FSL serves video files as application/octet-stream; mp4 tells Stremio to treat it as video
            label: `${this.label} (FSL)`,
            meta: {
              ...meta,
              bytes: bytes.parse($('#size').text()) as number,
              extractorId: `${this.id}_fsl`,
              countryCodes,
              height,
              title,
            },
            requestHeaders: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': url.href,
            },
          };
        }).toArray(),
      ...$('a')
        .filter((_i, el) => {
          const text = $(el).text();

          return text.includes('FSLv2');
        })
        .map((_i, el) => {
          const streamUrl = new URL($(el).attr('href') as string);
          return {
            url: streamUrl,
            format: Format.mp4,
            label: `${this.label} (FSLv2)`,
            meta: {
              ...meta,
              bytes: bytes.parse($('#size').text()) as number,
              extractorId: `${this.id}_fslv2`,
              countryCodes,
              height,
              title,
            },
            requestHeaders: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': url.href,
            },
          };
        }).toArray(),
      ...$('a')
        .filter((_i, el) => $(el).text().includes('PixelServer'))
        .map((_i, el) => {
          const userUrl = new URL(($(el).attr('href') as string).replace('/api/file/', '/u/'));
          const streamUrl = new URL(userUrl.href.replace('/u/', '/api/file/'));
          streamUrl.searchParams.set('download', '');

          return {
            url: streamUrl,
            format: Format.unknown,
            label: `${this.label} (PixelServer)`,
            meta: {
              ...meta,
              bytes: bytes.parse($('#size').text()) as number,
              extractorId: `${this.id}_pixelserver`,
              countryCodes,
              height,
              title,
            },
            requestHeaders: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': userUrl.href,
            },
          };
        }).toArray(),
    ]);
  };
}

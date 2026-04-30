import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Extractor } from './Extractor';

export class HubCloudFinal extends Extractor {
  public readonly id = 'hubcloud_final';

  public readonly label = 'HubCloud Direct';

  public supports(_ctx: Context, url: URL): boolean {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return host.includes('hubcdn.fans') || 
           host.includes('r2.dev') || 
           ((host.includes('hubcloud') || host.includes('hubdrive')) && (path.includes('/api/file/') || path.includes('/download')));
  }

  protected async extractInternal(_ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    // console.info(`Extracting direct HubCloud link with player headers: ${url.href}`);
    return [
      {
        url,
        format: Format.mp4, // Most of these are direct video files
        label: meta.sourceLabel || 'HubCloud',
        meta: {
            ...meta,
            extractorId: this.id,
        },
        requestHeaders: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': meta.referer ?? url.href,
        },
      },
    ];
  }
}

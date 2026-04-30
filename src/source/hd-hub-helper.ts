import * as cheerio from 'cheerio';
import rot13Cipher from 'rot13-cipher';
import { Context } from '../types';
import { Fetcher } from '../utils';

const REDIRECT_HOSTS = ['gadgetsweb.xyz', 'v-cloud.link', 'vgdrive.pro', 'nexdrive.blog', 'hubcloud.club', 'hubcloud.org', 'hubcloud.foo', 'hubcloud.ink'];

export const resolveRedirectUrl = async (ctx: Context, fetcher: Fetcher, url: URL): Promise<URL> => {
  if (!REDIRECT_HOSTS.some(host => url.hostname.includes(host))) {
    return url;
  }

  const redirectHtml = await fetcher.text(ctx, url);
  
  // Pattern 1: JSON encoded in rot13 (standard for some redirectors)
  const redirectDataMatch = redirectHtml.match(/'o','(.*?)'/) as string[];
  if (redirectDataMatch && redirectDataMatch[1]) {
    try {
      const redirectData = JSON.parse(atob(rot13Cipher(atob(atob(redirectDataMatch[1]))))) as { o: string };
      return new URL(atob(redirectData['o']));
    } catch (e) {
      console.warn(`Failed to parse rot13 redirect data from ${url}: ${e}`);
    }
  }

  // Pattern 2: Landing page with a tokenized download link or form (HubCloud, UnblockedGames, etc.)
  if (url.hostname.includes('hubcloud') || url.hostname.includes('hubdrive') || url.hostname.includes('unblockedgames.world')) {
    // Check for direct tokenized URL pattern first
    const tokenMatch = redirectHtml.match(/var url = '(.*?)';/);
    if (tokenMatch && tokenMatch[1]) {
      const nextUrl = new URL(tokenMatch[1], url);
      const finalHtml = await fetcher.text(ctx, nextUrl, { headers: { Referer: url.href } });
      return extractFinalLink(ctx, finalHtml, nextUrl.href);
    }

    // Check for form submission pattern (common in UnblockedGames)
    if (redirectHtml.includes('id="landing"') && redirectHtml.includes('method="POST"')) {
      const $ = cheerio.load(redirectHtml);
      const form = $('form#landing');
      const action = form.attr('action') || url.href;
      const params = new URLSearchParams();
      form.find('input').each((_i, el) => {
        const name = $(el).attr('name');
        const value = $(el).attr('value');
        if (name && value) {
          params.append(name, value);
        }
      });

      const postHtml = await fetcher.textPost(ctx, new URL(action, url), params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': url.href,
        },
      });

      // After POST, it might be another landing page or the final page
      return await handleLandingPage(ctx, fetcher, postHtml, new URL(action, url));
    }

    // If it's already the final page with links
    return extractFinalLink(ctx, redirectHtml, url.href);
  }

  return url;
};

const handleLandingPage = async (ctx: Context, fetcher: Fetcher, html: string, currentUrl: URL): Promise<URL> => {
    // Check for direct tokenized URL pattern
    const tokenMatch = html.match(/var url = '(.*?)';/);
    if (tokenMatch && tokenMatch[1]) {
      const nextUrl = new URL(tokenMatch[1], currentUrl);
      const finalHtml = await fetcher.text(ctx, nextUrl, { headers: { Referer: currentUrl.href } });
      return extractFinalLink(ctx, finalHtml, nextUrl.href);
    }
    
    // Check if it's another form (recursive)
    if (html.includes('id="landing"') && html.includes('method="POST"')) {
        // ... (this could be simplified by making resolveRedirectUrl take optional html)
    }

    return extractFinalLink(ctx, html, currentUrl.href);
}

const extractFinalLink = (_ctx: Context, html: string, referer: string): URL => {
  // Extract the direct download link (R2 or direct server)
  const finalLinkMatch = html.match(/href="(https:\/\/pub-.*?\.r2\.dev\/.*?)"/) || 
                       html.match(/href="(https:\/\/pixel\.hubcdn\.fans\/.*?)"/);
  
  if (finalLinkMatch && finalLinkMatch[1]) {
    return new URL(finalLinkMatch[1]);
  }
  
  // Fallback: search for any "Direct Download" or similar button
  const directMatch = html.match(/href="(https?:\/\/.*?)"[^>]*>Direct Download/i);
  if (directMatch && directMatch[1]) {
    return new URL(directMatch[1]);
  }

  return new URL(referer);
};

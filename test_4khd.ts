import * as cheerio from 'cheerio';
import axios from 'axios';
import winston from 'winston';
import { Fetcher } from './src/utils';

async function debugMoviesDrives() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'warn' })] });
  const fetcher = new Fetcher(axios, logger);
  const ctx = { config: { hi: 'true', multi: 'true' }, ip: '127.0.0.1', useragent: 'test' } as any;

  const baseUrl = 'https://new2.moviesdrives.my';

  console.log('=== Step 1: Search page ===');
  const searchUrl = new URL(`/?s=Avengers+Endgame`, baseUrl);
  const searchHtml = await fetcher.text(ctx, searchUrl, { headers: { Referer: baseUrl } });
  const $s = cheerio.load(searchHtml);

  console.log('Page title:', $s('title').text());
  console.log('Total <a> tags:', $s('a').length);
  
  // Show all hrefs containing moviesdrives
  console.log('\nAll moviesdrives links:');
  $s('a[href]').each((_i, el) => {
    const href = $s(el).attr('href') ?? '';
    const text = $s(el).text().trim().substring(0, 60);
    if (href.includes('moviesdrives') && !href.includes('/category/') && !href.includes('/tag/') && !href.includes('/?s=') && href !== baseUrl + '/') {
      console.log(`  [LINK] "${text}" → ${href}`);
    }
  });

  // Show article/h2/h3 anchors
  console.log('\narticle/h2/h3/entry-title anchors:');
  $s('article a[href], h2 a[href], h3 a[href], .entry-title a[href]').each((_i, el) => {
    const href = $s(el).attr('href') ?? '';
    const text = $s(el).text().trim().substring(0, 60);
    console.log(`  "${text}" → ${href}`);
  });

  // Check raw HTML snippet
  console.log('\n=== Raw HTML body (2000 chars from "endgame") ===');
  const bodyHtml = $s('body').html() ?? '';
  const idx = bodyHtml.toLowerCase().indexOf('endgame');
  if (idx >= 0) {
    console.log(bodyHtml.substring(Math.max(0, idx - 200), idx + 1000));
  } else {
    console.log('  "endgame" NOT FOUND in body HTML!');
    // Show start of body
    console.log('\nFirst 2000 chars of body:');
    console.log(bodyHtml.substring(0, 2000));
  }

  console.log('\n=== Step 2: Direct movie page test ===');
  const movieUrl = new URL('/avengers-endgame-2019-dual-audio-hindi-english-480p-500mb-720p-1-7gb-1080p-4-3gb-2160p-4k/', baseUrl);
  const movieHtml = await fetcher.text(ctx, movieUrl);
  const $m = cheerio.load(movieHtml);

  const mdriveLinks = $m('a[href*="mdrive.lol/archives"]').map((_i, el) => ({
    href: $m(el).attr('href'),
    text: $m(el).text().trim(),
    prevText: $m(el).closest('h5,h4,h3,p').prev('h5,h4,h3,p').text().trim()
  })).toArray();

  console.log(`Found ${mdriveLinks.length} mdrive links on movie page:`);
  mdriveLinks.slice(0, 5).forEach(l => {
    console.log(`  label="${l.prevText}" → ${l.href}`);
  });

  if (mdriveLinks.length > 0) {
    console.log('\n=== Step 3: mdrive.lol page test ===');
    const mdriveUrl = new URL(mdriveLinks[0]!.href!);
    const mdriveHtml = await fetcher.text(ctx, mdriveUrl, { headers: { Referer: movieUrl.href } });
    const $d = cheerio.load(mdriveHtml);

    console.log('mdrive page title:', $d('h1, h2').first().text().trim());
    console.log('\nAll external links:');
    $d('a[href]').each((_i, el) => {
      const href = $d(el).attr('href') ?? '';
      if (href.startsWith('http') && !href.includes('mdrive.lol')) {
        console.log(`  "${$d(el).text().trim()}" → ${href}`);
      }
    });

    // Check for GDFlix
    const gdflixLink = $d('a[href]').filter((_i, el) => /gdflix/i.test($d(el).attr('href') ?? '')).first().attr('href');
    if (gdflixLink) {
      console.log('\n=== Step 4: GDFlix page test ===');
      const gdflixUrl = new URL(gdflixLink);
      const gdflixHtml = await fetcher.text(ctx, gdflixUrl, { headers: { Referer: mdriveUrl.href } });
      const $g = cheerio.load(gdflixHtml);
      console.log('GDFlix page title:', $g('title').text());
      console.log('\nAll links on GDFlix page:');
      $g('a[href]').each((_i, el) => {
        const href = $g(el).attr('href') ?? '';
        const text = $g(el).text().trim();
        if (href.startsWith('http') && text) {
          console.log(`  "${text}" → ${href.substring(0, 100)}`);
        }
      });
    }
  }
}

debugMoviesDrives().catch(console.error);

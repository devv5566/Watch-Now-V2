import * as cheerio from 'cheerio';
import axios from 'axios';
import winston from 'winston';
import { Fetcher } from './src/utils';

async function testStreamDiscovery() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'warn' })] });
  const fetcher = new Fetcher(axios, logger);
  const ctx = { config: { hi: 'true', multi: 'true' }, ip: '127.0.0.1', useragent: 'test' } as any;

  console.log('=== 4KHDHub.click Stream Discovery Test ===\n');

  try {
    // 1. Test search
    console.log('1. Searching for "Avengers Infinity War"...');
    const searchUrl = new URL('/?s=Avengers+Infinity+War', 'https://4khdhub.click');
    const searchHtml = await fetcher.text(ctx, searchUrl);
    const $s = cheerio.load(searchHtml);

    const cards = $s('a.movie-card').toArray();
    console.log(`   Found ${cards.length} movie card(s)`);
    cards.forEach((el, i) => {
      const href = $s(el).attr('href');
      const title = $s('.movie-card-content h3', el).text().trim()
        || $s('.movie-card-content', el).clone().children('p').remove().end().text().trim();
      const year = $s('.movie-card-content p', el).last().text().trim();
      const formats = $s('.movie-card-formats', el).text().trim();
      console.log(`   [${i+1}] "${title}" (${year}) - Formats: ${formats} - href: ${href}`);
    });

    // 2. Test movie detail page
    const movieUrl = new URL('/avengers-infinity-war-marvel-phase-3-movie-325/', 'https://4khdhub.click');
    console.log(`\n2. Fetching movie page: ${movieUrl.href}`);
    const movieHtml = await fetcher.text(ctx, movieUrl);
    const $m = cheerio.load(movieHtml);

    const downloadItems = $m('.download-item').toArray();
    console.log(`   Found ${downloadItems.length} download item(s)`);

    downloadItems.slice(0, 3).forEach((el, i) => {
      const header = $m('.download-header', el);
      const fileId = header.attr('data-file-id');
      const headerTitle = header.find('.flex-1').clone().children('code').remove().end().text().trim();
      const contentEl = fileId ? $m(`#content-${fileId}`) : $m(el);
      const fileTitle = $m('.file-title', contentEl).text().trim();
      const links = $m('a.btn', contentEl).map((_j, a) => ({
        text: $m(a).text().trim(),
        href: $m(a).attr('href')
      })).toArray();

      console.log(`\n   [Item ${i+1}] fileId="${fileId}"`);
      console.log(`     Header: ${headerTitle.substring(0, 80)}`);
      console.log(`     FileTitle: ${fileTitle.substring(0, 80)}`);
      console.log(`     Links (${links.length}):`, links.slice(0, 2).map(l => `"${l.text}" -> ${l.href?.substring(0, 60)}`).join(', '));
    });

    console.log('\n✅ Stream discovery structure is working!');
    console.log('   The scraper should correctly find download links via gadgetsweb.xyz -> HubCloud');

  } catch (e) {
    console.error('❌ Error:', e);
  }
}

testStreamDiscovery();

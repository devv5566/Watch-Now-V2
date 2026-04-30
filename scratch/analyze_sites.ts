import * as cheerio from 'cheerio';
import axios from 'axios';
import winston from 'winston';
import { Fetcher } from '../src/utils';

async function analyzeSites() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'warn' })] });
  const fetcher = new Fetcher(axios, logger);
  const ctx = { config: { hi: 'true', multi: 'true' }, ip: '127.0.0.1', useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } as any;

  console.log('=== Analyzing 4KHDHub Search ===');
  try {
    const searchUrl = 'https://4khdhub.click/?s=Deadpool';
    console.log(`Fetching ${searchUrl}...`);
    const searchHtml = await fetcher.text(ctx, new URL(searchUrl));
    const $s = cheerio.load(searchHtml);
    console.log('Title:', $s('title').text());
    console.log('Movie cards (a.movie-card):', $s('a.movie-card').length);
    if ($s('a.movie-card').length > 0) {
        const firstCard = $s('a.movie-card').first();
        console.log('First card title snippet:', firstCard.find('.movie-card-content').text().trim().substring(0, 100));
        console.log('First card formats:', firstCard.find('.movie-card-formats').text().trim());
    }
  } catch (e) {
    console.error('Error analyzing 4KHDHub search:', e);
  }

  console.log('\n=== Analyzing 4KHDHub Page ===');
  try {
    const url4khd = 'https://4khdhub.click/the-boys-series-605/';
    console.log(`Fetching ${url4khd}...`);
    const html4khd = await fetcher.text(ctx, new URL(url4khd));
    const $4khd = cheerio.load(html4khd);
    console.log('Title:', $4khd('title').text());
    
    if ($4khd('.episode-item').length > 0) {
        const firstEp = $4khd('.episode-item').first();
        console.log('First episode title:', firstEp.find('.episode-title').text());
        console.log('Download headers in first episode:', firstEp.find('.download-header').length);
        console.log('Episode download items:', firstEp.find('.episode-download-item').length);
        if (firstEp.find('.episode-download-item').length > 0) {
            const firstDown = firstEp.find('.episode-download-item').first();
            console.log('First episode download item HTML snippet:', firstDown.html()?.substring(0, 500));
            console.log('Links inside episode-links:');
            firstDown.find('.episode-links a').each((_i, el) => {
                console.log(`  [${$4khd(el).text().trim()}] -> ${$4khd(el).attr('href')}`);
            });
        }
        console.log('First episode HTML snippet:', firstEp.html()?.substring(0, 1000));
    }
    if ($4khd('.download-item').length > 0) {
        const firstDown = $4khd('.download-item').first();
        console.log('First download item HTML snippet:', firstDown.html()?.substring(0, 1000));
    }
  } catch (e) {
    console.error('Error analyzing 4KHDHub:', e);
  }

  console.log('\n=== Analyzing UHDMovies ===');
  try {
    const urlUhd = 'https://uhdmovies.pink/';
    console.log(`Fetching ${urlUhd}...`);
    const htmlUhd = await fetcher.text(ctx, new URL(urlUhd));
    const $uhd = cheerio.load(htmlUhd);
    console.log('Title:', $uhd('title').text());
    
    // Check search form
    console.log('Search form exists:', $uhd('form[role="search"]').length || $uhd('form').length);
    
    if ($uhd('article').length > 0) {
        const firstCardLink = $uhd('article').first().find('a').attr('href');
        if (firstCardLink) {
            console.log(`Fetching movie page: ${firstCardLink}...`);
            const movieHtml = await fetcher.text(ctx, new URL(firstCardLink));
            const $m = cheerio.load(movieHtml);
            console.log('Movie page title:', $m('title').text());
            
            const hrefs: string[] = [];
            $m('a').each((_i, el) => {
                const text = $m(el).text().toLowerCase();
                const href = $m(el).attr('href');
                if ((text.includes('download') || text.includes('link') || text.includes('button')) && href?.startsWith('http')) {
                    hrefs.push(href);
                }
            });

            if (hrefs.length > 0) {
                const bridgeUrl = hrefs[0];
                console.log(`\nFetching bridge link: ${bridgeUrl}...`);
                const bridgeHtml = await fetcher.text(ctx, new URL(bridgeUrl));
                const $b = cheerio.load(bridgeHtml);
                console.log('Bridge page title:', $b('title').text());
                console.log('Forms on bridge page:', $b('form').length);
                $b('form').each((_i, el) => {
                    console.log(`  Form action: ${$b(el).attr('action')}`);
                });
                console.log('Links on bridge page:');
                $b('a').each((_i, el) => {
                    const text = $b(el).text().trim().substring(0, 30);
                    const href = $b(el).attr('href');
                    if (href?.startsWith('http')) {
                        console.log(`  [${text}] -> ${href}`);
                    }
                });
            }

            // Look for specific selectors used in similar sites
            console.log('Buttons (.button, .btn):', $m('.button, .btn').length);
            console.log('GDrive/HubCloud links:', $m('a[href*="hubcloud"], a[href*="gdrive"]').length);
        }
    }
  } catch (e) {
    console.error('Error analyzing UHDMovies:', e);
  }
}

analyzeSites().catch(console.error);

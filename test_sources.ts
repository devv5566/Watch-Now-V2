import axios from 'axios';
import winston from 'winston';
import { Fetcher, ImdbId } from './src/utils';
import { FourKHDHub } from './src/source/FourKHDHub';
import { UHDMovies } from './src/source/UHDMovies';

async function testSources() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'info' })] });
  const fetcher = new Fetcher(axios, logger);
  const ctx = { config: { hi: 'true', multi: 'true' }, ip: '127.0.0.1', useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } as any;

  process.env['TMDB_ACCESS_TOKEN'] = 'mock';

  console.log('=== Testing 4KHDHub ===');
  const source4khd = new FourKHDHub(fetcher);
  try {
    // Avengers Endgame (Movie)
    const resultsMovie = await source4khd.handleInternal(ctx, 'movie', new ImdbId('tt4154796', undefined, undefined));
    console.log(`4KHDHub Movie Results: ${resultsMovie.length}`);
    resultsMovie.slice(0, 3).forEach(r => console.log(`  - ${r.meta.title} -> ${r.url.href}`));

    // The Boys (Series)
    const resultsSeries = await source4khd.handleInternal(ctx, 'series', new ImdbId('tt1190634', 4, 1));
    console.log(`4KHDHub Series Results: ${resultsSeries.length}`);
    resultsSeries.slice(0, 3).forEach(r => console.log(`  - ${r.meta.title} -> ${r.url.href}`));
  } catch (e) {
    console.error('4KHDHub Test Error:', e);
  }

  console.log('\n=== Testing UHDMovies ===');
  const sourceUhd = new UHDMovies(fetcher);
  try {
    // Deadpool & Wolverine (Movie)
    const resultsMovie = await sourceUhd.handleInternal(ctx, 'movie', new ImdbId('tt6263850', undefined, undefined));
    console.log(`UHDMovies Movie Results: ${resultsMovie.length}`);
    resultsMovie.slice(0, 3).forEach(r => console.log(`  - ${r.meta.title} -> ${r.url.href}`));
  } catch (e) {
    console.error('UHDMovies Test Error:', e);
  }
}

testSources().catch(console.error);

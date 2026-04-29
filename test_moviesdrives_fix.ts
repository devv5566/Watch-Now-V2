import axios from 'axios';
import winston from 'winston';
import { Fetcher } from './src/utils';
import { MoviesDrives } from './src/source/MoviesDrives';

async function verifyMoviesDrivesFix() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'warn' })] });
  
  // Mock axios to handle TMDB requests
  const mockedAxios = {
    request: async (config: any) => {
      const url = config.url;
      if (url.includes('api.themoviedb.org/3/find/tt4154756')) {
        return {
          status: 200,
          statusText: "OK",
          data: JSON.stringify({
            movie_results: [{ id: 299534 }],
            tv_results: []
          }),
          headers: {}
        };
      }
      if (url.includes('api.themoviedb.org/3/movie/299534')) {
        return {
          status: 200,
          statusText: "OK",
          data: JSON.stringify({
            title: "Avengers: Endgame",
            release_date: "2019-04-24",
            original_title: "Avengers: Endgame"
          }),
          headers: {}
        };
      }
      // Fallback to real axios for other requests (MoviesDrives API)
      return axios.request(config);
    }
  } as any;

  const fetcher = new Fetcher(mockedAxios, logger);
  const ctx = { config: { hi: 'true', multi: 'true' }, ip: '127.0.0.1', useragent: 'Mozilla/5.0' } as any;
  const source = new MoviesDrives(fetcher);

  // Use a unique ID to bypass cache
  const testId = `tt4154756_${Date.now()}`;
  console.log(`--- Testing Avengers: Endgame (bypass cache: ${testId}) ---`);
  
  try {
    const results = await source.handle(ctx, 'movie', testId as any);
    
    console.log(`Found ${results.length} results:`);
    results.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.meta.title} (${r.meta.height}p) → ${r.url.href.substring(0, 100)}...`);
    });

    if (results.length === 0) {
      console.log('❌ Still no results found!');
    } else {
      console.log('✅ Successfully found results!');
    }
  } catch (e: any) {
    console.error('Error during test:', e.stack || e);
  }
}

verifyMoviesDrivesFix().catch(console.error);

import { Fetcher } from './src/utils';
import { Showbox } from './src/source/Showbox';
import { TmdbId } from './src/utils/id';
import axios from 'axios';
import winston from 'winston';

async function test() {
  const fetcher = new Fetcher(axios, winston.createLogger());
  const showbox = new Showbox(fetcher);
  
  const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NTM3OTAyNDksIm5iZiI6MTc1Mzc5MDI0OSwiZXhwIjoxNzg0ODk0MjY5LCJkYXRhIjp7InVpZCI6OTEzNTA3LCJ0b2tlbiI6IjJlNGUxNzY1ZmYwZmM2NTNjZDY3YTk4Mjk1MWVjZWY0In19.XCQh06yZju_rDYI3crEEYufdgUHmiXxSONTcn6npe7A';
  
  const ctx = {
    config: { febboxCookie: token },
    ip: '127.0.0.1',
    useragent: 'test'
  } as any;

  try {
    const results = await showbox.handleInternal(ctx, 'movie', new TmdbId(533535));
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch(e) {
    console.error('Err:', e);
  }
}
test().catch(console.error);

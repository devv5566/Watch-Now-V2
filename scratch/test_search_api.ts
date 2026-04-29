import axios from 'axios';
import winston from 'winston';
import { Fetcher } from '../src/utils';

async function testSearchApi() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'warn' })] });
  const fetcher = new Fetcher(axios, logger);
  const ctx = { config: {}, ip: '127.0.0.1', useragent: 'Mozilla/5.0' } as any;

  const url = 'https://new2.moviesdrives.my/searchapi.php?q=Avengers+Endgame&page=1';
  const data = await fetcher.json(ctx, new URL(url));
  console.log(JSON.stringify(data, null, 2));
}

testSearchApi().catch(console.error);

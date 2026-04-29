import axios from 'axios';
import winston from 'winston';
import { Fetcher } from '../src/utils';

async function getRawSearchHtml() {
  const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'warn' })] });
  const fetcher = new Fetcher(axios, logger);
  const ctx = { config: {}, ip: '127.0.0.1', useragent: 'Mozilla/5.0' } as any;

  const url = 'https://new2.moviesdrives.my/search.html?q=Avengers+Endgame';
  const html = await fetcher.text(ctx, new URL(url));
  console.log(html);
}

getRawSearchHtml().catch(console.error);

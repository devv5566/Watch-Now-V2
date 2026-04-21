import { Fetcher, StreamResolver, contextFromRequestAndResponse } from './src/utils';
import { ExtractorRegistry } from './src/extractor/ExtractorRegistry';
import { Direct } from './src/extractor/Direct';
import axios from 'axios';
import winston from 'winston';

async function test() {
  const logger = winston.createLogger();
  const fetcher = new Fetcher(axios, logger);
  const extractors = new ExtractorRegistry(logger, [new Direct(fetcher)]);

  const ctx = {
    config: { showErrors: 'true' },
    ip: '127.0.0.1',
    useragent: 'test'
  } as any;

  const url = new URL("https://hls.shegu.net/11584490.m3u8?sign=xc8jwyKMohJb_qIKZkWSOg&t=1776777044&quality=4K&KEY7=febbox_video_quality_list_v4&KEY8=913507&GroupID=26&IP=3.71.111.203&platform=web");
  const meta = { title: "4K" };

  try {
    const extracted = await extractors.handle(ctx, url, meta, true);
    console.log('Extracted:', extracted);

  } catch(e) {
    console.error('Err:', e);
  }
}
test().catch(console.error);

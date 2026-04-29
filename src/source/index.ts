import { envGet, Fetcher } from '../utils';
import { FourKHDHub } from './FourKHDHub';
import { HDHub4u } from './HDHub4u';
import { KMMovies } from './KMMovies';
import { Showbox } from './Showbox';
import { Source } from './Source';

export * from './Source';

export const createSources = (fetcher: Fetcher): Source[] => {
  const disabledSources = envGet('DISABLED_SOURCES')?.split(',') ?? [];

  return [
    new FourKHDHub(fetcher),
    new HDHub4u(fetcher),
    new KMMovies(fetcher),
    new Showbox(fetcher),
  ].filter(source => !disabledSources.includes(source.id));
};

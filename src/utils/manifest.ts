import { Extractor } from '../extractor';
import { Source } from '../source';
import { Config, CountryCode, CustomManifest } from '../types';
import { envGetAppId, envGetAppName } from './env';
import { flagFromCountryCode, languageFromCountryCode } from './language';


const typedEntries = <T extends object>(obj: T): [keyof T, T[keyof T]][] => (Object.entries(obj) as [keyof T, T[keyof T]][]);

export const buildManifest = (sources: Source[], extractors: Extractor[], config: Config): CustomManifest => {
  const logoUrl = `${process.env['PROTOCOL'] || 'http'}://${process.env['HOST'] || 'localhost:51546'}/logo.png`;

  const manifest: CustomManifest = {
    id: envGetAppId(),
    version: '1.14.0',
    name: envGetAppName(),
    description: 'WatchNow — stream Movies & Series in 4K, 1080p and more. Powered by DevStreams.',
    resources: [
      'stream',
    ],
    types: [
      'movie',
      'series',
    ],
    catalogs: [],
    idPrefixes: ['tmdb:', 'tt'],
    logo: logoUrl,
    background: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&q=80',
    behaviorHints: {
      p2p: false,
      configurable: true,
      configurationRequired: false,
    },
    config: [],
    stremioAddonsConfig: {
      issuer: 'https://stremio-addons.net',
      signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..D3-Wl15vxnYltwx8G52rRg.16-0VzsSgTvnv0wampIR8YPZsFhH8-7IgpuqxcUfC2p7kIJtuk8xQzrzqQOLXANEpaH_w7a4JOEpNo8wv28Zo_nMGCLOXgWbyGM3sQ-tfq6DCK3JU0ol6YMC1UDX2z_c.IOLlZyTYx_swutjYSTES0Q',
    },
  };

  sources.sort((sourceA, sourceB) => sourceA.label.localeCompare(sourceB.label));

  const countryCodeSources: Partial<Record<CountryCode, Source[]>> = {};
  sources.forEach(source =>
    source.countryCodes
      .forEach(countryCode => countryCodeSources[countryCode] = [...(countryCodeSources[countryCode] ?? []), source]));

  const sortedLanguageSources = typedEntries(countryCodeSources)
    .sort(([countryCodeA], [countryCodeB]) => {
      if (countryCodeB === CountryCode.multi) {
        return 1;
      }

      return countryCodeA.localeCompare(countryCodeB);
    });

  const languages: string[] = [];
  for (const [countryCode, sources] of sortedLanguageSources) {
    const language = languageFromCountryCode(countryCode);
    languages.push(language);

    manifest.config.push({
      key: countryCode,
      type: 'checkbox',
      title: `${language} ${flagFromCountryCode(countryCode)} (${(sources as Source[]).map(source => source.label).sort().join(', ')})`,
      ...(countryCode in config && { default: 'checked' }),
    });
  }

  // No additional config — language checkboxes only

  manifest.description += `\n\nSupported languages: ${languages.filter(language => language !== 'Multi').join(', ')}`;
  manifest.description += `\n\nSupported sources: ${sources.map(source => source.label).join(', ')}`;
  manifest.description += `\n\nSupported extractors: ${extractors.map(extractor => extractor.label).join(', ')}`;

  return manifest;
};

'use strict';

const STEAM = 'https://store.steampowered.com';
const CDN = 'https://shared.cloudflare.steamstatic.com/store_item_assets/';
const WIKI = 'https://pt.wikipedia.org';
const TIMEOUT = 4500;
const legoPoster = 'https://m.media-amazon.com/images/M/MV5BNDhlYTFmOGMtY2YxZi00ODczLTg0NTQtZDJiMzBjZWQ4YzU2XkEyXkFqcGc%40._V1_.jpg';

function steamImage(url) {
  return /^https:\/\/(?:shared\.(?:fastly|cloudflare|akamai)|cdn\.(?:fastly|akamai|cloudflare))\.steamstatic\.com\//.test(url) ? url : '';
}

function featuredSteamArt(id) {
  if (id !== '2215200') return [];
  return [legoPoster, 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2215200/a07a9a6c0c9c1225f5b260b4f29fe40e6f099f6b/header.jpg'];
}

async function json(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT), redirect: 'error', headers: { 'User-Agent': 'PeraGames/0.3.0' }
  });
  if (!response.ok) throw new Error('O serviço respondeu com erro.');
  return response.json();
}

function steamAssets(item) {
  const assets = item?.assets;
  const url = filename => {
    const format = assets?.asset_url_format;
    if (typeof filename !== 'string' || typeof format !== 'string' ||
        !/^steam\/apps\/\d+\/\$\{FILENAME\}$/.test(format) ||
        !/^(?:[a-f0-9]+\/)?[a-z0-9_]+\.(?:jpg|png)$/i.test(filename)) return '';
    return CDN + format.replace('${FILENAME}', filename);
  };
  return { cover: url(assets?.library_capsule_2x || assets?.library_capsule), hero: url(assets?.library_hero) };
}

async function browseSteam(appIds) {
  if (!appIds.length) return [];
  const batches = [];
  for (let offset = 0; offset < appIds.length; offset += 40) batches.push(appIds.slice(offset, offset + 40));
  const responses = await Promise.all(batches.map(async batch => {
    const query = {
      ids: batch.map(appid => ({ appid: Number(appid) })),
      context: { language: 'brazilian', country_code: 'BR', steam_realm: 1 },
      data_request: { include_assets: true, include_basic_info: true }
    };
    const params = new URLSearchParams({ input_json: JSON.stringify(query) });
    const result = await json('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?' + params).catch(() => null);
    return result?.response?.store_items || [];
  }));
  return responses.flat().filter(item => item?.success === 1 && /^\d+$/.test(String(item.appid)));
}

function cleanTitle(name) {
  return name.replace(/(?:\s*[([](?:USA|Europe|Japan|World|Brazil|Rev\s+\w+|[A-Z]{2}(?:,[A-Z]{2})+)[)\]])+$/gi, '')
    .replace(/[_]+/g, ' ').trim();
}

function titleKey(name) {
  return cleanTitle(name).replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function plainText(text = '') {
  const entities = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" };
  return String(text ?? '').replace(/<[^>]*>/g, '').replace(/&(#39|nbsp|amp|quot|apos|lt|gt);/g, (_, key) => entities[key]).trim();
}

async function wikiInfo(name) {
  const query = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: '"' + name.replaceAll('"', '') + '" jogo eletrônico',
    gsrlimit: '6', prop: 'extracts|pageimages', exintro: '1', explaintext: '1', exsentences: '4',
    pithumbsize: '650', pilicense: 'any', format: 'json', formatversion: '2'
  });
  const result = await json(WIKI + '/w/api.php?' + query);
  const key = titleKey(name);
  const item = result?.query?.pages?.find(page => titleKey(page.title.replace(/\s*\(.*?\)$/, '')) === key &&
    typeof page.extract === 'string' && /jogo|videogame/i.test(page.extract.slice(0, 350)));
  if (!item) return null;
  const cover = /^https:\/\/upload\.wikimedia\.org\//.test(item.thumbnail?.source) ? item.thumbnail.source : '';
  return { description: item.extract.slice(0, 1200), cover, source: 'Wikipédia', url: WIKI + '/?curid=' + item.pageid };
}

async function lookupGame(game, cachedItem) {
  const name = cleanTitle(game.name);
  let id = game.appId;
  let serviceError;
  if (!id) {
    const query = new URLSearchParams({ term: name, l: 'brazilian', cc: 'BR' });
    const found = await json(STEAM + '/api/storesearch/?' + query).catch(error => { serviceError = error; });
    const match = found?.items?.find(item => titleKey(item.name) === titleKey(name) && /^\d+$/.test(String(item.id)));
    if (match) id = String(match.id);
  }
  if (id) {
    const query = new URLSearchParams({ appids: id, l: 'brazilian', cc: 'BR' });
    const [result, assetsResult] = await Promise.all([
      json(STEAM + '/api/appdetails?' + query).catch(error => { serviceError = error; }),
      cachedItem ? Promise.resolve([cachedItem]) : browseSteam([id])
    ]);
    const steam = result?.[id]?.data;
    const item = assetsResult[0];
    const assets = steamAssets(item);
    if (steam && ['game', 'demo', 'mod'].includes(steam.type)) {
      return {
        description: plainText(steam.short_description).slice(0, 1200),
        genres: steam.genres?.map(genre => genre.description).filter(Boolean).join(', ') || '',
        date: steam.release_date?.date || '',
        developer: steam.developers?.join(', ') || '',
        cover: assets.cover || '',
        coverFallback: steamImage(steam.header_image),
        hero: assets.hero || steamImage(steam.screenshots?.[0]?.path_full) || steamImage(steam.background_raw),
        source: 'Steam', url: STEAM + '/app/' + id + '/'
      };
    }
    if (!steam && item && [0, 1, 2].includes(item.app_type ?? 0) && (assets.cover || item.basic_info?.short_description)) {
      return { ...assets, description: plainText(item.basic_info?.short_description).slice(0, 1200),
        source: 'Steam', url: STEAM + '/app/' + id + '/' };
    }
  }
  if (!game.appId) {
    const wikipedia = await wikiInfo(name).catch(error => { serviceError = error; });
    if (wikipedia) return wikipedia;
  }
  if (serviceError) throw new Error('Não foi possível consultar os serviços de jogos agora.');
  return null;
}

module.exports = { browseSteam, steamAssets, lookupGame, cleanTitle, titleKey, featuredSteamArt };

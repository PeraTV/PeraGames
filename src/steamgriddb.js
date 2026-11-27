'use strict';

const { cleanTitle, titleKey } = require('./game-info');
const origin = 'https://www.steamgriddb.com';
const preferencesUrl = origin + '/profile/preferences/api';
const numericId = value => /^\d{1,10}$/.test(String(value ?? ''));

async function request(endpoint, key) {
  const response = await fetch(origin + '/api/v2/' + endpoint, {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5000)
  }).catch(() => { throw new Error('Não foi possível consultar o SteamGridDB.'); });
  if (response.status === 401 || response.status === 403) throw new Error('A chave do SteamGridDB não foi aceita.');
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Não foi possível consultar o SteamGridDB.');
  const result = await response.json().catch(() => null);
  if (result?.success !== true || !Array.isArray(result.data)) throw new Error('Não foi possível consultar o SteamGridDB.');
  return result.data;
}

const gridImage = /^https:\/\/cdn\.steamgriddb\.com\/grid\/[a-z0-9_-]+\.(?:png|webp|jpe?g)$/i;
const gridThumbnail = /^https:\/\/cdn\.steamgriddb\.com\/thumb\/[a-z0-9_-]+\.(?:png|webp|jpe?g)$/i;
const onlineCovers = [gridImage,
  /^https:\/\/(?:shared|cdn)\.(?:fastly|cloudflare|akamai)\.steamstatic\.com\/(?:store_item_assets\/)?steam\/apps\/\d{1,10}\/(?:[a-f0-9]{40}\/)?library_600x900(?:_2x)?\.jpg(?:\?t=\d+)?$/i,
  /^https:\/\/upload\.wikimedia\.org\/wikipedia\/[^?#]+\.(?:png|jpe?g|webp)$/i,
  /^https:\/\/art\.gametdb\.com\/wii\/(?:coverHQ|cover)\/[A-Z]{2}\/[A-Z0-9]{6}\.png$/,
  /^https:\/\/thumbnails\.libretro\.com\/[^/?#]+\/Named_Boxarts\/[^/?#]+\.png$/i
];
const isCoverUrl = url => typeof url === 'string' && onlineCovers.some(pattern => pattern.test(url));

async function gridOptions(path, key) {
  const artwork = await request(path + '?types=static&nsfw=false&humor=false', key);
  return artwork.filter(item => item && item.width > 0 && item.height > item.width && !item.nsfw && !item.humor &&
    typeof item.url === 'string' && gridImage.test(item.url))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 24).map(({ url, thumb, width, height }) => ({
      url, thumb: typeof thumb === 'string' && gridThumbnail.test(thumb) ? thumb : url, width, height
    }));
}

async function grids(path, key) {
  return (await gridOptions(path, key))[0]?.url;
}

async function searchCoverGames(name, key) {
  const title = cleanTitle(name.replace(/\.exe$/i, ''));
  if (!titleKey(title)) return [];
  const matches = await request('search/autocomplete/' + encodeURIComponent(title), key);
  return matches.filter(item => typeof item?.name === 'string' && numericId(item.id))
    .slice(0, 10).map(({ id, name, release_date }) => ({
      id: String(id), name: name.slice(0, 200),
      year: Number.isFinite(release_date) ? new Date(release_date * 1000).getUTCFullYear() : undefined
    }));
}

async function coverChoices({ appId, gridId }, key) {
  if (numericId(gridId) && key) return gridOptions('grids/game/' + gridId, key);
  if (!numericId(appId)) return [];
  const covers = key ? await gridOptions('grids/steam/' + appId, key) : [];
  const url = 'https://cdn.akamai.steamstatic.com/steam/apps/' + appId + '/library_600x900.jpg';
  return [...covers, { url, thumb: url }];
}

async function findGridCover({ appId, name }, key) {
  if (numericId(appId)) {
    const image = await grids('grids/steam/' + appId, key);
    if (image) return image;
  }
  const title = cleanTitle(name.replace(/\.exe$/i, ''));
  if (!titleKey(title)) return;
  const spaced = title.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  for (const query of new Set([title, spaced])) {
    const matches = await request('search/autocomplete/' + encodeURIComponent(query), key);
    const ids = new Set(matches.filter(item => typeof item?.name === 'string' &&
      titleKey(item.name) === titleKey(query) && numericId(item.id)).map(item => String(item.id)));
    if (ids.size > 1) return;
    if (ids.size === 1) return grids('grids/game/' + ids.values().next().value, key);
  }
}

const verifyGridKey = key => request('grids/steam/477160', key);

module.exports = { preferencesUrl, findGridCover, verifyGridKey, searchCoverGames, coverChoices, isCoverUrl };

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

async function grids(path, key) {
  const artwork = await request(path + '?types=static&nsfw=false&humor=false', key);
  return artwork.filter(item => item && item.width > 0 && item.height > item.width && !item.nsfw && !item.humor &&
    typeof item.url === 'string' && /^https:\/\/cdn\.steamgriddb\.com\/grid\/[a-z0-9_-]+\.(?:png|webp|jpe?g)$/i.test(item.url))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))[0]?.url;
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

module.exports = { preferencesUrl, findGridCover, verifyGridKey };

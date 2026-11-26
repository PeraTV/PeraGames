'use strict';

const { cleanTitle, findSteamGameId } = require('./game-info');
const protonDB = 'https://www.protondb.com';
const tiers = new Set(['native', 'platinum', 'gold', 'silver', 'bronze', 'borked']);
const cache = new Map();
const pending = new Map();

const gameId = value => /^\d{1,10}$/.test(String(value ?? '')) ? String(value) : undefined;
const protonDBPage = id => gameId(id) ? protonDB + '/app/' + id : protonDB + '/explore';

async function getCompatibility({ appId, name, info }, language) {
  const savedId = /^https:\/\/store\.steampowered\.com\/app\/(\d{1,10})\/$/.exec(info?.url || '')?.[1];
  const title = cleanTitle(name.replace(/\.exe$/i, ''));
  let id = gameId(appId) || savedId;
  if (!id && title) {
    id = await findSteamGameId(title, language, true);
    const spaced = title.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    if (!id && title !== spaced) id = await findSteamGameId(spaced, language, true);
  }
  if (!id) return { status: 'unmatched' };
  const cached = cache.get(id);
  if (cached?.expires > Date.now()) return cached.result;
  if (pending.has(id)) return pending.get(id);

  const request = queryCompatibility(id, id === savedId ? info.steamLinux : undefined).then(result => {
    const ttl = result.status === 'rated' ? 30 : 5;
    cache.set(id, { expires: Date.now() + ttl * 60_000, result });
    if (cache.size > 250) cache.delete(cache.keys().next().value);
    return result;
  }).finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

function read(url) {
  return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5500) });
}

async function queryCompatibility(appId, knownNative) {
  const report = read(protonDB + '/api/v1/reports/summaries/' + appId + '.json').then(async response => {
    if (response.status === 404) return {};
    if (!response.ok) throw new Error('ProtonDB');
    return await response.json() || {};
  });
  const native = typeof knownNative === 'boolean' ? Promise.resolve(knownNative) :
    read('https://store.steampowered.com/api/appdetails?appids=' + appId).then(async response =>
      response.ok && (await response.json())?.[appId]?.data?.platforms?.linux === true);
  const [rated, platform] = await Promise.allSettled([report, native]);
  const summary = rated.value || {};
  const tier = platform.value === true ? 'native' : summary.tier;
  const total = Number.isSafeInteger(summary.total) && summary.total >= 0 ? summary.total : undefined;
  if (tiers.has(tier)) return { appId, status: 'rated', tier, total };
  return { appId, status: rated.status === 'rejected' ? 'unavailable' : 'unrated', total };
}

module.exports = { getCompatibility, protonDBPage };

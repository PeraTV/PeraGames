'use strict';

const endpoint = 'https://api.steampowered.com';
const steamId = /^7656\d{13}$/;
const keyFormat = /^[0-9a-f]{32}$/i;

function steamProfile(value) {
  const profile = typeof value === 'string' ? value.trim() : '';
  if (steamId.test(profile)) return { id: profile };
  let url;
  try { url = new URL(profile); } catch { return {}; }
  if (url.origin !== 'https://steamcommunity.com' || url.username || url.password) return {};
  const match = /^\/(profiles|id)\/([a-z0-9_-]{2,64})\/?$/i.exec(url.pathname);
  if (!match) return {};
  if (match[1].toLowerCase() === 'id') return { vanity: match[2] };
  return steamId.test(match[2]) ? { id: match[2] } : {};
}

async function steamRequest(method, key, parameters) {
  const url = new URL(method, endpoint);
  url.search = new URLSearchParams({ ...parameters, key });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (response.status === 401 || response.status === 403) throw new Error('key');
    if (!response.ok) throw new Error();
    return (await response.json())?.response;
  } catch (error) {
    throw new Error(error.message === 'key' ? 'Confira a chave da API da Steam.' : 'Não foi possível consultar a Steam. Tente novamente.');
  }
}

async function steamAccountGames(value, key) {
  const { id, vanity } = steamProfile(value);
  if (!id && !vanity) throw new Error('Informe o link do seu perfil Steam ou o SteamID64.');
  if (!keyFormat.test(key)) throw new Error('Confira a chave da API da Steam.');
  const profile = id || (await steamRequest('/ISteamUser/ResolveVanityURL/v1/', key, { vanityurl: vanity }))?.steamid;
  if (!steamId.test(profile)) throw new Error('Perfil Steam não encontrado.');
  const response = await steamRequest('/IPlayerService/GetOwnedGames/v1/', key, {
    steamid: profile, include_appinfo: 'true', include_played_free_games: 'true'
  });
  if (!Array.isArray(response?.games) && response?.game_count !== 0) {
    throw new Error('A Steam não mostrou os jogos. Confira a visibilidade dos detalhes de jogos no perfil.');
  }
  const games = new Map();
  for (const game of response.games || []) {
    const appId = String(game?.appid);
    const name = typeof game?.name === 'string' && game.name.trim();
    if (!/^[1-9]\d{0,9}$/.test(appId) || !name) continue;
    games.set(appId, { id: appId, appId, name: name.slice(0, 240),
      cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg` });
  }
  return { profile, games: [...games.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

module.exports = { steamAccountGames };

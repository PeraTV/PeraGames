'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { findLinuxCommand, runHostTool, launch, fileExists } = require('./system');

const providers = {
  epic: {
    tool: 'legendary', setup: 'https://github.com/legendary-gl/legendary#how-to-runinstall',
    login: 'https://legendary.gl/epiclogin'
  },
  gog: {
    tool: 'gogdl', setup: 'https://github.com/Heroic-Games-Launcher/heroic-gogdl#contributing',
    login: 'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2'
  }
};
const storeError = 'A loja não respondeu. Confira o login e tente novamente.';

function storeGameId(provider, id) {
  return typeof id === 'string' && (provider === 'gog' ? /^\d{1,20}$/ : /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/).test(id);
}

function loginCode(provider, input) {
  let value = typeof input === 'string' ? input.trim() : '';
  if (value.startsWith('{')) {
    try { value = JSON.parse(value).authorizationCode; } catch { value = ''; }
  } else if (provider === 'gog' && value.startsWith('https://')) {
    const url = new URL(value);
    value = url.origin === 'https://embed.gog.com' && url.pathname === '/on_login_success' ? url.searchParams.get('code') : '';
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.~-]{12,300}$/.test(value)) throw new Error('Código de login inválido.');
  return value;
}

async function storeConfig(provider, root) {
  if (process.platform !== 'linux' || !Object.hasOwn(providers, provider)) throw new Error('Loja indisponível neste sistema.');
  const config = providers[provider];
  const tool = await findLinuxCommand(config.tool, process.env);
  if (!tool) return { ...config, ready: false };
  const dir = path.join(root, 'stores', provider);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    ...config, tool, ready: true,
    baseArgs: provider === 'gog' ? ['--auth-config-path', path.join(dir, 'auth.json')] : [],
    environment: provider === 'gog' ? { GOGDL_CONFIG_PATH: dir } : { LEGENDARY_CONFIG_PATH: dir }
  };
}

async function command(config, args, json = true) {
  if (!config.ready) throw new Error('Instale o componente da loja para continuar.');
  try {
    const { stdout } = await runHostTool(config.tool, [...config.baseArgs, ...args], {
      environment: config.environment, timeout: 120000, maxBuffer: 24 * 1024 * 1024
    });
    return json ? JSON.parse(stdout) : undefined;
  } catch { throw new Error(storeError); }
}

async function gogCredentials(config, code) {
  const token = await command(config, code ? ['auth', '--code', code] : ['auth']);
  if (!token?.access_token || !/^\d+$/.test(String(token.user_id))) throw new Error(storeError);
  return token;
}

async function gogLibrary(config) {
  const token = await gogCredentials(config);
  const headers = { Authorization: 'Bearer ' + token.access_token };
  const products = new Map();
  let page;
  const seen = new Set();
  do {
    const url = new URL('https://galaxy-library.gog.com/users/' + token.user_id + '/releases');
    if (page) url.searchParams.set('page_token', page);
    const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(storeError);
    const result = await response.json();
    for (const item of result.items || []) {
      const id = String(item.external_id);
      if (item.platform_id === 'gog' && storeGameId('gog', id)) products.set(id, item.title || item.name);
    }
    page = result.next_page_token;
    if (seen.has(page)) throw new Error(storeError);
    if (page) seen.add(page);
  } while (page);
  const games = [];
  const entries = [...products];
  for (let offset = 0; offset < entries.length; offset += 12) {
    const batch = await Promise.all(entries.slice(offset, offset + 12).map(async ([id, name]) => {
      if (!name) {
        const info = await fetch('https://api.gog.com/products/' + id, { signal: AbortSignal.timeout(6000) })
          .then(result => result.ok ? result.json() : null).catch(() => null);
        name = info?.title;
      }
      return { id, name: typeof name === 'string' ? name : 'GOG ' + id };
    }));
    games.push(...batch);
  }
  return games;
}

async function library(provider, config) {
  if (provider === 'gog') return gogLibrary(config);
  const owned = await command(config, ['list', '--json']);
  const installed = await command(config, ['list-installed', '--json']);
  const installedIds = new Set(installed.map(game => game.app_name));
  return owned.filter(game => storeGameId(provider, game.app_name) && typeof game.app_title === 'string')
    .map(game => ({ id: game.app_name, name: game.app_title, installed: installedIds.has(game.app_name) }));
}

async function connect(provider, config, input) {
  const code = loginCode(provider, input);
  if (provider === 'gog') await gogCredentials(config, code);
  else await command(config, ['auth', '--code', code], false);
}

async function gogGameFolder(root, id) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const folders = [root, ...entries.filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name))];
  for (const folder of folders) {
    if (await fileExists(path.join(folder, 'goggame-' + id + '.info'))) return folder;
  }
}

async function install(provider, config, id, folder) {
  const args = provider === 'gog'
    ? ['download', id, '--platform', 'windows', '--path', folder, '--with-dlcs']
    : ['-y', 'install', id, ...(folder ? ['--base-path', folder] : []), '--skip-dlcs'];
  try {
    await launch(config.tool, [...config.baseArgs, ...args], { environment: config.environment, wait: true });
    if (provider === 'gog') {
      const installed = await gogGameFolder(folder, id);
      if (!installed) throw new Error('Missing game directory');
      return installed;
    }
  } catch { throw new Error('Não foi possível instalar ou atualizar o jogo pela loja.'); }
}

function play(provider, config, { id, folder, umu, environment }) {
  // Both tools parse the wrapper with shlex, so quote the executable as one argument.
  const wrapper = "'" + umu.replaceAll("'", "'\"'\"'") + "'";
  const args = provider === 'gog' ? ['launch', folder, id, '--platform', 'windows'] : ['launch', id];
  return launch(config.tool, [...config.baseArgs, ...args, '--no-wine', '--wrapper', wrapper], {
    environment: { ...config.environment, ...environment }
  });
}

module.exports = { storeConfig, storeGameId, loginCode, library, connect, install, play };

'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { findLinuxCommand, runHostTool, launch, fileExists } = require('./system');
const { readProgress } = require('./downloads');
const { findStoreTool } = require('./store-tools');

const providers = {
  epic: {
    tool: 'legendary', setup: 'https://github.com/legendary-gl/legendary#how-to-runinstall',
    login: 'https://legendary.gl/epiclogin'
  },
  gog: {
    tool: 'gogdl', setup: 'https://github.com/Heroic-Games-Launcher/heroic-gogdl#contributing',
    login: 'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2'
  },
  amazon: {
    tool: 'nile', setup: 'https://github.com/imLinguin/nile/releases'
  }
};
const storeError = 'A loja não respondeu. Confira o login e tente novamente.';
const amazonSessions = new Map();

function storeCover(value) {
  if (typeof value !== 'string') return undefined;
  const url = value.startsWith('//') ? 'https:' + value : value;
  return /^https:\/\/(?:m\.media-amazon\.com|[a-z0-9.-]+\.(?:epicgames\.com|unrealengine\.com|gog-statics\.com))\//i.test(url) ? url : undefined;
}

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
  } else if (provider === 'amazon' && /^https?:/i.test(value)) {
    const url = URL.canParse(value) ? new URL(value) : null;
    value = url && ['https://amazon.com', 'https://www.amazon.com'].includes(url.origin) && !url.username && !url.password
      ? url.searchParams.get('openid.oa2.authorization_code') : '';
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.~-]{12,300}$/.test(value)) {
    throw new Error(provider === 'amazon' ? 'Copie a URL inteira da última página após entrar na Amazon.' : 'Código de login inválido.');
  }
  return value;
}

async function storeConfig(provider, root, linked) {
  if (!Object.hasOwn(providers, provider)) throw new Error('Loja indisponível neste sistema.');
  const config = providers[provider];
  const commandName = config.tool;
  const custom = await fileExists(linked) && await fs.access(linked, constants.X_OK).then(() => true, () => false);
  const tool = custom ? linked : await findStoreTool(root, provider) ||
    await findLinuxCommand(commandName + (process.platform === 'win32' ? '.exe' : ''), process.env);
  if (!tool) return { ...config, commandName, ready: false };
  const dir = path.join(root, 'stores', provider);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    ...config, tool, dir, commandName, ready: true,
    installable: process.platform !== 'darwin' || provider !== 'amazon',
    baseArgs: provider === 'gog' ? ['--auth-config-path', path.join(dir, 'auth.json')] : [],
    environment: provider === 'gog' ? { GOGDL_CONFIG_PATH: dir } :
      provider === 'amazon' ? { NILE_CONFIG_PATH: dir } : { LEGENDARY_CONFIG_PATH: dir }
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

async function gogLibrary(config, cached = []) {
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
  const cachedById = new Map(cached.map(entry => [entry.id, entry]));
  const entries = [...products];
  for (let offset = 0; offset < entries.length; offset += 12) {
    const batch = await Promise.all(entries.slice(offset, offset + 12).map(async ([id, name]) => {
      const previous = cachedById.get(id);
      if (previous?.cover) return { id, name: previous.name, cover: previous.cover };
      const info = await fetch('https://api.gog.com/products/' + id, { signal: AbortSignal.timeout(6000) })
        .then(result => result.ok ? result.json() : null).catch(() => null);
      return {
        id, name: info?.title || (typeof name === 'string' ? name : 'GOG ' + id),
        cover: storeCover(info?.images?.boxArtImage || info?.images?.logo)
      };
    }));
    games.push(...batch);
  }
  return games;
}

async function library(provider, config, cached) {
  if (provider === 'gog') return gogLibrary(config, cached);
  if (provider === 'amazon') {
    await command(config, ['library', 'sync'], false);
    const owned = await command(config, ['library', 'list', '--json']);
    const installedFile = path.join(config.dir, 'nile', 'installed.json');
    const installed = await fs.readFile(installedFile, 'utf8').then(JSON.parse, error => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    });
    const folders = new Map(installed.map(item => [item.id, item.path]));
    return Promise.all(owned.filter(item => storeGameId(provider, item.product?.id) && typeof item.product.title === 'string')
      .map(async ({ product }) => {
        const folder = folders.get(product.id);
        const detail = product.productDetail;
        return { id: product.id, name: product.title, installed: Boolean(typeof folder === 'string' &&
          await fileExists(path.join(folder, 'fuel.json'))),
          cover: storeCover(detail?.details?.backgroundUrl2 || detail?.iconUrl) };
      }));
  }
  const owned = await command(config, ['list', '--json']);
  const installed = await command(config, ['list-installed', '--json']);
  const installedIds = new Set(installed.map(game => game.app_name));
  return owned.filter(game => storeGameId(provider, game.app_name) && typeof game.app_title === 'string').map(game => {
    const images = game.metadata?.keyImages;
    const cover = Array.isArray(images) && ['DieselGameBoxTall', 'OfferImageTall', 'DieselGameBox', 'Thumbnail']
      .map(type => images.find(image => image.type === type)?.url).map(storeCover).find(Boolean);
    return { id: game.app_name, name: game.app_title, installed: installedIds.has(game.app_name), cover: cover || undefined };
  });
}

async function connect(provider, config, input) {
  const code = loginCode(provider, input);
  if (provider === 'gog') await gogCredentials(config, code);
  else if (provider === 'amazon') {
    const session = amazonSessions.get(config.dir);
    if (!session || session.expires < Date.now()) {
      amazonSessions.delete(config.dir);
      throw new Error('Abra o login da Amazon novamente.');
    }
    await command(config, ['register', '--code', code, '--client-id', session.client_id,
      '--code-verifier', session.code_verifier, '--serial', session.serial], false);
    amazonSessions.delete(config.dir);
  }
  else await command(config, ['auth', '--code', code], false);
}

async function loginUrl(provider, config) {
  if (provider !== 'amazon') return config.login;
  const session = await command(config, ['auth', '--login', '--non-interactive']);
  const url = typeof session?.url === 'string' && URL.canParse(session.url) ? new URL(session.url) : null;
  if (!url || !['https://amazon.com', 'https://www.amazon.com'].includes(url.origin) || url.pathname !== '/ap/signin' ||
      !/^[a-f0-9]{32,160}$/i.test(session.client_id) || !/^[\w-]{32,128}$/.test(session.code_verifier) ||
      !/^[a-f0-9]{32}$/i.test(session.serial)) throw new Error(storeError);
  amazonSessions.set(config.dir, { ...session, expires: Date.now() + 600000 });
  return url.href;
}

async function gogGameFolder(root, id) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const folders = [root, ...entries.filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name))];
  for (const folder of folders) {
    const manifest = 'goggame-' + id + '.info';
    if (await fileExists(path.join(folder, manifest))) return folder;
    if (process.platform !== 'darwin') continue;
    const bundles = (await fs.readdir(folder).catch(() => [])).filter(name => name.endsWith('.app'));
    for (const bundle of bundles) {
      if (await fileExists(path.join(folder, bundle, 'Contents', 'Resources', manifest))) return folder;
    }
  }
}

async function install(provider, config, id, folder, progress) {
  const mac = process.platform === 'darwin';
  const args = provider === 'gog'
    ? ['download', id, '--platform', mac ? 'osx' : 'windows', '--path', folder, '--with-dlcs']
    : provider === 'amazon' ? ['install', id, ...(folder ? ['--base-path', folder] : [])]
      : ['-y', 'install', id, ...(folder ? ['--base-path', folder] : []), ...(mac ? ['--platform', 'Mac'] : []), '--skip-dlcs'];
  try {
    await launch(config.tool, [...config.baseArgs, ...args], {
      environment: config.environment, wait: true, onLine: line => progress(readProgress(line))
    });
    if (provider === 'gog') {
      const installed = await gogGameFolder(folder, id);
      if (!installed) throw new Error('Missing game directory');
      return installed;
    }
  } catch { throw new Error('Não foi possível instalar ou atualizar o jogo pela loja.'); }
}

const quoteWrapper = argument => "'" + argument.replaceAll("'", "'\"'\"'") + "'";
const runnerScript = 'printf "\\nPERAGAMES_RUNNER_START\\n" >&2; "$@"; result=$?; printf "\\nPERAGAMES_RUNNER_EXIT=%s\\n" "$result" >&2; exit "$result"';

function launchReason(line) {
  if (/game is out of date|update required/i.test(line)) return 'update';
  if (/login failed|failed to (?:log in|login)|not logged in|authentication failed/i.test(line)) return 'signin';
  if (/not currently installed|install directory.*deleted|cannot launch.*not installed|installation path doesn't exist|fuel\.json doesn't exist|executable not found/i.test(line)) return 'missing';
  if (/bwrap:|pressure-vessel.*(?:error|failed)|failed to.*(?:runtime|proton)|unprivileged user namespace/i.test(line)) return 'runtime';
}

function storeLaunchMonitor(onStatus, { direct = false, wrapped = false } = {}) {
  let reason;
  let reported = false;
  let started = direct ? Date.now() : 0;
  const early = () => Date.now() - started < 12000;
  const report = fallback => {
    if (reported) return;
    reported = true;
    onStatus(reason || fallback);
  };
  return {
    onLine(line) {
      if (line === 'PERAGAMES_RUNNER_START') {
        started = Date.now();
        onStatus('runner-start');
      } else if (wrapped && !started && /^Launch command:/.test(line) && !line.includes('PERAGAMES_RUNNER_START')) {
        started = Date.now();
      } else if (/^PERAGAMES_RUNNER_EXIT=\d+$/.test(line)) {
        if (reason || !line.endsWith('=0')) report('runner');
        else if (early()) report('early-exit');
      } else reason = launchReason(line) || reason;
    },
    onClose(code, signal) {
      if (reason || code || signal) report(direct || started ? 'runner' : 'store');
      else if (direct && early()) report('early-exit');
      else if (wrapped && !started) report('store');
    }
  };
}

async function playEpicOnLinux(config, id, runner, environment, onStatus) {
  let parameters;
  try {
    const { stdout } = await runHostTool(config.tool, [...config.baseArgs, 'launch', id, '--no-wine', '--json'], {
      environment: config.environment, hostCwd: config.dir, timeout: 45000, maxBuffer: 256 * 1024
    });
    parameters = JSON.parse(stdout);
  } catch (error) {
    const reason = String(error.stderr || '').split(/[\r\n]/).map(launchReason).filter(Boolean).at(-1);
    onStatus(reason || (error.killed ? 'store-timeout' : 'store'));
    return false;
  }
  const { game_directory: directory, working_directory: cwd, game_executable: executable,
    game_parameters: gameArgs, user_parameters: userArgs, egl_parameters: epicArgs } = parameters || {};
  if (parameters?.pre_launch_command) return null;
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || typeof cwd !== 'string' || !path.isAbsolute(cwd) ||
      typeof executable !== 'string' || !executable) {
    onStatus('missing');
    return false;
  }
  const file = path.resolve(directory, executable);
  if (!await fileExists(file) && !await runHostTool('test', ['-f', file], { timeout: 5000 }).then(() => true, () => false)) {
    onStatus('missing');
    return false;
  }
  const args = [gameArgs, userArgs, epicArgs].flat().filter(value => typeof value === 'string');
  const overrides = Object.fromEntries(Object.entries(parameters.environment || {}).filter(([key, value]) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string' && !value.includes('\0')));
  onStatus('runner-start');
  try {
    const wrapper = overrides.LEGENDARY_WRAPPER_EXE?.trim();
    await launch(runner, [...(wrapper ? [wrapper] : []), file, ...args], {
      cwd, hostCwd: cwd, environment: { ...overrides, ...environment }, ...storeLaunchMonitor(onStatus, { direct: true })
    });
  } catch {
    onStatus('runner');
    return false;
  }
  return true;
}

async function play(provider, config, { id, folder, umu, environment, onStatus }) {
  if (provider === 'epic' && process.platform === 'linux' && umu && onStatus) {
    const result = await playEpicOnLinux(config, id, umu, environment, onStatus);
    if (result !== null) return result;
  }
  let args = ['launch', id];
  if (provider === 'gog') {
    const gameDir = folder && await gogGameFolder(folder, id);
    if (!gameDir) {
      onStatus?.('missing');
      return false;
    }
    args = ['launch', gameDir, id, '--platform', process.platform === 'darwin' ? 'osx' : 'windows'];
  }
  const monitored = onStatus && Object.hasOwn(providers, provider);
  const command = monitored && umu ? ['/bin/sh', '-c', runnerScript, 'peragames-runner', umu] : [umu];
  const wrapper = umu ? ['--no-wine', '--wrapper', command.map(quoteWrapper).join(' ')] : [];
  await launch(config.tool, [...config.baseArgs, ...args, ...wrapper], {
    environment: { ...config.environment, ...environment },
    hostCwd: config.dir,
    ...(monitored ? storeLaunchMonitor(onStatus, { wrapped: Boolean(umu) }) : {})
  });
  return true;
}

module.exports = { storeConfig, storeGameId, loginCode, loginUrl, library, connect, install, play, gogGameFolder };

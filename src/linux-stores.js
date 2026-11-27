'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { findLinuxCommand, runHostTool, launch, fileExists } = require('./system');
const { readProgress } = require('./downloads');
const { findStoreTool } = require('./store-tools');
const { portalParts, hostPath, hostExists, requireHostPath, migrateStoreFile } = require('./host-paths');

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
  if (process.platform === 'linux' && linked) linked = await hostPath(linked);
  const custom = process.platform === 'linux' ? await hostExists(linked, '-x') :
    await fileExists(linked) && await fs.access(linked, constants.X_OK).then(() => true, () => false);
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

function installedMetadata(provider, config, { readOnly = false } = {}) {
  if (!config.dir || provider === 'gog') return;
  const file = provider === 'amazon' ? path.join(config.dir, 'nile', 'installed.json') : path.join(config.dir, 'installed.json');
  const read = readOnly ? fs.readFile(file, 'utf8').then(JSON.parse, () => undefined) : migrateStoreFile(file);
  return read.then(value => {
    if (value === undefined) return;
    if (provider === 'amazon' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Installed metadata format');
    }
    return value;
  }).catch(() => {
    throw new Error('Não foi possível ler os caminhos de instalação da loja.');
  });
}

async function storeDescriptor(provider, directory, id) {
  const descriptor = path.join(directory, provider === 'gog' ? 'goggame-' + id + '.info' : 'fuel.json');
  const manifest = await fs.readFile(descriptor, 'utf8').catch(() =>
    runHostTool('cat', ['--', descriptor], { timeout: 5000, maxBuffer: 1024 * 1024 }).then(({ stdout }) => stdout, () => ''));
  let data;
  try { data = JSON.parse(manifest.replace(/^\uFEFF/, '')); }
  catch { return; } // Nile also accepts JSON5. Its wrapper validates arguments before UMU.
  const task = provider === 'gog' ? (Array.isArray(data?.playTasks) && data.playTasks.find(item => item?.isPrimary)) : data?.Main;
  return { workingDirectory: provider === 'gog' ? task?.workingDir : task?.WorkingSubdirOverride,
    executable: provider === 'gog' ? task?.path : task?.Command };
}

async function validateStoreLaunch(provider, folder, id) {
  const directory = await requireHostPath(folder, '-d', 'A pasta de instalação não existe no Linux.');
  const { workingDirectory, executable } = await storeDescriptor(provider, directory, id) || {};
  if (typeof workingDirectory === 'string' && workingDirectory) {
    await requireHostPath(path.resolve(directory, workingDirectory.replaceAll('\\', '/')),
      '-d', 'A pasta de trabalho não existe no Linux.');
  }
  if (typeof executable === 'string' && executable) {
    await requireHostPath(path.resolve(directory, executable.replaceAll('\\', '/')),
      '-f', 'O executável do jogo não existe no Linux.');
  }
}

async function diagnoseStorePaths(provider, config, game) {
  if (!storeGameId(provider, game.storeId)) return {};
  if (provider === 'gog') {
    const folder = await hostPath(game.installFolder);
    if (!folder) return {};
    const actual = await gogGameFolder(folder, game.storeId);
    if (!actual) return { directory: folder };
    const { executable, workingDirectory } = await storeDescriptor(provider, actual, game.storeId) || {};
    return { directory: actual, executable: descriptorPath(actual, executable),
      cwd: descriptorPath(actual, workingDirectory) || actual };
  }
  const metadata = await installedMetadata(provider, config, { readOnly: true });
  const entry = provider === 'amazon' ? metadata?.find(item => item.id === game.storeId) : metadata?.[game.storeId];
  const directory = await hostPath(entry?.path || entry?.install_path || game.installFolder);
  if (!directory) return {};
  const task = provider === 'amazon' ? await storeDescriptor(provider, directory, game.storeId) : entry;
  return { directory, executable: descriptorPath(directory, task?.executable),
    cwd: descriptorPath(directory, task?.workingDirectory || task?.working_directory) || directory };
}

function descriptorPath(directory, value) {
  return typeof value === 'string' && value ? path.resolve(directory, value.replaceAll('\\', '/')) : undefined;
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
    const installed = await installedMetadata(provider, config) || [];
    const folders = new Map(installed.map(item => [item.id, item.path]));
    return Promise.all(owned.filter(item => storeGameId(provider, item.product?.id) && typeof item.product.title === 'string')
      .map(async ({ product }) => {
        const folder = folders.get(product.id);
        const detail = product.productDetail;
        return { id: product.id, name: product.title, installed: Boolean(typeof folder === 'string' &&
          (await fileExists(path.join(folder, 'fuel.json')) || await hostExists(path.join(folder, 'fuel.json'), '-f') ||
            portalParts(folder))),
          cover: storeCover(detail?.details?.backgroundUrl2 || detail?.iconUrl) };
      }));
  }
  await installedMetadata(provider, config);
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
  root = await hostPath(root);
  const manifest = 'goggame-' + id + '.info';
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const folders = [root, ...entries.filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name))];
  for (const folder of folders) {
    if (await fileExists(path.join(folder, manifest))) return folder;
    if (process.platform !== 'darwin') continue;
    const bundles = (await fs.readdir(folder).catch(() => [])).filter(name => name.endsWith('.app'));
    for (const bundle of bundles) {
      if (await fileExists(path.join(folder, bundle, 'Contents', 'Resources', manifest))) return folder;
    }
  }
  if (process.platform === 'linux') {
    const result = await runHostTool('find', [root, '-maxdepth', '2', '-type', 'f', '-name', manifest, '-print0', '-quit'],
      { timeout: 5000 }).then(({ stdout }) => stdout.split('\0')[0], () => '');
    if (result) return path.dirname(result);
  }
}

async function install(provider, config, id, folder, progress, signal, finish) {
  signal?.throwIfAborted();
  if (folder && process.platform === 'linux') {
    folder = await hostPath(folder);
    await requireHostPath(path.dirname(folder), '-d', 'A pasta de instalação não existe no Linux.');
  }
  await installedMetadata(provider, config);
  const mac = process.platform === 'darwin';
  const args = provider === 'gog'
    ? ['download', id, '--platform', mac ? 'osx' : 'windows', '--path', folder, '--with-dlcs']
    : provider === 'amazon' ? ['install', id, ...(folder ? ['--base-path', folder] : [])]
      : ['-y', 'install', id, ...(folder ? ['--base-path', folder] : []), ...(mac ? ['--platform', 'Mac'] : []), '--skip-dlcs'];
  try {
    await launch(config.tool, [...config.baseArgs, ...args], {
      environment: config.environment, wait: true, signal, onLine: line => progress(readProgress(line))
    });
    finish();
    if (provider === 'gog') {
      const installed = await gogGameFolder(folder, id);
      if (!installed) throw new Error('Missing game directory');
      return installed;
    }
  } catch {
    signal?.throwIfAborted();
    throw new Error('Não foi possível instalar ou atualizar o jogo pela loja.');
  }
}

const quoteWrapper = argument => "'" + argument.replaceAll("'", "'\"'\"'") + "'";
const runnerScript = [
  'cwd=$(pwd -P) && [ -d "$cwd" ] || { printf "PERAGAMES_CWD_MISSING\\n" >&2; exit 125; }',
  'case "$cwd" in /run/user/*/doc/*|/run/flatpak/doc/*) printf "PERAGAMES_CWD_MISSING\\n" >&2; exit 125;; esac',
  'case "$2" in /run/user/*/doc/*|/run/flatpak/doc/*) printf "PERAGAMES_EXE_MISSING\\n" >&2; exit 125;; esac',
  '[ -f "$2" ] || { printf "PERAGAMES_EXE_MISSING\\n" >&2; exit 125; }',
  'printf "\\nPERAGAMES_RUNNER_START\\n" >&2'
].join('; ');

function launchReason(line) {
  if (/d3d->CreateDevice failed|fx_2_0.*not supported|(?:failed to load|cannot find).*d3d(?:compiler|x9)_43/i.test(line)) return 'dependency';
  if (/^PERAGAMES_CWD_MISSING$|FileNotFoundError:.*(?:\/run\/user\/\d+\/doc\/|\/run\/flatpak\/doc\/)/i.test(line)) return 'missing-cwd';
  if (line === 'PERAGAMES_EXE_MISSING') return 'missing-executable';
  if (/no space left on device/i.test(line)) return 'runtime-space';
  if (/wineserver:\s*failed to load l_intl\.nls/i.test(line)) return 'runtime-wine-data';
  if (/bwrap:.*(?:operation not permitted|permission denied|namespace)|unprivileged user namespace/i.test(line)) return 'runtime-namespace';
  if (/environment variable not set or is empty:\s*PROTONPATH|PROTONPATH.*(?:not valid|not found)/i.test(line) && !/toolmanifest\.vdf/i.test(line)) return 'runtime-proton-path';
  if (/failed to match .*container runtime|toolmanifest\.vdf/i.test(line)) return 'runtime-manifest';
  if (/certificate verify failed|name or service not known|temporary failure in name resolution|network is unreachable|internet connection is required to setup umu|repo\.steampowered\.com.*(?:error|timed? out|retries exceeded)/i.test(line)) return 'runtime-network';
  if (/umu-shim.*(?:not found|permission denied)|wine_.*(?:symbol lookup error|undefined symbol)|(?:wine_r_debug|wine_main_preload_info) not found/i.test(line)) return 'runtime-loader';
  if (/wine:.*(?:prefix|wineserver)|(?:system|user)\.reg.*(?:failed|error|denied)|prefix.*(?:not owned|permission denied|different architecture)/i.test(line)) return 'prefix';
  if (/no vulkan|failed to (?:initialize|create).*vulkan|VK_ERROR_|no suitable (?:graphics|devices?)|failed to initialize graphics/i.test(line)) return 'graphics';
  if (/steamrt[234].*(?:not found|unsupported)|Traceback \(most recent call last\)|^(?:[A-Za-z]+Error|Exception):/i.test(line)) return 'runtime';
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
      } else {
        const found = launchReason(line);
        if (found && (!reason || found !== 'runtime')) reason = found;
      }
    },
    onClose(code, signal) {
      if (reason || code || signal) report(direct || started ? 'runner' : 'store');
      else if (direct && early()) report('early-exit');
      else if (wrapped && !started) report('store');
    }
  };
}

async function playEpicOnLinux(config, id, runner, environment, onStatus, additionalArgs, onClose) {
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
  const { game_directory: directory, working_directory: workingDirectory, game_executable: executable,
    game_parameters: gameArgs, user_parameters: userArgs, egl_parameters: epicArgs } = parameters || {};
  if (parameters?.pre_launch_command) return null;
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || typeof workingDirectory !== 'string' || !path.isAbsolute(workingDirectory) ||
      typeof executable !== 'string' || !executable) {
    onStatus('missing');
    return false;
  }
  const cwd = await requireHostPath(workingDirectory, '-d', 'A pasta de trabalho não existe no Linux.');
  const file = await requireHostPath(path.resolve(await hostPath(directory), executable), '-f', 'O executável do jogo não existe no Linux.');
  const args = [gameArgs, userArgs, epicArgs, additionalArgs].flat().filter(value => typeof value === 'string');
  const overrides = Object.fromEntries(Object.entries(parameters.environment || {}).filter(([key, value]) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string' && !value.includes('\0')));
  onStatus('runner-start');
  try {
    const requestedWrapper = overrides.LEGENDARY_WRAPPER_EXE?.trim();
    const wrapper = requestedWrapper && path.isAbsolute(requestedWrapper) ? await hostPath(requestedWrapper) : requestedWrapper;
    const launchMonitor = storeLaunchMonitor(onStatus, { direct: true });
    await launch(runner, [...(wrapper ? [wrapper] : []), file, ...args], {
      cwd, hostCwd: cwd, environment: { ...overrides, ...environment }, onLine: launchMonitor.onLine,
      onClose(code, signal) { launchMonitor.onClose(code, signal); onClose?.(); }
    });
  } catch {
    onStatus('runner');
    return false;
  }
  return true;
}

async function play(provider, config, { id, folder, umu, environment, onStatus, onClose, additionalArgs = [] }) {
  const metadata = await installedMetadata(provider, config);
  if (process.platform === 'linux' && umu && metadata) {
    const entry = provider === 'amazon' ? metadata.find(item => item.id === id) : metadata[id];
    const location = entry?.path || entry?.install_path;
    if (location) {
      if (provider === 'amazon') await validateStoreLaunch(provider, location, id);
      else await requireHostPath(location, '-d', 'A pasta de instalação não existe no Linux.');
    }
  }
  if (environment?.PROTONPATH) {
    environment = { GAMEID: 'umu-0', STORE: provider === 'epic' ? 'egs' : provider, ...environment };
  }
  if (provider === 'epic' && process.platform === 'linux' && umu && onStatus) {
    const result = await playEpicOnLinux(config, id, umu, environment, onStatus, additionalArgs, onClose);
    if (result !== null) return result;
  }
  let args = ['launch', id];
  if (provider === 'gog') {
    const gameDir = folder && await gogGameFolder(folder, id);
    if (!gameDir) {
      onStatus?.('missing');
      return false;
    }
    if (process.platform === 'linux') await validateStoreLaunch(provider, gameDir, id);
    args = ['launch', gameDir, id, '--platform', process.platform === 'darwin' ? 'osx' : 'windows'];
  }
  const monitored = onStatus && Object.hasOwn(providers, provider);
  const script = runnerScript + '; "$@"' + (additionalArgs.length ? ' ' + additionalArgs.map(quoteWrapper).join(' ') : '') +
    '; result=$?; printf "\\nPERAGAMES_RUNNER_EXIT=%s\\n" "$result" >&2; exit "$result"';
  const command = umu ? ['/bin/sh', '-c', script, 'peragames-runner', umu] : [];
  const wrapper = umu ? ['--no-wine', '--wrapper', command.map(quoteWrapper).join(' ')] : [];
  const launchMonitor = monitored && storeLaunchMonitor(onStatus, { wrapped: Boolean(umu) });
  try { await launch(config.tool, [...config.baseArgs, ...args, ...wrapper], {
    environment: { ...config.environment, ...environment },
    hostCwd: config.dir,
    onLine: launchMonitor?.onLine,
    onClose(code, signal) { launchMonitor?.onClose(code, signal); onClose?.(); }
  }); } catch { throw new Error(storeError); }
  return true;
}

async function uninstall(game, config, shell) {
  const { store, storeId, installBase, installFolder } = game;
  if (!storeGameId(store, storeId)) throw new Error('Desinstalação indisponível para este jogo.');
  if (store !== 'gog') {
    await installedMetadata(store, config);
    await command(config, store === 'epic' ? ['-y', 'uninstall', storeId] : ['uninstall', storeId], false);
    return;
  }
  const invalid = 'A pasta gerenciada da GOG não foi identificada.';
  if (!installBase || !path.isAbsolute(installBase) || path.basename(installBase) !== 'GOG-' + storeId || !installFolder) {
    throw new Error(invalid);
  }
  const [base, folder] = await Promise.all([fs.realpath(installBase), fs.realpath(installFolder)])
    .catch(() => { throw new Error(invalid); });
  const relative = path.relative(base, folder);
  if (path.basename(base) !== 'GOG-' + storeId || relative === '..' || relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative) || !await gogGameFolder(folder, storeId)) throw new Error(invalid);
  try {
    if (process.platform === 'linux') await runHostTool('gio', ['trash', '--', base], { timeout: 60000 });
    else await shell.trashItem(base);
  } catch { throw new Error('O sistema não conseguiu mover a pasta do jogo para a lixeira.'); }
}

module.exports = { storeConfig, storeGameId, loginCode, loginUrl, library, connect, install, uninstall, play, gogGameFolder,
  diagnoseStorePaths, launchReason };

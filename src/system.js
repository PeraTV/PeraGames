'use strict';

const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const run = promisify(execFile);
const inFlatpak = process.platform === 'linux' && Boolean(process.env.FLATPAK_ID);
const macApps = {
  steam: 'Steam', epic: 'Epic Games Launcher', gog: 'GOG Galaxy', heroic: 'Heroic',
  battle: 'Battle.net', discord: 'Discord', obs: 'OBS', dolphin: 'Dolphin',
  retroarch: 'RetroArch', pcsx2: 'PCSX2', ppsspp: 'PPSSPP'
};

function hostCommand(file, args, { cwd, environment = {} } = {}) {
  if (!inFlatpak) return [file, args];
  const env = Object.entries(environment).map(([key, value]) => '--env=' + key + '=' + value);
  return ['flatpak-spawn', ['--host', ...env, ...(cwd ? ['--directory=' + cwd] : []), file, ...args]];
}

async function openWebLink(url, shell) {
  if (!inFlatpak) return shell.openExternal(url);
  try { await runHostTool('xdg-open', [url], { timeout: 12000 }); }
  catch { await shell.openExternal(url); }
}

async function runHostTool(file, args, { environment = {}, input, ...options } = {}) {
  const [command, commandArgs] = hostCommand(file, args, { environment });
  const settings = { env: { ...process.env, ...environment }, ...options };
  if (input === undefined) return run(command, commandArgs, settings);
  return new Promise((resolve, reject) => {
    const child = execFile(command, commandArgs, settings, (error, stdout) => error ? reject(error) : resolve({ stdout }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function flathubId(url) {
  if (typeof url !== 'string') return;
  return /^https:\/\/flathub\.org\/(?:[a-z-]+\/)?apps\/([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){2,})\/?$/.exec(url)?.[1];
}

async function installFlatpak(id) {
  await runHostTool('flatpak', [
    'remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'
  ], { timeout: 45000 });
  await launch('flatpak', ['install', '--user', '--app', '--noninteractive', '--assumeyes', 'flathub', id], { wait: true });
}

async function tryRun(file, args) {
  try {
    const [command, commandArgs] = hostCommand(file, args);
    const result = await run(command, commandArgs, { windowsHide: true, timeout: 1800 });
    return result.stdout.trim();
  } catch {
    return '';
  }
}

async function fileExists(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

function steamRoots(env, home, platform) {
  if (platform === 'win32') {
    return [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA]
      .filter(Boolean).map(root => path.join(root, 'Steam'));
  }
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Steam')];

  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.steam', 'root'),
    path.join(home, '.local', 'share', 'Steam'),
    env.XDG_DATA_HOME && path.join(env.XDG_DATA_HOME, 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam')
  ].filter(Boolean);
}

async function registryValue(key, name) {
  const output = await tryRun('reg.exe', ['query', key, '/v', name]);
  return output.match(/REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/i)?.[1].trim();
}

async function getSteamRoots(platform, env, home) {
  const roots = steamRoots(env, home, platform);
  if (platform === 'win32') {
    const registered = await registryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath');
    if (registered && path.isAbsolute(registered)) roots.unshift(registered);
  }
  return [...new Set(roots.map(root => path.normalize(root)))];
}

function readVdfString(text, key) {
  const match = new RegExp('"' + key + '"\\s+"((?:[^"\\\\]|\\\\.)*)"', 'i').exec(text);
  return match?.[1].replace(/\\(["\\])/g, '$1');
}

function readLibraryFolders(text) {
  const folders = [...text.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/gi)]
    .map(match => match[1].replace(/\\(["\\])/g, '$1'));
  if (folders.length) return folders;
  return [...text.matchAll(/^\s*"\d+"\s+"((?:[^"\\]|\\.)*)"\s*$/gm)]
    .map(match => match[1].replace(/\\(["\\])/g, '$1'));
}

async function steamManifests(roots, readManifest) {
  const libraries = new Set(roots.map(root => path.join(root, 'steamapps')));
  const folderLists = await Promise.all([...libraries].map(dir =>
    fs.readFile(path.join(dir, 'libraryfolders.vdf'), 'utf8').catch(() => '')));
  for (const text of folderLists) {
    for (const root of readLibraryFolders(text)) {
      if (path.isAbsolute(root)) libraries.add(path.join(root, 'steamapps'));
    }
  }

  const results = await Promise.all([...libraries].map(async dir => {
    const entries = await fs.readdir(dir).catch(() => []);
    return Promise.all(entries.filter(name => /^appmanifest_\d+\.acf$/i.test(name)).map(async file => {
      const text = await fs.readFile(path.join(dir, file), 'utf8').catch(() => '');
      const appId = readVdfString(text, 'appid');
      const name = readVdfString(text, 'name');
      return appId && /^\d+$/.test(appId) && name ? readManifest({ appId, name, text }) : null;
    }));
  }));

  const games = new Map();
  for (const game of results.flat()) {
    if (game) games.set(game.id, game);
  }
  return [...games.values()];
}

function steamGames(roots) {
  return steamManifests(roots, ({ appId, name, text }) => Number(readVdfString(text, 'StateFlags')) & 4 ?
    { id: 'steam-' + appId, appId, name, source: 'Steam' } : null);
}

function steamDownloads(roots) {
  return steamManifests(roots, ({ appId, name, text }) => {
    const flags = Number(readVdfString(text, 'StateFlags'));
    const total = Number(readVdfString(text, 'BytesToDownload'));
    const downloaded = Number(readVdfString(text, 'BytesDownloaded'));
    if (!Number.isFinite(flags) || flags === 4 || !Number.isSafeInteger(total) || !Number.isSafeInteger(downloaded) ||
        downloaded < 0 || downloaded >= total) return null;
    return { id: 'steam-' + appId, name, source: 'Steam', status: 'external', progress: 100 * downloaded / total };
  });
}

async function findLinuxCommand(name, env) {
  if (inFlatpak) {
    const file = await tryRun('sh', ['-c', 'command -v "$1"', 'peragames', name]);
    return path.isAbsolute(file) ? file : undefined;
  }
  for (const directory of (env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    if (await fileExists(candidate) && await fs.access(candidate, constants.X_OK).then(() => true, () => false)) {
      return candidate;
    }
  }
}

function softwareCenters(desktop) {
  const gnome = 'gnome-software';
  const kde = 'plasma-discover';
  const pamac = 'pamac-manager';
  if (/KDE|PLASMA/i.test(desktop)) return [kde, pamac, gnome];
  if (/GNOME|UNITY|COSMIC/i.test(desktop)) return [gnome, pamac, kde];
  return [pamac, gnome, kde];
}

async function openLinuxSoftware(query) {
  const term = typeof query === 'string' ? query.trim() : '';
  if (process.platform !== 'linux' || !term || term.length > 120 || /[\x00-\x1f\x7f]/.test(term)) {
    throw new Error('Digite o nome do aplicativo para buscar na loja do Linux.');
  }
  const centers = softwareCenters(process.env.XDG_CURRENT_DESKTOP || '');
  // Big Store's wrapper evaluates its search argument. Pass only plain search terms.
  if (/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(term) && !/^(category|appstream|aur|flatpak|snap)$/i.test(term)) {
    centers.unshift('big-store');
  }
  for (const name of centers) {
    const file = await findLinuxCommand(name, process.env);
    if (!file) continue;
    const args = name === 'big-store' ? [term] :
      name === 'plasma-discover' ? ['--mode', 'Browsing', '--search=' + term] : ['--search=' + term];
    await launch(file, args);
    return;
  }
  throw new Error('Nenhuma loja compatível foi detectada. Use Big Store, GNOME Software, Discover ou Pamac.');
}

async function isMacBundle(file) {
  return typeof file === 'string' && file.endsWith('.app') && await fileExists(path.join(file, 'Contents', 'Info.plist'));
}

async function discordExecutables(localAppData) {
  if (!localAppData) return [];
  const root = path.join(localAppData, 'Discord');
  const entries = await fs.readdir(root).catch(() => []);
  return entries.filter(name => /^app-\d+(\.\d+)*$/.test(name))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    .map(name => path.join(root, name, 'Discord.exe'));
}

async function discoverDolphin(env, roms) {
  const romRoots = roms.filter(game => game.emulator === 'dolphin').flatMap(game => {
    const folder = path.dirname(game.file);
    const drive = path.parse(folder).root;
    return [folder, path.dirname(folder), path.join(drive, 'Games'), path.join(drive, 'Programas')];
  });
  const roots = [...new Set([
    env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'),
    env.USERPROFILE && path.join(env.USERPROFILE, 'Downloads'), ...romRoots
  ].filter(Boolean))];
  const candidates = [];
  async function visit(directory, depth) {
    candidates.push(path.join(directory, 'Dolphin.exe'));
    if (!depth) return;
    const children = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (child.isDirectory() && /^(?:dolphin|win(?:32|64)|x64)/i.test(child.name)) {
        await visit(path.join(directory, child.name), depth - 1);
      }
    }
  }
  await Promise.all(roots.slice(0, 32).map(root => visit(root, 3)));
  return candidates;
}

async function detectStores(stores, platform, env, data, roots) {
  const flatpak = platform === 'linux' && await findLinuxCommand('flatpak', env);
  const installedFlatpaks = flatpak ? await tryRun(flatpak, ['list', '--app', '--columns=application']) : '';
  const flatpakIds = new Set(installedFlatpaks.split(/\s+/));

  const pairs = await Promise.all(stores.map(async store => {
    const custom = data.apps[store.id];
    if (await fileExists(custom) || (platform === 'darwin' && await isMacBundle(custom))) {
      return [store.id, { file: custom, args: [], custom: true }];
    }

    if (platform === 'darwin' && macApps[store.id]) {
      const home = env.HOME || '';
      for (const root of ['/Applications', path.join(home, 'Applications')]) {
        const file = path.join(root, macApps[store.id] + '.app');
        if (await isMacBundle(file)) return [store.id, { file, args: [] }];
      }
    }

    if (platform === 'win32') {
      const programRoots = [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
      const userPrograms = env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, 'Programs')] : [];
      const candidates = {
        steam: roots.map(root => path.join(root, 'steam.exe')),
        heroic: [...userPrograms, ...programRoots].flatMap(root =>
          ['heroic', 'Heroic Games Launcher', 'Heroic'].map(folder => path.join(root, folder, 'Heroic.exe'))),
        dolphin: programRoots.map(root => path.join(root, 'Dolphin', 'Dolphin.exe'))
      };
      const standardRoots = [...programRoots, ...userPrograms, env.LOCALAPPDATA].filter(Boolean);
      const additional = standardRoots.flatMap(root => (store.windowsPaths || []).map(file => path.join(root, file)));
      if (store.id === 'discord') additional.push(...await discordExecutables(env.LOCALAPPDATA));
      if (store.id === 'dolphin') additional.push(...await discoverDolphin(env, data.roms || []));
      for (const file of [...(candidates[store.id] || []), ...additional]) {
        if (await fileExists(file)) return [store.id, { file, args: [] }];
      }
    }

    if (platform === 'linux') {
      for (const name of store.linuxCommands || []) {
        const file = await findLinuxCommand(name, env);
        if (file) return [store.id, { file, args: [] }];
      }
      const id = store.flatpaks?.find(candidate => flatpakIds.has(candidate));
      if (id) return [store.id, { file: flatpak, args: ['run', id] }];
    }

    return [store.id, null];
  }));

  return Object.fromEntries(pairs);
}

function launch(file, args = [], { cwd = path.dirname(file), visible = false, environment = {}, hostCwd, wait = false, onLine, onClose } = {}) {
  if (process.platform === 'darwin' && file.endsWith('.app')) {
    return run('/usr/bin/open', ['-a', file, ...(args.length ? ['--args', ...args] : [])]);
  }
  const [command, commandArgs] = hostCommand(file, args, { cwd: hostCwd, environment });
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: inFlatpak ? undefined : cwd, env: { ...process.env, ...environment },
      detached: !onLine, stdio: onLine ? ['ignore', 'pipe', 'pipe'] : 'ignore', windowsHide: !visible
    });
    if (onLine) for (const stream of [child.stdout, child.stderr]) {
      let remainder = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        const lines = (remainder + chunk).split(/[\r\n]/);
        remainder = lines.pop().slice(-4096);
        for (const line of lines) onLine(line);
      });
      stream.on('end', () => { if (remainder) onLine(remainder); });
    }
    child.once('error', reject);
    if (onClose) child.once('close', onClose);
    if (wait) {
      child.once('close', code => code === 0 ? resolve() : reject(new Error('Process exited with code ' + code)));
      return;
    }
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

module.exports = { getSteamRoots, steamGames, steamDownloads, readLibraryFolders, readVdfString, detectStores, fileExists, launch, isMacBundle,
  macApps, findLinuxCommand, openWebLink, runHostTool, flathubId, installFlatpak, openLinuxSoftware };

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { runHostTool, findLinuxCommand, launch } = require('./system');
const { hostExists } = require('./host-paths');

const umuCache = new Map();
const knownGames = { 'egs:quail': { steamId: '322110', dependencies: ['d3dcompiler_43', 'd3dx9_43'] } };
const protonLaunchers = new Set(['ea', 'battle', 'ubisoft']);
const storeName = provider => provider === 'epic' ? 'egs' : provider;
const knownGame = game => knownGames[storeName(game.store) + ':' + game.storeId?.toLowerCase()];
const steamId = value => /^\d{1,10}$/.test(value || '') ? value : undefined;
const umuId = value => /^umu-[a-z0-9_-]{1,80}$/i.test(value || '') ? value : undefined;

async function umuGameEnvironment(game, settings, info) {
  const store = storeName(game.store);
  const id = game.storeId;
  let match = umuId(settings.umuId);
  const configuredSteamId = steamId(settings.steamId) || knownGame(game)?.steamId;
  if (!match && configuredSteamId) match = 'umu-' + configuredSteamId;
  if (!match && store && /^[a-z0-9_.-]{1,100}$/i.test(id || '')) {
    const key = store + ':' + id.toLowerCase();
    const cached = umuCache.get(key);
    if (cached?.expires > Date.now()) match = await cached.result;
    else {
      const query = new URLSearchParams({ store, codename: id.toLowerCase() });
      const result = fetch('https://umu.openwinecomponents.org/umu_api.php?' + query, {
        signal: AbortSignal.timeout(3500), redirect: 'error'
      }).then(async response => {
        const rows = response.ok ? await response.json() : [];
        if (!Array.isArray(rows)) return;
        const ids = new Set(rows.filter(row => row?.store?.toLowerCase() === store &&
          row.codename?.toLowerCase() === id.toLowerCase()).map(row => umuId(row.umu_id)).filter(Boolean));
        if (ids.size === 1) return ids.values().next().value;
      }).catch(() => undefined);
      umuCache.set(key, { expires: Date.now() + 10 * 60_000, result });
      if (umuCache.size > 250) umuCache.delete(umuCache.keys().next().value);
      match = await result;
    }
  }
  const appId = /^https:\/\/store\.steampowered\.com\/app\/(\d{1,10})\/$/.exec(info?.url || '')?.[1];
  return { GAMEID: match || (appId ? 'umu-' + appId : 'umu-0'), ...(store ? { STORE: store } : {}) };
}

function gameLaunchOptions(input) {
  const argumentsText = typeof input.argumentsText === 'string' ? input.argumentsText : '';
  const environmentText = typeof input.environmentText === 'string' ? input.environmentText : '';
  if (argumentsText.length > 4096 || environmentText.length > 4096 || /\0/.test(argumentsText + environmentText)) {
    throw new Error('Os argumentos ou variáveis do jogo são inválidos.');
  }
  const args = argumentsText.split(/\r?\n/).filter(line => line.trim());
  if (args.some(arg => /^--?(?:auth_(?:password|login|type)|exchange[-_]code|authorization)(?:[=\s]|$)/i.test(arg.trim()))) {
    throw new Error('As credenciais da loja são gerenciadas pelo PeraGames.');
  }
  const variables = Object.create(null);
  for (const line of environmentText.split(/\r?\n/).filter(line => line.trim())) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || /^(?:PROTONPATH|WINEPREFIX|GAMEID|STORE|PWD|HOME|FLATPAK_ID|STEAM_(?:COMPAT|APPID|GAMEID).*|XDG_(?:CONFIG|DATA|CACHE|RUNTIME).*|(?:LEGENDARY|GOGDL|NILE)_CONFIG_PATH|AUTH_.*|.*(?:TOKEN|PASSWORD|EXCHANGE_CODE|AUTHORIZATION))$/i.test(match[1])) {
      throw new Error('Use uma variável NOME=valor por linha. Os caminhos do Proton, prefixo e loja são gerenciados pelo PeraGames.');
    }
    variables[match[1]] = match[2];
  }
  const steam = typeof input.steamId === 'string' ? input.steamId.trim() : '';
  const umu = typeof input.umuId === 'string' ? input.umuId.trim() : '';
  if ((steam && !steamId(steam)) || (umu && !umuId(umu))) throw new Error('Informe um Steam AppID numérico ou um ID UMU que comece com umu-.');
  return { args, variables, steamId: steam || undefined, umuId: umu || undefined };
}

async function createPrefixCopy(root, original) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const destination = await fs.mkdtemp(path.join(root, 'prefix-'));
  if (original) {
    try {
      await runHostTool('cp', ['-a', '--reflink=auto', '--', original + '/.', destination], { timeout: 300000 });
      const canonical = await runHostTool('realpath', ['--', original], { timeout: 5000 })
        .then(({ stdout }) => stdout.replace(/\r?\n$/, ''), () => original);
      async function relink(directory) {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) await relink(file);
          if (!entry.isSymbolicLink()) continue;
          const target = await fs.readlink(file);
          if (!path.isAbsolute(target)) continue;
          const base = [original, canonical].find(candidate => target === candidate || target.startsWith(candidate + path.sep));
          if (!base) continue;
          const relocated = path.join(destination, path.relative(base, target));
          await fs.unlink(file);
          await fs.symlink(path.relative(directory, relocated) || '.', file);
        }
      }
      await relink(destination);
    } catch { throw new Error('Não foi possível copiar o prefixo. O prefixo anterior continua ativo.'); }
  }
  return destination;
}

async function preparePrefixChange({ root, prefix, previous, action }) {
  const backup = await hostExists(prefix, '-d') ? prefix : undefined;
  if (action === 'restore') {
    if (!await hostExists(previous, '-d')) throw new Error('O backup deste prefixo não está disponível.');
    return { next: previous, backup };
  }
  const next = await createPrefixCopy(root, action === 'recreate' ? undefined : backup);
  return { next, backup };
}

async function installedLauncherExecutable(store, prefix) {
  if (!protonLaunchers.has(store.id)) return;
  const roots = ['pfx', ''].flatMap(folder => ['Program Files', 'Program Files (x86)']
    .map(programs => path.join(prefix, folder, 'drive_c', programs)));
  for (const root of roots) {
    const candidates = store.windowsPaths.map(file => path.join(root, file));
    if (store.id === 'ea') {
      const eaRoot = path.join(root, 'Electronic Arts', 'EA Desktop');
      const versions = (await fs.readdir(eaRoot, { withFileTypes: true }).catch(() => []))
        .filter(entry => entry.isDirectory() && /^\d+(?:\.\d+)+$/.test(entry.name))
        .map(entry => entry.name).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
      for (const folder of ['', ...versions]) {
        const appDirectory = path.join(eaRoot, folder, 'EA Desktop');
        candidates.push(path.join(appDirectory, 'EADesktop.exe'), path.join(appDirectory, 'EALauncher.exe'));
      }
    }
    const exists = await Promise.all(candidates.map(file => hostExists(file, '-f')));
    const index = exists.indexOf(true);
    if (index !== -1) return candidates[index];
  }
}

function winetricksVerbs(value) {
  const verbs = typeof value === 'string' ? value.trim().split(/\s+/) : [];
  if (!verbs.length || verbs.length > 12 || verbs.some(verb => !/^[a-z0-9][a-z0-9_]{1,58}$/.test(verb))) {
    throw new Error('Informe de 1 a 12 componentes do Winetricks, separados por espaços.');
  }
  return [...new Set(verbs)];
}

async function installWinetricks(runner, verbs, environment, cwd) {
  let failure = false;
  const useUmu = Boolean(runner.environment.PROTONPATH);
  const file = useUmu ? runner.file : await findLinuxCommand('winetricks', process.env);
  if (!file) throw new Error('Instale o Winetricks no Linux para usá-lo com o Wine.');
  const args = useUmu ? ['winetricks', ...verbs] : ['-q', ...verbs];
  try {
    await launch(file, args, {
      hostCwd: cwd, wait: true, environment: { ...environment, ...runner.environment, ...(!useUmu && { WINE: runner.file }) },
      onLine(line) {
        if (/^Traceback \(most recent call last\)|^ERROR:|returned status [1-9]\d*|wineserver: failed to load/i.test(line)) failure = true;
      }
    });
  } catch { failure = true; }
  if (failure) throw new Error('O Winetricks falhou. O prefixo anterior continua ativo.');
}

module.exports = { knownGame, umuGameEnvironment, gameLaunchOptions, createPrefixCopy, preparePrefixChange, winetricksVerbs,
  installWinetricks, protonLaunchers, installedLauncherExecutable };

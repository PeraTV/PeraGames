'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { stores, romFormats, romArguments } = require('./catalog');
const { getSteamRoots, steamGames, detectStores, fileExists, launch, isMacBundle, macApps, findLinuxCommand, openWebLink, flathubId, installFlatpak } = require('./system');
const { isWindowsGame, isProtonDirectory, findProtonVersions, findWineVersions, latestGEProton, windowsRunner } = require('./proton');
const linuxStores = require('./linux-stores');
const steamProton = require('./steam-proton');
const { browseSteam, steamAssets, lookupGame, cleanTitle, featuredSteamArt } = require('./game-info');
const { romArtwork } = require('./rom-art');
const { loginFlag, setTvLogin } = require('./tv-startup');
const { version, updateRepository } = require('../package.json');

const { languageFor, translator } = require('./i18n');
const systemLocale = () => app.getPreferredSystemLanguages?.()[0] || app.getLocale?.() || 'pt-BR';
const translate = (message, values) => translator(systemLocale())(message, values);

const { createUpdater } = require('./app-update');
const updater = createUpdater({ app, shell, version, repository: updateRepository });

const platform = process.platform;
const storeDownload = ({ id, windowsUrl, linuxUrl, website }) =>
  platform === 'win32' ? windowsUrl : platform === 'darwin' ? (macApps[id] ? website || windowsUrl : '') : linuxUrl;
const runnable = async file => await fileExists(file) || (platform === 'darwin' && await isMacBundle(file));
const emptyData = () => ({
  games: [], roms: [], apps: {}, favorites: [], played: {}, featured: null, customStores: [],
  gameCovers: {}, gameBackdrops: {}, gameDetails: {}, steamPrograms: [],
  gameProton: {}, protonFolders: [],
  tv: { openOnLaunch: false, atLogin: false, layout: 'cinema', layoutRevision: 1 },
  dolphinPassthrough: false
});
let data = emptyData();
const windows = new Map();
let detected = {};
let installedGames = [];
let installedPrograms = [];
const steamItems = new Map();
const romAssets = new Map();
const executableIcons = new Map();
let pendingWrite = Promise.resolve();
let pendingScan;
const storeCatalogs = new Map();
const storeOperations = new Set();
const gameSetups = new WeakMap();

async function loadData() {
  const file = path.join(app.getPath('userData'), 'library.json');
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    data = { ...emptyData(), ...saved };
    const defaults = emptyData().tv;
    const tv = saved.tv;
    data.tv = {
      ...defaults,
      openOnLaunch: Boolean(tv?.openOnLaunch),
      atLogin: Boolean(tv?.atLogin),
      layout: tv?.layoutRevision === defaults.layoutRevision && ['cockpit', 'gallery'].includes(tv.layout) ? tv.layout : 'cinema'
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function updateData(change) {
  const next = pendingWrite.then(async () => {
    const copy = structuredClone(data);
    change(copy);
    const file = path.join(app.getPath('userData'), 'library.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(copy, null, 2), 'utf8');
    await fs.rename(file + '.tmp', file);
    data = copy;
  });
  pendingWrite = next.catch(() => {});
  return next;
}

function catalog() {
  const steamTools = installedPrograms.filter(item => item.appId !== '1905180').map(item => ({
    ...item, category: 'Ferramentas', description: 'Aplicativo instalado pela Steam.', steamAppId: item.appId
  }));
  return [...stores, ...steamTools, ...data.customStores.map(store => ({
    ...store, category: 'Lojas', description: 'Atalho para o executável escolhido.', userAdded: true
  }))];
}

function getStore(id) {
  const store = catalog().find(item => item.id === id);
  if (!store) throw new Error('Aplicativo desconhecido.');
  return store;
}

function getGame(id) {
  const game = [...data.games, ...installedGames, ...data.roms].find(item => item.id === id);
  if (!game) throw new Error('Jogo não encontrado. Atualize a biblioteca.');
  return game;
}

async function refreshRomArtwork() {
  const queue = data.roms.filter(game => !romAssets.has(game.id));
  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, async () => {
    for (let game = queue.shift(); game; game = queue.shift()) {
      romAssets.set(game.id, await romArtwork(game));
    }
  }));
}

async function readExecutableIcons(apps) {
  if (platform !== 'win32' || typeof app.getFileIcon !== 'function') return;
  await Promise.all(Object.values(apps).filter(target => target?.file && !target.args.length && !executableIcons.has(target.file))
    .map(async target => {
      try {
        const icon = await app.getFileIcon(target.file, { size: 'large' });
        if (!icon.isEmpty()) executableIcons.set(target.file, icon.toDataURL());
      } catch {}
    }));
}

function scan() {
  if (!pendingScan) {
    pendingScan = (async () => {
      const roots = await getSteamRoots(platform, process.env, os.homedir());
      if (data.apps.steam) roots.unshift(path.dirname(data.apps.steam));
      const [apps, steam] = await Promise.all([
        detectStores(catalog(), platform, process.env, data, roots),
        steamGames(roots),
        refreshRomArtwork()
      ]);
      await readExecutableIcons(apps);
      const missing = steam.map(game => game.appId).filter(id => !steamItems.has(id));
      for (const item of await browseSteam(missing, languageFor(systemLocale()))) steamItems.set(String(item.appid), item);
      const software = new Set([...data.steamPrograms, '1905180']);
      const oldSize = software.size;
      for (const game of steam) {
        if ([6, 13].includes(steamItems.get(game.appId)?.app_type)) software.add(game.appId);
      }
      if (software.size > oldSize) await updateData(copy => { copy.steamPrograms = [...software]; });
      const visible = steam.filter(game => game.appId !== '228980' &&
        !/^(Steam Linux Runtime|Steamworks Common Redistributables|Proton (?:Experimental|Hotfix|\d))/i.test(game.name));
      installedPrograms = visible.filter(game => software.has(game.appId));
      installedGames = visible.filter(game => !software.has(game.appId) &&
        [0, 1, 2, 12].includes(steamItems.get(game.appId)?.app_type ?? 0));
      detected = apps;
    })().finally(() => { pendingScan = undefined; });
  }
  return pendingScan;
}

function state() {
  const gameState = ({ id, appId, name, source, emulator, store }) => {
    const online = data.gameDetails[id];
    const steam = steamAssets(steamItems.get(appId));
    const rom = romAssets.get(id);
    return {
      id, appId, name: rom?.name || name, source, emulator, system: rom?.system, discId: rom?.id,
      canUseProton: platform === 'linux' && !emulator,
      canEditSetup: platform === 'linux' && !appId && !emulator && !store,
      artwork: [...(rom?.art || []), rom && online?.cover, ...featuredSteamArt(appId), steam.cover, online?.coverFallback].filter(Boolean),
      screens: rom?.screens,
      favorite: data.favorites.includes(id), lastPlayed: data.played[id] || 0,
      customCover: Boolean(data.gameCovers[id]), cover: data.gameCovers[id] || (!rom && online?.cover) || steam.cover,
      hero: online?.hero || steam.hero, steamHero: steam.hero, customBackdrop: data.gameBackdrops[id], info: online
    };
  };
  return {
    platform,
    games: [...data.games, ...installedGames].map(gameState),
    roms: data.roms.map(gameState),
    featured: data.featured,
    tv: { ...data.tv, loginLaunch: process.argv.includes(loginFlag) ||
      (platform === 'darwin' && data.tv.atLogin && app.getLoginItemSettings().wasOpenedAtLogin) },
    dolphinPassthrough: data.dolphinPassthrough,
    stores: catalog().map(({ id, name, category, description, icon, windowsUrl, linuxUrl, website, systems, userAdded, steamAppId }) => {
      const download = storeDownload({ id, windowsUrl, linuxUrl, website });
      const fromSteam = steamAppId || (id === 'obs' && installedPrograms.some(item => item.appId === '1905180'));
      return {
        id, name: userAdded ? name : translate(name), category, description: translate(description), icon, systems: translate(systems), userAdded, installed: Boolean(detected[id] || fromSteam),
        executableIcon: executableIcons.get(detected[id]?.file),
        custom: Boolean(data.apps[id]), available: Boolean(download), website: Boolean(website || download),
        canInstallFlatpak: platform === 'linux' && Boolean(flathubId(download)),
        downloadSource: fromSteam && !detected[id] ? 'Steam' : download?.startsWith('https://flathub.org/') ? 'Flathub' : translate('Site oficial')
      };
    })
  };
}

async function selectExecutable(window, title = 'Selecionar executável', allowWindowsGame = false) {
  const options = {
    properties: ['openFile', 'dontAddToRecent'],
    title: translate(title)
  };
  if (platform === 'win32') options.filters = [{ name: translate('Aplicativos do Windows'), extensions: ['exe'] }];
  const selection = await dialog.showOpenDialog(window, options);
  if (selection.canceled) return null;
  const file = selection.filePaths[0];
  if (!await runnable(file)) throw new Error('Selecione um arquivo executável válido.');
  if (platform === 'win32' && path.extname(file).toLowerCase() !== '.exe') {
    throw new Error('Selecione um aplicativo com extensão .exe.');
  }
  if (platform === 'linux' && !(allowWindowsGame && /\.exe$/i.test(file))) {
    await fs.access(file, constants.X_OK).catch(() => {
      throw new Error('O arquivo selecionado precisa ter permissão de execução.');
    });
  }
  return file;
}

function samePath(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string') return false;
  return platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    width: Math.min(1480, width - 24), height: Math.min(985, height - 24),
    minWidth: 760, minHeight: 560, show: false, frame: false,
    backgroundColor: '#1c0811', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', platform === 'win32' ? 'pera-mark.ico' : 'pera-mark.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  windows.set(window.webContents.id, window);
  const id = window.webContents.id;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => windows.delete(id));
  window.on('maximize', () => window.webContents.send('maximized', true));
  window.on('unmaximize', () => window.webContents.send('maximized', false));
  window.once('ready-to-show', () => window.show());
  return window.loadFile(path.join(__dirname, 'index.html'));
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, argument) => {
    const window = windows.get(event.sender.id);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Origem inválida.');
    try {
      return { ok: true, value: await action(argument, window) };
    } catch (error) {
      return { ok: false, message: translate(error.message || 'A operação falhou.') };
    }
  });
}

handle('window:control', (action, window) => {
  if (action === 'minimize') window.minimize();
  if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  if (action === 'theater-enter' && !window.isFullScreen()) window.setFullScreen(true);
  if (action === 'theater-exit' && window.isFullScreen()) window.setFullScreen(false);
  if (action === 'close') setImmediate(() => window.close());
});

handle('catalog:refresh', async () => { await scan(); return state(); });
handle('app:locale', systemLocale);
handle('app:update-check', updater.check);
handle('app:update-open', updater.open);
handle('app:update-install', updater.install);
handle('tv:layout', async layout => {
  if (!['cockpit', 'cinema', 'gallery'].includes(layout)) throw new Error('Layout do Modo TV inválido.');
  await updateData(copy => { copy.tv.layout = layout; });
  return state();
});
handle('tv:settings', async settings => {
  const tv = { openOnLaunch: Boolean(settings?.openOnLaunch), atLogin: Boolean(settings?.atLogin) };
  if (tv.atLogin !== data.tv.atLogin) await setTvLogin(app, platform, tv.atLogin);
  try {
    await updateData(copy => { copy.tv = { ...copy.tv, ...tv }; });
  } catch (error) {
    if (tv.atLogin !== data.tv.atLogin) await setTvLogin(app, platform, data.tv.atLogin).catch(() => {});
    throw error;
  }
  return state();
});
handle('dolphin:passthrough', async enabled => {
  await updateData(copy => { copy.dolphinPassthrough = enabled === true; });
  return state();
});
handle('store:download', async id => {
  const store = getStore(id);
  const url = storeDownload(store);
  if (!url) throw new Error('Este aplicativo não está disponível para o seu sistema.');
  const appId = platform === 'linux' && flathubId(url);
  if (appId) {
    try { await installFlatpak(appId); }
    catch { throw new Error(translate('O Flatpak não conseguiu instalar {id}.', { id: appId })); }
    await scan();
    return state();
  }
  try { await openWebLink(url, shell); }
  catch { throw new Error('Não foi possível abrir o navegador do sistema. Verifique o navegador padrão.'); }
});
handle('store:website', async id => {
  const store = getStore(id);
  const url = store.website || (platform === 'win32' ? store.windowsUrl : store.linuxUrl);
  if (url) {
    try { await openWebLink(url, shell); }
    catch { throw new Error('Não foi possível abrir o navegador do sistema. Verifique o navegador padrão.'); }
  }
});
handle('store:copy-link', id => {
  const store = getStore(id);
  const url = storeDownload(store) || store.website;
  if (url) clipboard.writeText(url);
});
const linuxStore = provider => linuxStores.storeConfig(provider, app.getPath('userData'));
async function refreshLinuxLibrary(provider, config) {
  const games = await linuxStores.library(provider, config);
  const installed = new Set(data.games.filter(game => game.store === provider).map(game => game.storeId));
  const entries = games.map(game => ({
    ...game, installed: Boolean(game.installed || (provider === 'gog' && installed.has(game.id)))
  })).sort((a, b) => a.name.localeCompare(b.name));
  storeCatalogs.set(provider, new Map(entries.map(game => [game.id, game])));
  if (provider === 'epic') {
    const added = entries.filter(game => game.installed && !installed.has(game.id));
    if (added.length) await updateData(copy => {
      copy.games.push(...added.map(game => ({
        id: 'epic-' + game.id, name: game.name, source: 'Epic Games', store: provider, storeId: game.id
      })));
    });
  }
  return entries;
}

async function withStore(provider, action) {
  if (storeOperations.has(provider)) throw new Error('Aguarde a operação atual desta loja.');
  storeOperations.add(provider);
  try { return await action(await linuxStore(provider)); }
  finally { storeOperations.delete(provider); }
}

handle('linux-store:info', async provider => ({ ready: (await linuxStore(provider)).ready }));
handle('linux-store:open', async ({ provider, setup }) => {
  const config = await linuxStore(provider);
  return openWebLink(setup ? config.setup : config.login, shell);
});
handle('linux-store:library', provider => withStore(provider, config => refreshLinuxLibrary(provider, config)));
handle('linux-store:connect', ({ provider, code }) => withStore(provider, async config => {
  await linuxStores.connect(provider, config, code);
  return refreshLinuxLibrary(provider, config);
}));
handle('linux-store:install', async ({ provider, id }, window) => withStore(provider, async config => {
  const entry = storeCatalogs.get(provider)?.get(id);
  if (!config.ready || !entry || !linuxStores.storeGameId(provider, id)) throw new Error('Atualize a biblioteca da loja e selecione um jogo.');
  const previous = data.games.find(game => game.store === provider && game.storeId === id);
  let folder = previous?.installBase;
  if (!entry.installed || (provider === 'gog' && !folder)) {
    const result = await dialog.showOpenDialog(window, {
      title: translate('Selecionar pasta de instalação'), properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) return null;
    folder = provider === 'gog' ? path.join(result.filePaths[0], 'GOG-' + id) : result.filePaths[0];
  }
  const gameFolder = await linuxStores.install(provider, config, id, folder);
  if (provider === 'gog') await updateData(copy => {
    const next = { id: 'gog-' + id, name: entry.name, source: 'GOG', store: provider, storeId: id, installBase: folder, installFolder: gameFolder };
    const index = copy.games.findIndex(game => game.id === next.id);
    if (index === -1) copy.games.push(next);
    else copy.games[index] = next;
  });
  return refreshLinuxLibrary(provider, config);
}));
handle('store:open', async id => {
  const store = getStore(id);
  await scan();
  const target = detected[id];
  const steamId = store.steamAppId || (id === 'obs' && installedPrograms.some(game => game.appId === '1905180') ? '1905180' : '');
  if (!target && steamId && detected.steam) return launch(detected.steam.file, [...detected.steam.args, '-applaunch', steamId]);
  if (!target) throw new Error('Aplicativo não detectado. Atualize a lista ou vincule seu executável.');
  if (id === 'dolphin') {
    await launch(target.file, target.args, { visible: true });
    return;
  }
  await launch(target.file, target.args);
});
handle('store:link', async (id, window) => {
  const store = getStore(id);
  const available = storeDownload(store);
  if (!available && !store.userAdded) throw new Error('Este aplicativo não está disponível para o seu sistema.');
  const file = await selectExecutable(window);
  if (file) await updateData(copy => { copy.apps[id] = file; });
  await scan();
  return state();
});
handle('store:unlink', async id => {
  const store = getStore(id);
  await updateData(copy => {
    delete copy.apps[id];
    if (store.userAdded) copy.customStores = copy.customStores.filter(item => item.id !== id);
  });
  await scan();
  return state();
});
handle('store:add-custom', async (_, window) => {
  const file = await selectExecutable(window);
  if (!file) return undefined;
  await updateData(copy => {
    if (Object.values(copy.apps).some(saved => samePath(saved, file))) {
      throw new Error('Este executável já está vinculado a um aplicativo.');
    }
    const id = randomUUID();
    copy.customStores.push({ id, name: path.parse(file).name });
    copy.apps[id] = file;
  });
  await scan();
  return state();
});

handle('game:add', async (_, window) => {
  const file = await selectExecutable(window, 'Selecionar executável', true);
  if (file) {
    await updateData(copy => {
      if (copy.games.some(game => samePath(game.file, file))) throw new Error('Este jogo já está na biblioteca.');
      copy.games.push({ id: randomUUID(), file, name: path.parse(file).name, source: 'Local' });
    });
  }
  return state();
});
function protonGame(id, includeSteam = true) {
  const game = getGame(id);
  if (platform !== 'linux' || game.emulator || (!includeSteam && game.appId)) {
    throw new Error('A configuração de Proton está disponível no Linux.');
  }
  return game;
}

async function steamProtonConfig() {
  const roots = await getSteamRoots(platform, process.env, os.homedir());
  return steamProton.findSteamConfig(roots, Boolean(detected.steam?.args.includes('com.valvesoftware.Steam')));
}

async function localRunners() {
  const home = os.homedir();
  const steamRoots = await getSteamRoots(platform, process.env, home);
  if (data.apps.steam) steamRoots.unshift(path.dirname(data.apps.steam));
  const [proton, wine, umu] = await Promise.all([
    findProtonVersions({ home, steamRoots, custom: data.protonFolders }),
    findWineVersions(home),
    findLinuxCommand('umu-run', process.env)
  ]);
  return { versions: [...proton, ...wine], umu: Boolean(umu) };
}

async function protonSettings(id) {
  const game = protonGame(id);
  if (game.appId) {
    const config = await steamProtonConfig();
    const tools = await steamProton.listSteamTools(config.root);
    if (!tools.some(tool => tool.id === 'proton_experimental')) tools.unshift({ id: 'proton_experimental', name: 'Proton Experimental' });
    return { steam: true, proton: steamProton.readSteamChoice(config.text, game.appId),
      versions: tools.map(({ id, name }) => ({ path: id, name })) };
  }
  return {
    ...await localRunners(), canChooseExecutable: !isWindowsGame(game),
    ...data.gameProton[id]
  };
}

const defaultWinePrefix = id => path.join(app.getPath('userData'), 'prefixes', id);

function getGameSetup(window) {
  const setup = gameSetups.get(window);
  if (platform !== 'linux' || !setup) throw new Error('Abra Adicionar jogo para configurar o aplicativo.');
  return setup;
}

async function chooseWindowsExecutable(window, title, defaultPath) {
  const result = await dialog.showOpenDialog(window, {
    title: translate(title), defaultPath, properties: ['openFile'],
    filters: [{ name: translate('Aplicativos do Windows'), extensions: ['exe'] }]
  });
  if (result.canceled) return;
  const file = result.filePaths[0];
  if (!/\.exe$/i.test(file) || !await fileExists(file)) throw new Error('Selecione um aplicativo com extensão .exe.');
  return file;
}

async function setupRunner(selection, prefix) {
  const { versions } = await localRunners();
  if (selection !== 'GE-Proton' && !versions.some(version => version.path === selection)) {
    throw new Error('A versão selecionada do Proton ou Wine não foi encontrada.');
  }
  return windowsRunner(selection, prefix, os.homedir());
}

function gameSetupView(setup, windows) {
  return { ...setup, file: windows ? setup.windowsFile : setup.linuxFile };
}

async function withLaunchTools(file, args, game) {
  const tools = [['mangohud', game.mangoHud], ['gamemoderun', game.gameMode]];
  for (const [name, enabled] of tools) {
    if (!enabled) continue;
    const wrapper = await findLinuxCommand(name, process.env);
    if (!wrapper) throw new Error(translate('O programa {name} está ativado neste jogo, mas não foi encontrado.', { name }));
    args = [file, ...args];
    file = wrapper;
  }
  return { file, args };
}

handle('game-setup:start', async (id, window) => {
  if (platform !== 'linux') throw new Error('A configuração de Proton está disponível no Linux.');
  const game = id ? getGame(id) : null;
  if (game && (game.appId || game.emulator || game.store)) throw new Error('Este jogo tem configurações gerenciadas pela sua biblioteca de origem.');
  const setup = { id: game?.id || randomUUID(), edit: Boolean(game) };
  setup.defaultPrefix = defaultWinePrefix(setup.id);
  if (game) {
    const compatibility = data.gameProton[game.id] || {};
    setup.title = game.name;
    setup.linuxFile = isWindowsGame(game) ? undefined : game.file;
    setup.windowsFile = compatibility.executable || (isWindowsGame(game) ? game.file : undefined);
    setup.prefix = compatibility.prefix;
    setup.cover = data.gameCovers[game.id];
    setup.selectedRunner = compatibility.proton;
    setup.argumentsText = (game.args || []).join('\n');
    setup.mangoHud = game.mangoHud;
    setup.gameMode = game.gameMode;
  }
  gameSetups.set(window, setup);
  const windows = !game || Boolean(setup.windowsFile);
  return { ...gameSetupView(setup, windows), windows, ...await localRunners() };
});
handle('game-setup:pick', async ({ kind, windows }, window) => {
  const setup = getGameSetup(window);
  if (kind === 'cover') {
    setup.cover = await pickImage(window, 'Escolher capa do jogo', 900) || setup.cover;
  } else if (kind === 'prefix') {
    const result = await dialog.showOpenDialog(window, {
      title: translate('Selecionar pasta do prefixo Wine'), properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled) {
      const folder = result.filePaths[0];
      if ((await fs.readdir(folder)).length && !await fileExists(path.join(folder, 'system.reg'))) {
        throw new Error('Escolha um prefixo Wine existente ou uma pasta vazia.');
      }
      setup.prefix = folder;
    }
  } else if (kind === 'proton') {
    const result = await dialog.showOpenDialog(window, {
      title: translate('Selecionar pasta do Proton'), properties: ['openDirectory']
    });
    if (!result.canceled) {
      const folder = result.filePaths[0];
      if (!await isProtonDirectory(folder)) throw new Error('Escolha a pasta que contém o arquivo proton.');
      await updateData(copy => { if (!copy.protonFolders.includes(folder)) copy.protonFolders.push(folder); });
      return { ...gameSetupView(setup, windows), ...await localRunners(), selectedRunner: folder };
    }
  } else if (kind === 'game') {
    const file = windows
      ? await chooseWindowsExecutable(window, 'Escolher executável do Windows', path.join(setup.prefix || setup.defaultPrefix, 'drive_c'))
      : await selectExecutable(window);
    if (file) setup[windows ? 'windowsFile' : 'linuxFile'] = file;
  }
  return gameSetupView(setup, windows);
});
handle('game-setup:install', async ({ runner }, window) => {
  const setup = getGameSetup(window);
  const selected = await setupRunner(runner, setup.prefix || setup.defaultPrefix);
  const installer = await chooseWindowsExecutable(window, 'Selecionar instalador do Windows');
  if (!installer) return gameSetupView(setup, true);
  if (!setup.prefix) await fs.mkdir(setup.defaultPrefix, { recursive: true });
  const cwd = path.dirname(installer);
  try { await launch(selected.file, [installer], { cwd, hostCwd: cwd, environment: selected.environment, wait: true }); }
  catch { throw new Error('O instalador do Windows não terminou normalmente.'); }
  setup.installed = true;
  return gameSetupView(setup, true);
});
handle('game-setup:save', async ({ title, windows, runner, argumentsText, mangoHud, gameMode }, window) => {
  const setup = getGameSetup(window);
  const file = windows ? setup.windowsFile : setup.linuxFile;
  if (!await fileExists(file)) throw new Error('Escolha o executável que deve abrir o jogo.');
  if (windows) {
    if (!/\.exe$/i.test(file)) throw new Error('Selecione um aplicativo com extensão .exe.');
    if (runner !== 'GE-Proton' && !(await localRunners()).versions.some(version => version.path === runner)) {
      throw new Error('A versão selecionada do Proton ou Wine não foi encontrada.');
    }
  } else {
    await fs.access(file, constants.X_OK).catch(() => { throw new Error('O arquivo selecionado precisa ter permissão de execução.'); });
  }
  await updateData(copy => {
    if (copy.games.some(game => game.id !== setup.id && samePath(game.file, file))) throw new Error('Este jogo já está na biblioteca.');
    const name = (typeof title === 'string' && title.trim().slice(0, 160)) || path.parse(file).name;
    const args = typeof argumentsText === 'string' ? argumentsText.slice(0, 2048).split(/\r?\n/).filter(arg => arg.trim() && !arg.includes('\0')) : [];
    const entry = { id: setup.id, file, name, source: 'Local', args, mangoHud: mangoHud === true, gameMode: gameMode === true };
    const index = copy.games.findIndex(game => game.id === setup.id);
    if (index === -1) {
      if (setup.edit) throw new Error('Jogo não encontrado. Atualize a biblioteca.');
      copy.games.push(entry);
    } else copy.games[index] = entry;
    if (setup.cover) copy.gameCovers[setup.id] = setup.cover;
    if (windows) copy.gameProton[setup.id] = { proton: runner, prefix: setup.prefix };
    else if (copy.gameProton[setup.id]) delete copy.gameProton[setup.id].executable;
  });
  gameSetups.delete(window);
  return state();
});

handle('proton:settings', protonSettings);
handle('proton:latest', id => { protonGame(id); return latestGEProton(); });
handle('proton:help', id => {
  protonGame(id, false);
  return openWebLink('https://github.com/Open-Wine-Components/umu-launcher#installation', shell);
});
handle('proton:add', async (id, window) => {
  const game = protonGame(id);
  const result = await dialog.showOpenDialog(window, {
    title: translate('Selecionar pasta do Proton'), properties: ['openDirectory']
  });
  if (result.canceled) return protonSettings(id);
  const folder = result.filePaths[0];
  if (!await isProtonDirectory(folder)) throw new Error('Escolha a pasta que contém o arquivo proton.');
  if (game.appId) {
    const config = await steamProtonConfig();
    const tool = await steamProton.addSteamTool(config.root, folder);
    await steamProton.saveSteamChoice(config, game.appId, tool);
    return protonSettings(id);
  }
  await updateData(copy => {
    if (!copy.protonFolders.includes(folder)) copy.protonFolders.push(folder);
    copy.gameProton[id] = { ...copy.gameProton[id], proton: folder };
  });
  return protonSettings(id);
});
handle('proton:save', async ({ id, proton }) => {
  const game = protonGame(id);
  const fallback = game.appId ? steamProton.defaultTool : 'GE-Proton';
  if (proton !== fallback && !(await protonSettings(id)).versions.some(version => version.path === proton)) {
    throw new Error('A versão selecionada do Proton não foi encontrada.');
  }
  if (game.appId) {
    await steamProton.saveSteamChoice(await steamProtonConfig(), game.appId, proton);
    return protonSettings(id);
  }
  await updateData(copy => { copy.gameProton[id] = { ...copy.gameProton[id], proton }; });
  return protonSettings(id);
});
handle('proton:prefix', async ({ id, reset }, window) => {
  protonGame(id, false);
  let prefix;
  if (!reset) {
    const result = await dialog.showOpenDialog(window, {
      title: translate('Selecionar prefixo Wine existente'), properties: ['openDirectory']
    });
    if (result.canceled) return protonSettings(id);
    const folder = result.filePaths[0];
    if (!await fileExists(path.join(folder, 'system.reg'))) throw new Error('Escolha a pasta do prefixo Wine que contém system.reg.');
    prefix = folder;
  }
  await updateData(copy => { copy.gameProton[id] = { ...copy.gameProton[id], prefix }; });
  return protonSettings(id);
});
handle('proton:executable', async ({ id, reset }, window) => {
  const game = protonGame(id, false);
  if (isWindowsGame(game)) throw new Error('Este jogo já tem um executável do Windows.');
  const executable = reset ? undefined : await chooseWindowsExecutable(window, 'Escolher executável do Windows');
  if (!reset && !executable) return protonSettings(id);
  await updateData(copy => { copy.gameProton[id] = { ...copy.gameProton[id], executable }; });
  return protonSettings(id);
});
handle('game:play', async (id, window) => {
  const game = getGame(id);
  const compatibility = data.gameProton[id] || {};
  if (game.emulator === 'android') {
    if (platform !== 'win32' || path.extname(game.file).toLowerCase() !== '.lnk') throw new Error('Este jogo precisa de um atalho do Windows.');
    if (!await fileExists(game.file)) throw new Error('O atalho do Android foi movido ou removido. Importe o atalho novamente.');
    const error = await shell.openPath(game.file);
    if (error) throw new Error('O Windows não abriu o atalho. Confira se o emulador e o jogo continuam instalados.');
  } else if (game.emulator) {
    if (!await fileExists(game.file)) throw new Error('O arquivo do jogo foi movido ou a unidade está desconectada.');
    if (game.core && !await fileExists(game.core)) throw new Error('O núcleo do RetroArch não foi encontrado. Reimporte a ROM com o núcleo correto.');
    if (!detected[game.emulator] || !await runnable(detected[game.emulator].file)) await scan();
    let target = detected[game.emulator];
    if (!target) {
      const name = getStore(game.emulator).name;
      const file = await selectExecutable(window, translator(systemLocale())('Selecionar o executável de {name}', { name }));
      if (!file) return state();
      await updateData(copy => { copy.apps[game.emulator] = file; });
      target = { file, args: [], custom: true };
      detected[game.emulator] = target;
      await readExecutableIcons({ [game.emulator]: target });
    }
    const system = romAssets.get(id)?.system;
    await launch(target.file, [...target.args, ...romArguments(game, { system, passthrough: data.dolphinPassthrough })],
      { visible: game.emulator === 'dolphin' });
  } else if (game.appId) {
    const steam = detected.steam;
    if (!steam) throw new Error('A Steam não foi detectada. Vincule o executável em Lojas.');
    if (platform === 'darwin') await shell.openExternal('steam://rungameid/' + game.appId);
    else await launch(steam.file, [...steam.args, '-applaunch', game.appId]);
  } else if (platform === 'linux' && (isWindowsGame(game) || compatibility.executable)) {
    const executable = compatibility.executable || game.file;
    if (!game.store && !await fileExists(executable)) throw new Error('O executável foi movido ou removido.');
    const { proton, prefix } = compatibility;
    const winePrefix = prefix || defaultWinePrefix(id);
    if (prefix && !await fs.stat(prefix).then(stats => stats.isDirectory(), () => false)) {
      throw new Error('O prefixo Wine selecionado não foi encontrado.');
    }
    const runner = await windowsRunner(proton, winePrefix, os.homedir());
    if (!prefix) await fs.mkdir(winePrefix, { recursive: true });
    if (game.store) {
      const config = await linuxStore(game.store);
      if (!config.ready) throw new Error('Instale o componente da loja para continuar.');
      await linuxStores.play(game.store, config, { id: game.storeId, folder: game.installFolder, umu: runner.file, environment: runner.environment });
    } else {
      const cwd = path.dirname(executable);
      const command = await withLaunchTools(runner.file, [executable, ...(game.args || [])], game);
      await launch(command.file, command.args, { cwd, hostCwd: cwd, environment: runner.environment });
    }
  } else if (platform === 'linux') {
    if (!await runnable(game.file)) throw new Error('O executável foi movido ou removido.');
    const cwd = path.dirname(game.file);
    const command = await withLaunchTools(game.file, game.args || [], game);
    await launch(command.file, command.args, { cwd, hostCwd: cwd });
  } else {
    if (!await runnable(game.file)) throw new Error('O executável foi movido ou removido.');
    await launch(game.file);
  }
  await updateData(copy => { copy.played[id] = Date.now(); });
  return state();
});
handle('game:favorite', async id => {
  getGame(id);
  await updateData(copy => {
    const favorites = new Set(copy.favorites);
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    copy.favorites = [...favorites];
  });
  return state();
});
handle('game:remove', async id => {
  if (getGame(id).appId) throw new Error('Jogos da Steam são sincronizados automaticamente.');
  await updateData(copy => {
    copy.games = copy.games.filter(game => game.id !== id);
    copy.roms = copy.roms.filter(game => game.id !== id);
    copy.favorites = copy.favorites.filter(gameId => gameId !== id);
    delete copy.played[id];
    delete copy.gameCovers[id];
    delete copy.gameBackdrops[id];
    delete copy.gameDetails[id];
    if (copy.featured?.gameId === id) copy.featured.gameId = '';
  });
  romAssets.delete(id);
  return state();
});
handle('feature:store', () => shell.openExternal('https://store.steampowered.com/app/1091500/Cyberpunk_2077/'));
async function pickImage(window, title, size, landscape = false) {
  const selection = await dialog.showOpenDialog(window, {
    title: translate(title),
    properties: ['openFile', 'dontAddToRecent'],
    filters: [{ name: translate('Imagens'), extensions: ['jpg', 'jpeg', 'png'] }]
  });
  if (selection.canceled) return null;
  const file = selection.filePaths[0];
  const stats = await fs.stat(file);
  if (!stats.isFile() || stats.size > 20 * 1024 * 1024) {
    throw new Error('Escolha uma imagem de até 20 MB.');
  }
  let image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error('Não consegui abrir esta imagem.');
  const { width, height } = image.getSize();
  if (landscape && (width < 900 || width / height < 1.5)) {
    throw new Error('Escolha uma imagem horizontal, de preferência 1920 × 1080.');
  }
  if (Math.max(width, height) > size) {
    image = image.resize(width >= height ? { width: size } : { height: size });
  }
  return 'data:image/jpeg;base64,' + image.toJPEG(83).toString('base64');
}
handle('feature:pick-art', (_, window) => pickImage(window, 'Escolher imagem para o destaque', 1600));
handle('game:cover', async (id, window) => {
  const game = getGame(id);
  const cover = await pickImage(window, 'Escolher capa do jogo', 900);
  if (cover) await updateData(copy => { copy.gameCovers[game.id] = cover; });
  return state();
});
handle('game:reset-cover', async id => {
  getGame(id);
  await updateData(copy => { delete copy.gameCovers[id]; });
  return state();
});
handle('game:backdrop', async (id, window) => {
  getGame(id);
  const backdrop = await pickImage(window, 'Escolher arte de fundo horizontal', 2560, true);
  if (backdrop) await updateData(copy => { copy.gameBackdrops[id] = backdrop; });
  return state();
});
handle('game:reset-backdrop', async id => {
  getGame(id);
  await updateData(copy => { delete copy.gameBackdrops[id]; });
  return state();
});
handle('game:lookup', async ({ id, query }) => {
  const game = getGame(id);
  const startingName = romAssets.get(id)?.name || game.name;
  const name = typeof query === 'string' ? query.trim().slice(0, 160) || startingName : startingName;
  const language = languageFor(systemLocale());
  const info = await lookupGame({ ...game, name }, steamItems.get(game.appId), language);
  if (!info) throw new Error('Não encontrei uma correspondência segura. Você pode preencher a sinopse manualmente.');
  await updateData(copy => {
    const previous = copy.gameDetails[id];
    copy.gameDetails[id] = { ...info, language, customDescription: previous?.customDescription };
  });
  return state();
});
handle('game:cover-search', async ({ id, query }) => {
  const game = getGame(id);
  const name = typeof query === 'string' ? query.trim().slice(0, 160) || game.name : game.name;
  const params = new URLSearchParams({ tbm: 'isch', q: name + ' video game box art cover' });
  await shell.openExternal('https://www.google.com/search?' + params);
});
handle('game:save-info', async ({ id, description }) => {
  getGame(id);
  if (typeof description !== 'string') throw new Error('Sinopse inválida.');
  await updateData(copy => {
    copy.gameDetails[id] = { ...copy.gameDetails[id], customDescription: description.trim().slice(0, 2000) };
  });
  return state();
});
handle('game:info-source', async id => {
  getGame(id);
  const url = data.gameDetails[id]?.url;
  if (/^https:\/\/(?:store\.steampowered\.com\/app\/\d+\/|(?:pt|en)\.wikipedia\.org\/\?curid=\d+)$/.test(url)) {
    await shell.openExternal(url);
  }
});
handle('rom:add', async ({ emulator, folder }, window) => {
  if (!Object.hasOwn(romFormats, emulator)) throw new Error('Escolha um emulador para importar os jogos.');
  const extensions = romFormats[emulator];
  const android = emulator === 'android';
  if (android && platform !== 'win32') throw new Error('Atalhos de jogos Android estão disponíveis no Windows.');
  const selection = await dialog.showOpenDialog(window, {
    title: translate(android ? (folder ? 'Selecionar pasta com atalhos Android' : 'Selecionar atalhos dos jogos Android') :
      (folder ? 'Selecionar pasta de ROMs' : 'Selecionar arquivos de jogos')),
    properties: folder ? ['openDirectory', 'dontAddToRecent'] : ['openFile', 'multiSelections', 'dontAddToRecent'],
    ...(folder ? {} : { filters: [{ name: translate(android ? 'Atalhos do Windows' : 'Jogos compatíveis'), extensions }] })
  });
  if (selection.canceled) return undefined;
  let candidates = selection.filePaths;
  if (folder) {
    const root = candidates[0];
    const entries = await fs.readdir(root, { withFileTypes: true });
    candidates = entries.filter(entry => entry.isFile()).map(entry => path.join(root, entry.name));
  }
  const files = [];
  for (const file of candidates) {
    if (extensions.includes(path.extname(file).slice(1).toLowerCase()) && await fileExists(file)) files.push(file);
  }
  if (!files.length) throw new Error('Nenhum jogo compatível foi encontrado na seleção.');
  let core;
  if (emulator === 'retroarch') {
    const extension = platform === 'win32' ? 'dll' : 'so';
    const choice = await dialog.showOpenDialog(window, {
      title: translate('Selecionar núcleo instalado do RetroArch'),
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: translate('Núcleo do RetroArch'), extensions: [extension] }]
    });
    if (choice.canceled) return undefined;
    core = choice.filePaths[0];
    if (!await fileExists(core) || path.extname(core).toLowerCase() !== '.' + extension) {
      throw new Error('Selecione um núcleo válido do RetroArch.');
    }
  }
  await updateData(copy => {
    for (const file of files) {
      const existing = copy.roms.find(game => game.emulator === emulator && samePath(game.file, file));
      if (existing) {
        if (core) existing.core = core;
        continue;
      }
      const name = cleanTitle(path.parse(file).name) || path.parse(file).name;
      copy.roms.push({ id: randomUUID(), file, core, emulator, name, source: android ? 'Android' : 'ROM' });
    }
  });
  await refreshRomArtwork();
  return state();
});
handle('feature:save', async settings => {
  const gameId = typeof settings?.gameId === 'string' ? settings.gameId : '';
  if (gameId) getGame(gameId);
  const title = typeof settings?.title === 'string' ? settings.title.trim().slice(0, 100) : '';
  const art = settings?.art || '';
  if (typeof art !== 'string' || art.length > 3_000_000 || (art && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(art))) {
    throw new Error('Imagem de destaque inválida.');
  }
  await updateData(copy => { copy.featured = gameId || title || art ? { gameId, title, art } : null; });
  return state();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    await loadData();
    await createWindow();
  }).catch(error => {
    dialog.showErrorBox('PeraGames', 'Falha ao iniciar: ' + error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}

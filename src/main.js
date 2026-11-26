'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, safeStorage, screen, shell } = require('electron');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { stores, romFormats, romArguments } = require('./catalog');
const { getSteamRoots, steamGames, steamDownloads, detectStores, fileExists, launch, isMacBundle, macApps, findLinuxCommand,
  openWebLink, flathubId, installFlatpak, openLinuxSoftware, runHostTool } = require('./system');
const { isWindowsGame, isProtonDirectory, findProtonVersions, findWineVersions, latestGEProton, windowsRunner } = require('./proton');
const linuxStores = require('./linux-stores');
const { releaseAsset, setupStoreTool } = require('./store-tools');
const steamProton = require('./steam-proton');
const protonCatalog = require('./proton-catalog');
const { findUmu, ensureUmu } = require('./umu');
const { steamAccountGames } = require('./steam-account');
const { browseSteam, steamAssets, lookupGame, cleanTitle, titleKey, featuredSteamArt } = require('./game-info');
const { getCompatibility, protonDBPage } = require('./game-compatibility');
const { createDownloads, createSteamDownloadTracker } = require('./downloads');
const { findGridCover, preferencesUrl, verifyGridKey } = require('./steamgriddb');
const { romArtwork } = require('./rom-art');
const { loginFlag, setTvLogin } = require('./tv-startup');
const { version, updateRepository } = require('../package.json');

const { languageFor, translator } = require('./i18n');
const systemLocale = () => data.preferences.locale === 'system'
  ? app.getPreferredSystemLanguages?.()[0] || app.getLocale?.() || 'pt-BR' : data.preferences.locale;
const translate = (message, values) => translator(systemLocale())(message, values);

const { createUpdater } = require('./app-update');
const updater = createUpdater({ app, shell, version, repository: updateRepository });

const platform = process.platform;
const windowsLaunchers = new Set(['epic', 'gog', 'amazon', 'battle', 'ea', 'ubisoft']);
const managedProtonRoot = () => path.join(app.getPath('userData'), 'proton');
const managedUmuRoot = () => path.join(app.getPath('userData'), 'umu');
const isAmazonInstaller = file => /^amazongamessetup(?: ?\(\d+\))?\.exe$/i.test(path.basename(file || ''));
const storeDownload = ({ id, windowsUrl, linuxUrl, website }) =>
  platform === 'win32' ? windowsUrl : platform === 'darwin' ? (macApps[id] ? website || windowsUrl : '') : linuxUrl;
const runnable = async file => await fileExists(file) || (platform === 'darwin' && await isMacBundle(file));
const defaultPreferences = { locale: 'system', zoom: 100, motion: false, titles: false, color: false, installDirectory: '' };
const emptyData = () => ({
  games: [], roms: [], apps: {}, favorites: [], played: {}, featured: null, customStores: [],
  gameCovers: {}, gameBackdrops: {}, gameDetails: {}, steamPrograms: [],
  gridCovers: {},
  preferences: { ...defaultPreferences },
  gameProton: {}, protonFolders: [], ownedStoreGames: {}, storeTools: {},
  tv: { openOnLaunch: false, atLogin: false, layout: 'cinema', layoutRevision: 1, showUninstalled: true },
  dolphinPassthrough: false
});
let data = emptyData();
let gridKey = '';
let steamKey = '';
const canSaveSecret = async () => await safeStorage?.isAsyncEncryptionAvailable() &&
  (platform !== 'linux' || !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()));
const windows = new Map();
function broadcast(channel, value) {
  for (const window of windows.values()) if (!window.isDestroyed()) window.webContents.send(channel, value);
}
const downloads = createDownloads(jobs => broadcast('downloads:changed', jobs));
const steamDownloadTracker = createSteamDownloadTracker();
const recentSteamLaunches = new Set();
let steamWatch;
let pendingSteamProgress;
let detected = {};
let installedGames = [];
let installedPrograms = [];
const steamItems = new Map();
const romAssets = new Map();
const executableIcons = new Map();
let pendingWrite = Promise.resolve();
let pendingScan;
const storeOperations = new Set();
const gameSetups = new WeakMap();

async function loadData() {
  const file = path.join(app.getPath('userData'), 'library.json');
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    data = { ...emptyData(), ...saved };
    data.preferences = { ...defaultPreferences, ...saved.preferences };
    if ((saved.gridKey || saved.steamKey) && await canSaveSecret()) {
      if (typeof saved.gridKey === 'string') {
        try { ({ result: gridKey } = await safeStorage.decryptStringAsync(Buffer.from(saved.gridKey, 'base64'))); } catch {}
      }
      if (typeof saved.steamKey === 'string') {
        try { ({ result: steamKey } = await safeStorage.decryptStringAsync(Buffer.from(saved.steamKey, 'base64'))); } catch {}
      }
    }
    const defaults = emptyData().tv;
    const tv = saved.tv;
    data.tv = {
      ...defaults,
      openOnLaunch: Boolean(tv?.openOnLaunch),
      atLogin: Boolean(tv?.atLogin),
      showUninstalled: tv?.showUninstalled !== false,
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

const storeLauncher = id => data.games.find(game => game.launcher === id);

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
  const gameState = ({ id, appId, name, source, emulator, store, storeId, file }) => {
    const online = data.gameDetails[id];
    const steam = steamAssets(steamItems.get(appId));
    const rom = romAssets.get(id);
    return {
      id, appId, name: rom?.name || name, source, emulator, system: rom?.system, discId: rom?.id,
      origin: appId ? 'steam' : store || (/\.exe$/i.test(file || '') || data.gameProton[id]?.executable ? 'exe' : 'local'),
      canUseProton: platform === 'linux' && !emulator,
      canEditSetup: platform === 'linux' && !appId && !emulator && !store,
      artwork: [...(rom?.art || []), rom && online?.cover, ...featuredSteamArt(appId), steam.cover, online?.coverFallback].filter(Boolean),
      screens: rom?.screens,
      gridCover: data.gridCovers[id]?.url,
      favorite: data.favorites.includes(id), lastPlayed: data.played[id] || 0,
      customCover: Boolean(data.gameCovers[id]), cover: data.gameCovers[id] || (!rom && online?.cover) || steam.cover ||
        (store && data.ownedStoreGames[store]?.find(game => game.id === storeId)?.cover),
      hero: online?.hero || steam.hero, steamHero: steam.hero, customBackdrop: data.gameBackdrops[id], info: online
    };
  };
  const ownedStoreGames = { ...data.ownedStoreGames };
  if (ownedStoreGames.steam) {
    const installed = new Set([...installedGames, ...installedPrograms].map(game => game.appId));
    ownedStoreGames.steam = ownedStoreGames.steam.map(game => ({ ...game, installed: installed.has(game.appId) }));
  }
  return {
    platform,
    gridConfigured: Boolean(gridKey),
    gridKeySaved: Boolean(gridKey && data.gridKey),
    games: [...data.games.filter(game => !game.launcher), ...installedGames].map(gameState),
    ownedStoreGames,
    preferences: data.preferences,
    roms: data.roms.map(gameState),
    featured: data.featured,
    tv: { ...data.tv, loginLaunch: process.argv.includes(loginFlag) ||
      (platform === 'darwin' && data.tv.atLogin && app.getLoginItemSettings().wasOpenedAtLogin) },
    dolphinPassthrough: data.dolphinPassthrough,
    stores: catalog().filter(item => item.id !== 'wine' || platform === 'linux')
      .map(({ id, name, category, description, icon, windowsUrl, linuxUrl, website, systems, userAdded, steamAppId }) => {
      const download = storeDownload({ id, windowsUrl, linuxUrl, website });
      const launcher = storeLauncher(id);
      const fromSteam = steamAppId || (id === 'obs' && installedPrograms.some(item => item.appId === '1905180'));
      return {
        id, name: userAdded ? name : translate(name), category, description: translate(description), icon, systems: translate(systems), userAdded, installed: Boolean(launcher || detected[id] || fromSteam),
        executableIcon: executableIcons.get(detected[id]?.file),
        custom: Boolean(data.apps[id]), available: Boolean(download), website: Boolean(website || download),
        windowsShortcut: platform === 'linux' && !launcher && /\.exe$/i.test(data.apps[id] || ''),
        windowsSetup: platform === 'linux' && (windowsLaunchers.has(id) || userAdded && /\.exe$/i.test(data.apps[id] || '')),
        windowsInstaller: platform === 'linux' && windowsLaunchers.has(id) && Boolean(windowsUrl),
        configuredLauncher: Boolean(launcher),
        amazonInstaller: platform === 'linux' && isAmazonInstaller(data.apps[id]),
        canInstallFlatpak: platform === 'linux' && Boolean(flathubId(download)),
        downloadSource: fromSteam && !detected[id] ? 'Steam' : id === 'wine' ? translate('Loja do Linux') :
          download?.startsWith('https://flathub.org/') ? 'Flathub' : translate('Site oficial')
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false,
      zoomFactor: data.preferences.zoom / 100 }
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
  if (action === 'reload') setImmediate(() => window.webContents.reload());
});

handle('catalog:refresh', async () => { await scan(); return state(); });
handle('app:locale', systemLocale);
handle('app:preferences', async ({ locale, zoom, motion, titles, color }, window) => {
  if (!['system', 'pt-BR', 'en'].includes(locale) || !Number.isInteger(zoom) || zoom < 60 || zoom > 200) {
    throw new Error('Configurações inválidas.');
  }
  await updateData(copy => {
    Object.assign(copy.preferences, { locale, zoom, motion: motion === true, titles: titles === true, color: color === true });
  });
  window.webContents.setZoomFactor(zoom / 100);
  return state();
});
handle('app:install-directory', async (reset, window) => {
  if (!reset) {
    const result = await dialog.showOpenDialog(window, {
      title: translate('Pasta padrão de instalação'), properties: ['openDirectory', 'createDirectory'],
      defaultPath: data.preferences.installDirectory || undefined
    });
    if (result.canceled) return;
    await updateData(copy => { copy.preferences.installDirectory = result.filePaths[0]; });
  } else await updateData(copy => { copy.preferences.installDirectory = ''; });
  return state();
});
function systemReport() {
  return {
    system: os.type() + ' ' + os.release() + ' · ' + process.arch,
    processor: os.cpus()[0]?.model || '',
    memory: (os.totalmem() / (1024 ** 3)).toFixed(1) + ' GiB',
    version
  };
}
handle('app:diagnostics', systemReport);
handle('app:copy-diagnostics', () => {
  const report = systemReport();
  clipboard.writeText([
    'PeraGames ' + report.version, report.system, 'CPU: ' + report.processor, 'RAM: ' + report.memory
  ].join('\n'));
});
handle('downloads:list', () => downloads.list());
handle('downloads:remove', id => {
  if (typeof id === 'string' && /^steam-\d+$/.test(id)) {
    steamDownloadTracker.remove(id);
    return steamDownloadTracker.list();
  }
  downloads.remove(id);
});
handle('downloads:retry', id => downloads.retry(id));
handle('downloads:steam', () => shell.openExternal('steam://open/downloads'));
handle('downloads:steam-install', async value => {
  const input = typeof value === 'string' ? value.trim() : '';
  const id = /^\d{1,10}$/.test(input) ? input :
    /^https:\/\/store\.steampowered\.com\/app\/(\d{1,10})(?:[/?#]|$)/i.exec(input)?.[1];
  if (!id) throw new Error('Cole um link de jogo da loja Steam ou um AppID válido.');
  await refreshSteamProgress();
  const jobId = 'steam-' + id;
  if (steamDownloadTracker.isInstalled(jobId)) {
    await scan();
    broadcast('downloads:library', state());
    return;
  }
  if (platform === 'linux') {
    if (!detected.steam) await scan();
    const steam = detected.steam;
    if (!steam) throw new Error('A Steam não foi detectada. Vincule o executável em Lojas.');
    await launch(steam.file, [...steam.args, 'steam://install/' + id]);
  } else await shell.openExternal('steam://install/' + id);
  const name = data.ownedStoreGames.steam?.find(game => game.id === id)?.name || `Steam AppID ${id}`;
  steamDownloadTracker.request(jobId, name);
  watchSteamProgress();
});

function watchSteamProgress() {
  if (steamWatch || !steamDownloadTracker.watching()) return;
  steamWatch = setInterval(() => { void refreshSteamProgress().catch(() => {}); }, 4000);
  steamWatch.unref();
}

function refreshSteamProgress() {
  if (pendingSteamProgress) return pendingSteamProgress;
  pendingSteamProgress = (async () => {
    const roots = await getSteamRoots(platform, process.env, os.homedir());
    if (data.apps.steam) roots.unshift(path.dirname(data.apps.steam));
    const completed = steamDownloadTracker.update(await steamDownloads(roots));
    const jobs = steamDownloadTracker.list();
    if (steamDownloadTracker.watching()) watchSteamProgress();
    else {
      clearInterval(steamWatch);
      steamWatch = undefined;
    }
    if (completed.length) {
      broadcast('downloads:steam-completed', { completed, jobs });
      void Promise.resolve(pendingScan).catch(() => {}).then(scan)
        .then(() => broadcast('downloads:library', state())).catch(() => {});
    }
    return jobs;
  })().finally(() => { pendingSteamProgress = undefined; });
  return pendingSteamProgress;
}
handle('downloads:steam-progress', refreshSteamProgress);
handle('steam-account:info', () => ({ profile: data.steamProfile, ready: Boolean(steamKey),
  saved: Boolean(steamKey && data.steamKey), count: data.ownedStoreGames.steam?.length }));
handle('steam-account:help', () => openWebLink('https://steamcommunity.com/dev/apikey', shell));
handle('steam-account:guide', page => {
  const url = page === 'profile' ? 'https://steamcommunity.com/my/' :
    page === 'account' ? 'https://store.steampowered.com/account/' : null;
  if (url) return openWebLink(url, shell);
});
async function changeSteamAccount(action) {
  if (storeOperations.has('steam')) throw new Error('Aguarde a operação atual desta loja.');
  storeOperations.add('steam');
  try { return await action(); } finally { storeOperations.delete('steam'); }
}
handle('steam-account:sync', input => changeSteamAccount(async () => {
  const profile = typeof input?.profile === 'string' ? input.profile.trim() : '';
  const enteredKey = typeof input?.key === 'string' ? input.key.trim() : '';
  const key = enteredKey || steamKey;
  const result = await steamAccountGames(profile || data.steamProfile, key);
  const encrypted = enteredKey && await canSaveSecret()
    ? (await safeStorage.encryptStringAsync(key)).toString('base64') : undefined;
  await updateData(copy => {
    copy.steamProfile = result.profile;
    copy.ownedStoreGames.steam = result.games;
    if (enteredKey) {
      if (encrypted) copy.steamKey = encrypted;
      else delete copy.steamKey;
    }
  });
  steamKey = key;
  return state();
}));
handle('steam-account:disconnect', () => changeSteamAccount(async () => {
  await updateData(copy => {
    delete copy.steamProfile;
    delete copy.steamKey;
    delete copy.ownedStoreGames.steam;
  });
  steamKey = '';
  return state();
}));
handle('app:update-check', updater.check);
handle('app:update-open', updater.open);
handle('app:update-install', updater.install);
handle('tv:layout', async layout => {
  if (!['cockpit', 'cinema', 'gallery'].includes(layout)) throw new Error('Layout do Modo TV inválido.');
  await updateData(copy => { copy.tv.layout = layout; });
  return state();
});
handle('tv:uninstalled', async enabled => {
  await updateData(copy => { copy.tv.showUninstalled = enabled === true; });
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
  if (platform === 'linux' && id === 'wine') {
    try { await openLinuxSoftware('wine'); }
    catch { await openWebLink(store.linuxUrl, shell); }
    return;
  }
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
handle('store:system-search', query => openLinuxSoftware(query));
handle('store:windows-installer', id => {
  const store = getStore(id);
  if (platform !== 'linux' || !windowsLaunchers.has(id) || !store.windowsUrl) throw new Error('Loja desconhecida.');
  return openWebLink(store.windowsUrl, shell);
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
const linuxStore = provider => linuxStores.storeConfig(provider, app.getPath('userData'), data.storeTools[provider]);
async function refreshLinuxLibrary(provider, config) {
  const games = await linuxStores.library(provider, config, data.ownedStoreGames[provider]);
  const localGames = data.games.filter(game => game.store === provider);
  const installed = new Set((await Promise.all(localGames.map(async game => {
    if (provider !== 'gog') return game.storeId;
    return game.installFolder && await linuxStores.gogGameFolder(game.installFolder, game.storeId) ? game.storeId : null;
  }))).filter(Boolean));
  const entries = games.map(game => ({
    ...game, installed: Boolean(game.installed || (provider === 'gog' && installed.has(game.id)))
  })).sort((a, b) => a.name.localeCompare(b.name));
  const installedByStore = new Set(entries.filter(game => game.installed).map(game => game.id));
  await updateData(copy => {
    copy.ownedStoreGames[provider] = entries;
    copy.games = copy.games.filter(game => game.store !== provider || installedByStore.has(game.storeId));
    if (provider === 'epic' || provider === 'amazon') {
      const source = provider === 'epic' ? 'Epic Games' : 'Amazon Games';
      const added = entries.filter(game => game.installed && !installed.has(game.id));
      copy.games.push(...added.map(game => ({
        id: provider + '-' + game.id, name: game.name, source, store: provider, storeId: game.id
      })));
    }
  });
  return entries;
}

async function withStore(provider, action) {
  if (storeOperations.has(provider)) throw new Error('Aguarde a operação atual desta loja.');
  storeOperations.add(provider);
  try { return await action(await linuxStore(provider)); }
  finally { storeOperations.delete(provider); }
}

handle('linux-store:info', async provider => {
  const { ready, commandName, installable } = await linuxStore(provider);
  return { ready, commandName, installable, autoSetup: Boolean(releaseAsset(provider)) };
});
handle('linux-store:link-tool', async (provider, window) => {
  await linuxStore(provider);
  const selection = await dialog.showOpenDialog(window, { title: translate('Selecionar componente da loja'), properties: ['openFile'] });
  if (selection.canceled) return false;
  await setupStoreTool(app.getPath('userData'), provider, selection.filePaths[0]);
  await updateData(copy => { delete copy.storeTools[provider]; });
  return true;
});
handle('linux-store:setup-tool', provider => withStore(provider, async () => {
  await setupStoreTool(app.getPath('userData'), provider);
  await updateData(copy => { delete copy.storeTools[provider]; });
}));
handle('linux-store:open', async ({ provider, setup }) => {
  const config = await linuxStore(provider);
  return openWebLink(setup ? config.setup : await linuxStores.loginUrl(provider, config), shell);
});
handle('linux-store:library', provider => withStore(provider, config => refreshLinuxLibrary(provider, config)));
handle('linux-store:paste-amazon', () => {
  const value = clipboard.readText().trim();
  if (value.length > 8192) throw new Error('Copie a URL inteira da última página após entrar na Amazon.');
  linuxStores.loginCode('amazon', value);
  return value;
});
handle('linux-store:connect', ({ provider, code }) => withStore(provider, async config => {
  await linuxStores.connect(provider, config, code);
  return refreshLinuxLibrary(provider, config);
}));
handle('linux-store:install', async ({ provider, id, useDefaultFolder }, window) => {
  const config = await linuxStore(provider);
  const entry = data.ownedStoreGames[provider]?.find(game => game.id === id);
  if (!config.ready || !entry || !linuxStores.storeGameId(provider, id)) throw new Error('Atualize a biblioteca da loja e selecione um jogo.');
  if (!config.installable) throw new Error('A instalação desta loja ainda não está disponível neste sistema.');
  const taskId = provider + ':' + id;
  if (downloads.has(taskId)) return { queued: true };
  const previous = data.games.find(game => game.store === provider && game.storeId === id);
  let folder = previous?.installBase;
  if (!entry.installed || (provider === 'gog' && !folder)) {
    let directory = data.preferences.installDirectory || path.join(os.homedir(), 'Games', 'PeraGames');
    if (useDefaultFolder !== true) {
      const result = await dialog.showOpenDialog(window, {
        title: translate('Selecionar pasta de instalação'), properties: ['openDirectory', 'createDirectory'],
        defaultPath: data.preferences.installDirectory || undefined
      });
      if (result.canceled) return null;
      [directory] = result.filePaths;
    }
    folder = provider === 'gog' ? path.join(directory, 'GOG-' + id) : directory;
  }
  downloads.add(taskId, entry.name, provider, progress => withStore(provider, async current => {
    if (!current.ready) throw new Error('Instale o componente da loja para continuar.');
    if (useDefaultFolder === true && folder) {
      if (platform === 'linux') await runHostTool('mkdir', ['-p', '--', folder], { timeout: 8000 });
      else await fs.mkdir(folder, { recursive: true });
    }
    const gameFolder = await linuxStores.install(provider, current, id, folder, progress);
    if (provider === 'gog') await updateData(copy => {
      const next = { id: 'gog-' + id, name: entry.name, source: 'GOG', store: provider, storeId: id, installBase: folder, installFolder: gameFolder };
      const index = copy.games.findIndex(game => game.id === next.id);
      if (index === -1) copy.games.push(next);
      else copy.games[index] = next;
      copy.ownedStoreGames.gog = copy.ownedStoreGames.gog.map(game => game.id === id ? { ...game, installed: true } : game);
    });
    else {
      const games = await refreshLinuxLibrary(provider, current);
      if (!games.some(game => game.id === id && game.installed)) throw new Error('A loja ainda não confirmou a instalação.');
    }
    broadcast('downloads:library', state());
  }));
  return { queued: true };
});
handle('store:open', async (id, window) => {
  const store = getStore(id);
  const launcher = storeLauncher(id);
  if (platform === 'linux' && launcher) return playGame(launcher.id, window);
  await scan();
  const target = detected[id];
  const steamId = store.steamAppId || (id === 'obs' && installedPrograms.some(game => game.appId === '1905180') ? '1905180' : '');
  if (!target && steamId && detected.steam) return launch(detected.steam.file, [...detected.steam.args, '-applaunch', steamId]);
  if (!target) throw new Error('Aplicativo não detectado. Atualize a lista ou vincule seu executável.');
  if (platform === 'linux' && target.custom && /\.exe$/i.test(target.file)) {
    const wine = await findLinuxCommand('wine', process.env);
    if (!wine) throw new Error('Instale o Wine em Lojas → Ferramentas para abrir este executável.');
    const cwd = path.dirname(target.file);
    return launch(wine, [target.file], { cwd, hostCwd: cwd, wait: isAmazonInstaller(target.file) })
      .catch(() => { throw new Error('O aplicativo não abriu pelo Wine. Use Testar teclado no Wine para verificar a compatibilidade.'); });
  }
  if (id === 'dolphin') {
    await launch(target.file, target.args, { visible: true });
    return;
  }
  await launch(target.file, target.args);
});
handle('store:wine-keyboard', async id => {
  getStore(id);
  if (platform !== 'linux' || !/\.exe$/i.test(data.apps[id] || '')) throw new Error('Executável do Windows indisponível.');
  const wine = await findLinuxCommand('wine', process.env);
  if (!wine) throw new Error('Instale o Wine em Lojas → Ferramentas para abrir este executável.');
  const { stdout } = await runHostTool(wine, ['--version'], { timeout: 6000 });
  await launch(wine, ['notepad']);
  return { version: stdout.trim().slice(0, 100) || 'Wine' };
});
handle('store:link', async (id, window) => {
  const store = getStore(id);
  const available = storeDownload(store);
  if (!available && !store.userAdded) throw new Error('Este aplicativo não está disponível para o seu sistema.');
  const file = await selectExecutable(window, 'Selecionar executável', true);
  if (file) await updateData(copy => { copy.apps[id] = file; });
  await scan();
  return state();
});
handle('store:unlink', async id => {
  const store = getStore(id);
  await updateData(copy => {
    delete copy.apps[id];
    if (store.userAdded) {
      copy.customStores = copy.customStores.filter(item => item.id !== id);
      const launcher = copy.games.find(game => game.launcher === id);
      if (launcher) {
        copy.games = copy.games.filter(game => game.id !== launcher.id);
        delete copy.gameProton[launcher.id];
        delete copy.gameCovers[launcher.id];
      }
    }
  });
  await scan();
  return state();
});
handle('store:add-custom', async (_, window) => {
  const file = await selectExecutable(window, 'Selecionar executável', true);
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
    findProtonVersions({ home, steamRoots, custom: data.protonFolders, managed: managedProtonRoot() }),
    findWineVersions(home),
    findUmu(managedUmuRoot())
  ]);
  return { versions: [...proton, ...wine], umu: Boolean(umu) };
}

async function protonSettings(id) {
  const game = protonGame(id);
  if (game.appId) {
    const config = await steamProtonConfig();
    const tools = await steamProton.listSteamTools(config.root, (await localRunners()).versions);
    return { steam: true, proton: steamProton.readSteamChoice(config.text, game.appId),
      versions: tools.map(({ id, name, installed, folder }) => ({ path: id, name,
        download: installed === false, register: Boolean(folder) })),
      steamDownloads: tools.filter(tool => tool.appId && !tool.installed).map(({ id, name }) => ({ id, name })) };
  }
  return {
    ...await localRunners(), canChooseExecutable: !isWindowsGame(game),
    steamDownloads: detected.steam ? steamProton.valveProton : [],
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
  return windowsRunner(selection, prefix, os.homedir(), managedUmuRoot());
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

handle('game-setup:start', async ({ id, storeId } = {}, window) => {
  if (platform !== 'linux') throw new Error('A configuração de Proton está disponível no Linux.');
  const store = storeId ? getStore(storeId) : null;
  if (store && !(windowsLaunchers.has(storeId) || store.userAdded && /\.exe$/i.test(data.apps[storeId] || ''))) {
    throw new Error('Executável do Windows indisponível.');
  }
  const game = store ? storeLauncher(storeId) : id ? getGame(id) : null;
  if (game && (game.appId || game.emulator || game.store)) throw new Error('Este jogo tem configurações gerenciadas pela sua biblioteca de origem.');
  const setup = { id: game?.id || (store ? 'launcher-' + store.id : randomUUID()), edit: Boolean(game) };
  setup.defaultPrefix = defaultWinePrefix(setup.id);
  if (store) {
    setup.launcher = store.id;
    setup.title = store.name;
  }
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
  const runners = await localRunners();
  if (store && !setup.selectedRunner && runners.versions.some(version => version.path === 'wine-system')) {
    setup.selectedRunner = 'wine-system';
  }
  return { ...gameSetupView(setup, windows), windows, ...runners };
});
handle('game-setup:runners', async (_, window) => {
  getGameSetup(window);
  return localRunners();
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
  if (setup.launcher && !windows) throw new Error('Selecione um aplicativo com extensão .exe.');
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
    const entry = { id: setup.id, file, name, source: 'Local', args, mangoHud: mangoHud === true, gameMode: gameMode === true,
      launcher: setup.launcher };
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
handle('proton:catalog', ({ source, page }) => {
  if (platform !== 'linux') throw new Error('A configuração de Proton está disponível no Linux.');
  return protonCatalog.listReleases(managedProtonRoot(), source, page);
});
handle('proton:install-release', (id, window) => {
  if (platform !== 'linux') throw new Error('A configuração de Proton está disponível no Linux.');
  return protonCatalog.installRelease(managedProtonRoot(), id, (stage, received, total) => {
    if (!window.isDestroyed()) window.webContents.send('proton:progress', { id, stage, received, total });
  });
});
handle('proton:steam-download', async ({ id, toolId }) => {
  protonGame(id);
  const tool = steamProton.valveProton.find(entry => entry.id === toolId);
  const steam = detected.steam;
  if (!tool || !steam) throw new Error('A Steam não foi detectada. Vincule o executável em Lojas.');
  await launch(steam.file, [...steam.args, 'steam://install/' + tool.appId]);
});
handle('proton:help', async id => {
  protonGame(id, false);
  await ensureUmu(managedUmuRoot());
  return protonSettings(id);
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
  if (game.appId) {
    const config = await steamProtonConfig();
    if (proton !== steamProton.defaultTool) {
      const tool = (await steamProton.listSteamTools(config.root, (await localRunners()).versions)).find(item => item.id === proton);
      if (!tool) throw new Error('A versão selecionada do Proton não foi encontrada.');
      if (tool.folder) await steamProton.addSteamTool(config.root, tool.folder);
    }
    await steamProton.saveSteamChoice(config, game.appId, proton);
    return protonSettings(id);
  }
  if (proton !== 'GE-Proton' && !(await localRunners()).versions.some(version => version.path === proton)) {
    throw new Error('A versão selecionada do Proton não foi encontrada.');
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
async function playGame(id, window) {
  const game = getGame(id);
  const compatibility = data.gameProton[id] || {};
  const storeStatus = reason => {
    if (!window.isDestroyed()) window.webContents.send('game:store-status', { name: game.name, provider: game.store, reason });
  };
  if (game.store === 'epic' || game.store === 'amazon') {
    storeStatus(platform === 'linux' && !compatibility.proton?.startsWith('wine') ? 'preparing-proton' : 'preparing');
  }
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
    if (recentSteamLaunches.has(game.appId)) return;
    recentSteamLaunches.add(game.appId);
    if (!window.isDestroyed()) window.webContents.send('game:steam-launch-requested', game.name);
    const url = 'steam://rungameid/' + game.appId;
    try {
      if (platform === 'darwin') await shell.openExternal(url);
      else await launch(steam.file, [...steam.args, url]);
      setTimeout(() => recentSteamLaunches.delete(game.appId), 5000).unref();
    } catch {
      recentSteamLaunches.delete(game.appId);
      throw new Error('Não foi possível pedir à Steam para abrir o jogo.');
    }
  } else if (game.store && platform !== 'linux') {
    const config = await linuxStore(game.store);
    if (!config.ready || !config.installable) throw new Error('A loja não pode abrir este jogo neste sistema.');
    if (!await linuxStores.play(game.store, config, { id: game.storeId, folder: game.installFolder, onStatus: storeStatus })) return;
  } else if (platform === 'linux' && (isWindowsGame(game) || compatibility.executable)) {
    const executable = compatibility.executable || game.file;
    if (!game.store && !await fileExists(executable)) throw new Error('O executável foi movido ou removido.');
    const { proton, prefix } = compatibility;
    const winePrefix = prefix || defaultWinePrefix(id);
    if (prefix && !await fs.stat(prefix).then(stats => stats.isDirectory(), () => false)) {
      throw new Error('O prefixo Wine selecionado não foi encontrado.');
    }
    const runner = await windowsRunner(proton, winePrefix, os.homedir(), managedUmuRoot());
    if (!prefix) await fs.mkdir(winePrefix, { recursive: true });
    if (game.store) {
      const config = await linuxStore(game.store);
      if (!config.ready) throw new Error('Instale o componente da loja para continuar.');
      if (!await linuxStores.play(game.store, config, { id: game.storeId, folder: game.installFolder,
        umu: runner.file, environment: runner.environment, onStatus: storeStatus })) return;
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
  if (!game.launcher) await updateData(copy => { copy.played[id] = Date.now(); });
  return state();
}
handle('game:play', playGame);
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
    delete copy.gridCovers[id];
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
    if (copy.gridCovers[id] && titleKey(copy.gridCovers[id].name) !== titleKey(name)) delete copy.gridCovers[id];
  });
  return state();
});
handle('game:cover-search', async ({ id, query }) => {
  const game = getGame(id);
  const name = typeof query === 'string' ? query.trim().slice(0, 160) || game.name : game.name;
  const params = new URLSearchParams({ tbm: 'isch', q: name + ' video game box art cover' });
  await shell.openExternal('https://www.google.com/search?' + params);
});
handle('grid:preferences', () => openWebLink(preferencesUrl, shell));
handle('grid:key', async input => {
  const key = typeof input === 'string' ? input.trim() : null;
  if (key === null || (key && !/^[A-Za-z0-9_-]{16,128}$/.test(key))) {
    throw new Error('Informe uma chave de API válida do SteamGridDB.');
  }
  if (key) await verifyGridKey(key);
  const encrypted = key && await canSaveSecret() ? (await safeStorage.encryptStringAsync(key)).toString('base64') : undefined;
  await updateData(copy => {
    if (encrypted) copy.gridKey = encrypted;
    else delete copy.gridKey;
  });
  gridKey = key;
  return state();
});
handle('grid:cover', async ({ id, provider, query }) => {
  if (!gridKey) return;
  const game = provider ? (Object.hasOwn(data.ownedStoreGames, provider) &&
    data.ownedStoreGames[provider]?.find(entry => entry.id === id)) : getGame(id);
  if (!game || game.launcher) return;
  const name = typeof query === 'string' && query.trim() ? query.trim().slice(0, 160) :
    (romAssets.get(id)?.name || game.name);
  const knownApp = /^https:\/\/store\.steampowered\.com\/app\/(\d{1,10})\/$/.exec(data.gameDetails[id]?.url || '')?.[1];
  const key = gridKey;
  const url = await findGridCover({ appId: game.appId || knownApp, name }, key);
  if (!url || key !== gridKey) return;
  if (!provider) await updateData(copy => {
    if (key === gridKey) copy.gridCovers[id] = { url, name };
  });
  return url;
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
handle('game:compatibility', ({ id, provider }) => {
  const game = provider ? (Object.hasOwn(data.ownedStoreGames, provider) &&
    data.ownedStoreGames[provider]?.find(entry => entry.id === id)) : getGame(id);
  if (!game || game.emulator || game.launcher) throw new Error('Jogo não encontrado. Atualize a biblioteca.');
  return getCompatibility({ ...game, info: provider ? undefined : data.gameDetails[id] }, languageFor(systemLocale()));
});
handle('game:compatibility-link', id => openWebLink(protonDBPage(id), shell));
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

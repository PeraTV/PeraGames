'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, argument) {
  const result = await ipcRenderer.invoke(channel, argument);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

contextBridge.exposeInMainWorld('pera', {
  control: action => invoke('window:control', action),
  setTvSettings: settings => invoke('tv:settings', settings),
  setTvLayout: layout => invoke('tv:layout', layout),
  setDolphinPassthrough: enabled => invoke('dolphin:passthrough', enabled),
  onMaximized: callback => ipcRenderer.on('maximized', (_, value) => callback(value)),
  getLocale: () => invoke('app:locale'),
  refresh: () => invoke('catalog:refresh'),
  checkAppUpdate: () => invoke('app:update-check'),
  openAppRelease: () => invoke('app:update-open'),
  installAppUpdate: () => invoke('app:update-install'),
  openStore: id => invoke('store:open', id),
  downloadStore: id => invoke('store:download', id),
  storeWebsite: id => invoke('store:website', id),
  linuxStoreInfo: provider => invoke('linux-store:info', provider),
  openLinuxStore: request => invoke('linux-store:open', request),
  linuxStoreLibrary: provider => invoke('linux-store:library', provider),
  connectLinuxStore: request => invoke('linux-store:connect', request),
  installLinuxStoreGame: request => invoke('linux-store:install', request),
  linkStore: id => invoke('store:link', id),
  addCustomStore: () => invoke('store:add-custom'),
  unlinkStore: id => invoke('store:unlink', id),
  addGame: () => invoke('game:add'),
  play: id => invoke('game:play', id),
  protonSettings: id => invoke('proton:settings', id),
  protonLatest: id => invoke('proton:latest', id),
  protonHelp: id => invoke('proton:help', id),
  protonAdd: id => invoke('proton:add', id),
  protonSave: settings => invoke('proton:save', settings),
  protonPrefix: settings => invoke('proton:prefix', settings),
  favorite: id => invoke('game:favorite', id),
  removeGame: id => invoke('game:remove', id),
  addRoms: selection => invoke('rom:add', selection),
  lookupGame: request => invoke('game:lookup', request),
  searchCover: request => invoke('game:cover-search', request),
  pickCover: id => invoke('game:cover', id),
  resetCover: id => invoke('game:reset-cover', id),
  pickBackdrop: id => invoke('game:backdrop', id),
  resetBackdrop: id => invoke('game:reset-backdrop', id),
  saveGameInfo: info => invoke('game:save-info', info),
  gameInfoSource: id => invoke('game:info-source', id),
  featureStore: () => invoke('feature:store'),
  pickFeatureArt: () => invoke('feature:pick-art'),
  saveFeature: settings => invoke('feature:save', settings)
});

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
  linkStore: id => invoke('store:link', id),
  addCustomStore: () => invoke('store:add-custom'),
  unlinkStore: id => invoke('store:unlink', id),
  addGame: () => invoke('game:add'),
  play: id => invoke('game:play', id),
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

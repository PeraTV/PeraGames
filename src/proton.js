'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fileExists } = require('./system');

const automaticProton = 'GE-Proton';
const isWindowsGame = game => Boolean(game && !game.emulator && !game.appId &&
  (game.store === 'epic' || game.store === 'gog' || /\.exe$/i.test(game.file || '')));

async function isProtonDirectory(directory) {
  return typeof directory === 'string' && path.isAbsolute(directory) &&
    fileExists(path.join(directory, 'proton'));
}

async function findProtonVersions({ home, steamRoots, custom = [] }) {
  const local = path.join(home, '.local', 'share');
  const roots = [
    ...steamRoots.flatMap(root => ['compatibilitytools.d', 'steamapps/common'].map(dir => path.join(root, dir))),
    path.join(local, 'umu', 'compatibilitytools'),
    path.join(local, 'heroic', 'tools', 'proton'),
    path.join(home, '.config', 'heroic', 'tools', 'proton'),
    path.join(home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic', 'tools', 'proton'),
    path.join(local, 'lutris', 'runners', 'proton')
  ];
  const children = await Promise.all([...new Set(roots)].map(async root => {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    return entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => path.join(root, entry.name));
  }));
  const seen = new Set();
  const versions = [];
  for (const candidate of [...custom, ...children.flat()]) {
    if (!await isProtonDirectory(candidate)) continue;
    const real = await fs.realpath(candidate).catch(() => candidate);
    if (seen.has(real)) continue;
    seen.add(real);
    versions.push({ path: candidate, name: path.basename(candidate) });
  }
  return versions.sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
}

async function latestGEProton() {
  const response = await fetch('https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error('Não foi possível verificar o GE-Proton.');
  const release = await response.json();
  if (!/^GE-Proton\d+-\d+(?:[.-]\w+)?$/.test(release.tag_name)) throw new Error('Não foi possível verificar o GE-Proton.');
  return release.tag_name;
}

function protonEnvironment(proton, prefix) {
  return { PROTONPATH: proton || automaticProton, WINEPREFIX: prefix };
}

module.exports = { automaticProton, isWindowsGame, isProtonDirectory, findProtonVersions, latestGEProton, protonEnvironment };

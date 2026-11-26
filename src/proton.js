'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fileExists, findLinuxCommand } = require('./system');

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

async function findWineVersions(home) {
  const roots = [
    path.join(home, '.local', 'share', 'lutris', 'runners', 'wine'),
    path.join(home, '.config', 'heroic', 'tools', 'wine'),
    path.join(home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic', 'tools', 'wine')
  ];
  const wine = await findLinuxCommand('wine', process.env);
  const versions = wine ? [{ path: 'wine-system', name: 'Wine do sistema' }] : [];
  for (const root of roots) {
    for (const name of await fs.readdir(root).catch(() => [])) {
      const binary = path.join(root, name, 'bin', 'wine');
      if (await fileExists(binary)) versions.push({ path: 'wine:' + binary, name: 'Wine · ' + name });
    }
  }
  return versions;
}

async function windowsRunner(selection, prefix, home) {
  const runner = selection || automaticProton;
  if (runner === 'wine-system' || runner.startsWith('wine:')) {
    const file = runner === 'wine-system' ? await findLinuxCommand('wine', process.env) : runner.slice(5);
    if (!file || (runner !== 'wine-system' && !(await findWineVersions(home)).some(version => version.path === runner))) {
      throw new Error('A versão selecionada do Wine não foi encontrada.');
    }
    return { file, environment: { WINEPREFIX: prefix } };
  }
  if (runner !== automaticProton && !await isProtonDirectory(runner)) {
    throw new Error('A versão selecionada do Proton não foi encontrada.');
  }
  const file = await findLinuxCommand('umu-run', process.env);
  if (!file) throw new Error('Instale o umu-launcher para iniciar este jogo com Proton.');
  return { file, environment: protonEnvironment(runner, prefix) };
}

module.exports = { automaticProton, isWindowsGame, isProtonDirectory, findProtonVersions, findWineVersions,
  latestGEProton, protonEnvironment, windowsRunner };

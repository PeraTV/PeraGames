'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fileExists, findLinuxCommand, runHostTool } = require('./system');
const { steamLibraryRoots, systemToolsRoot } = require('./steam-proton');
const { ensureUmu } = require('./umu');

const automaticProton = 'GE-Proton';
const wineSelection = runner => runner === 'wine-system' || Boolean(runner?.startsWith('wine:'));
const isWindowsGame = game => Boolean(game && !game.emulator && !game.appId &&
  (['epic', 'gog', 'amazon'].includes(game.store) || /\.exe$/i.test(game.file || '')));

async function isProtonDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return false;
  const launcher = path.join(directory, 'proton');
  if (await fileExists(launcher)) return true;
  return process.platform === 'linux' && path.dirname(directory) === systemToolsRoot &&
    runHostTool('test', ['-f', launcher], { timeout: 3500 }).then(() => true, () => false);
}

async function findProtonVersions({ home, steamRoots, custom = [], managed }) {
  const local = path.join(home, '.local', 'share');
  const libraries = (await Promise.all(steamRoots.map(steamLibraryRoots))).flat();
  const roots = [
    ...steamRoots.map(root => path.join(root, 'compatibilitytools.d')),
    ...libraries.map(root => path.join(root, 'steamapps', 'common')),
    path.join(local, 'Steam', 'compatibilitytools.d'),
    path.join(local, 'umu', 'compatibilitytools'),
    path.join(local, 'heroic', 'tools', 'proton'),
    path.join(home, '.config', 'heroic', 'tools', 'proton'),
    path.join(home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic', 'tools', 'proton'),
    path.join(local, 'lutris', 'runners', 'proton'),
    managed
  ].filter(Boolean);
  const children = await Promise.all([...new Set(roots)].map(async root => {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    return entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => path.join(root, entry.name));
  }));
  const system = process.platform === 'linux' ? await runHostTool('find', [
    systemToolsRoot, '-mindepth', '1', '-maxdepth', '1', '-print0'
  ], { timeout: 3500 }).then(({ stdout }) => stdout.split('\0').filter(Boolean), () => []) : [];
  const seen = new Set();
  const versions = [];
  for (const candidate of [...custom, ...children.flat(), ...system]) {
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

async function storeGamePrefix(previous, selection) {
  const wine = wineSelection(selection);
  const protonLayout = await fs.lstat(path.join(previous, 'pfx')).then(() => true, () => false);
  if (wine ? !protonLayout && await fileExists(path.join(previous, 'system.reg')) : protonLayout) return previous;
  return path.join(path.dirname(previous), wine ? 'wine' : 'proton', path.basename(previous));
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

async function windowsRunner(selection, prefix, home, umuRoot) {
  const runner = selection || automaticProton;
  if (wineSelection(runner)) {
    const file = runner === 'wine-system' ? await findLinuxCommand('wine', process.env) : runner.slice(5);
    if (!file || (runner !== 'wine-system' && !(await findWineVersions(home)).some(version => version.path === runner))) {
      throw new Error('A versão selecionada do Wine não foi encontrada.');
    }
    return { file, environment: { WINEPREFIX: prefix } };
  }
  if (runner !== automaticProton) {
    if (!await isProtonDirectory(runner)) throw new Error('A versão selecionada do Proton não foi encontrada.');
    const manifest = path.join(runner, 'toolmanifest.vdf');
    if (!await fileExists(manifest) && !await runHostTool('test', ['-f', manifest], { timeout: 3500 }).then(() => true, () => false)) {
      throw new Error('Este Proton não contém o manifesto de runtime. Escolha outra versão ou reinstale esta.');
    }
  }
  const file = await ensureUmu(umuRoot);
  return { file, environment: protonEnvironment(runner, prefix) };
}

module.exports = { automaticProton, wineSelection, storeGamePrefix, isWindowsGame, isProtonDirectory, findProtonVersions, findWineVersions,
  latestGEProton, protonEnvironment, windowsRunner };

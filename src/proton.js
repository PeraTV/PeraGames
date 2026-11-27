'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fileExists, findLinuxCommand, runHostTool } = require('./system');
const { steamLibraryRoots, systemToolsRoot } = require('./steam-proton');
const { ensureUmu } = require('./umu');
const { latestGERelease, installLatestGE } = require('./proton-catalog');
const { hostPath, hostExists } = require('./host-paths');

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

async function protonDirectoryFromSelection(directory) {
  const selected = directory;
  directory = await hostPath(directory);
  if (await isProtonDirectory(directory) || await hostExists(path.join(directory || '.', 'proton'), '-f')) return directory;
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return;
  const entries = await fs.readdir(selected, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(entries.filter(entry => entry.isDirectory() && /proton/i.test(entry.name))
    .map(async entry => {
      const folder = path.join(directory, entry.name);
      return await hostExists(path.join(folder, 'proton'), '-f') && await hasRuntimeManifest(folder) ? folder : undefined;
    }));
  const matches = candidates.filter(Boolean);
  if (matches.length === 1) return matches[0];
}

async function findProtonVersions({ home, steamRoots = [], custom = [], managed }) {
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
  for (const entry of [...custom, ...children.flat(), ...system]) {
    const candidate = await hostPath(entry).catch(() => undefined);
    if (!candidate) continue;
    if (!await isProtonDirectory(candidate) && !(custom.includes(entry) && await hostExists(path.join(candidate, 'proton'), '-f'))) continue;
    const real = await fs.realpath(candidate).catch(() => candidate);
    if (seen.has(real)) continue;
    seen.add(real);
    versions.push({ path: candidate, name: path.basename(candidate) });
  }
  return versions.sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
}

async function latestGEProton() {
  return (await latestGERelease()).tag_name;
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

async function hasRuntimeManifest(directory) {
  const manifest = path.join(directory, 'toolmanifest.vdf');
  return hostExists(manifest, '-f');
}

async function windowsRunner(selection, prefix, { umuRoot, ...locations }) {
  let runner = selection || automaticProton;
  prefix = await hostPath(prefix);
  if (wineSelection(runner)) {
    const file = runner === 'wine-system' ? await findLinuxCommand('wine', process.env) : await hostPath(runner.slice(5));
    if (!file || (runner !== 'wine-system' && !(await findWineVersions(locations.home)).some(version => version.path === runner))) {
      throw new Error('A versão selecionada do Wine não foi encontrada.');
    }
    return { file, environment: { WINEPREFIX: prefix } };
  }
  if (runner === automaticProton) {
    const versions = await findProtonVersions(locations);
    const ge = versions.filter(({ name }) => /^GE-Proton\d+-\d+(?:[.-]\w+)?(?:-x86_64|-aarch64)?$/i.test(name) &&
      !(process.arch === 'x64' && /-aarch64$/i.test(name)) && !(process.arch === 'arm64' && /-x86_64$/i.test(name)));
    runner = undefined;
    for (const version of ge) {
      if (!await hasRuntimeManifest(version.path) || !await hostExists(path.join(version.path, 'files/share/wine'), '-d')) continue;
      runner = version.path;
      break;
    }
    runner ||= await installLatestGE(locations.managed);
  }
  runner = await hostPath(runner);
  const entry = path.join(runner, 'proton');
  const [isFile, executable, manifest, wine] = await Promise.all([
    hostExists(entry, '-f'), hostExists(entry, '-x'), hasRuntimeManifest(runner),
    hostExists(path.join(runner, 'files/share/wine'), '-d')
  ]);
  if (!isFile || !executable) throw new Error('O arquivo proton não existe ou não é executável no Linux.');
  if (!manifest) {
    throw new Error('Este Proton não contém o manifesto de runtime. Escolha outra versão ou reinstale esta.');
  }
  if (!wine) throw new Error('A instalação do Proton está incompleta: falta a pasta files/share/wine.');
  const file = await ensureUmu(umuRoot);
  return { file, environment: { PROTONPATH: runner, WINEPREFIX: prefix } };
}

module.exports = { automaticProton, wineSelection, storeGamePrefix, isWindowsGame, isProtonDirectory, protonDirectoryFromSelection, findProtonVersions, findWineVersions,
  latestGEProton, windowsRunner };

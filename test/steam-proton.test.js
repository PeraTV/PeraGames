'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { defaultTool, readSteamChoice, writeSteamChoice, parseSteamTool, listSteamTools, saveSteamChoice } = require('../src/steam-proton');
const { findProtonVersions } = require('../src/proton');
const { flathubId } = require('../src/system');

const config = '"InstallConfigStore" { "Software" { "Valve" { "Steam" {\n' +
  '  "CompatToolMapping" {\n    "0" { "name" "proton_10" }\n' +
  '    "42" { "name" "proton_9" "config" "keep-me" "priority" "250" }\n  }\n' +
  '  "apps" { "42" { "SizeOnDisk" "1024" } }\n' +
  '} } } }';

test('altera somente a versão do jogo da Steam e preserva outras entradas', () => {
  const next = writeSteamChoice(config, '42', 'GE-Proton11-2');
  assert.equal(next, config.replace('proton_9', 'GE-Proton11-2'));
  assert.equal(readSteamChoice(next, '42'), 'GE-Proton11-2');
  const cleared = writeSteamChoice(next, '42', defaultTool);
  assert.equal(readSteamChoice(cleared, '42'), defaultTool);
  assert.equal(readSteamChoice(cleared, '0'), 'proton_10');
  assert.match(cleared, /SizeOnDisk/);
});

test('cria a seção de compatibilidade e lê o identificador real no manifesto', () => {
  const bare = '"InstallConfigStore" { "Software" { "Valve" { "Steam" { } } } }';
  assert.equal(readSteamChoice(writeSteamChoice(bare, '42', 'proton_experimental'), '42'), 'proton_experimental');
  assert.throws(() => writeSteamChoice(config, '42', 'bad" }'), /Steam/);
  assert.deepEqual(parseSteamTool('"compatibilitytools" { "compat_tools" { "GE-Proton11-2" { // local\n' +
    '"install_path" "." "display_name" "GE-Proton 11-2" } } }'), { id: 'GE-Proton11-2', name: 'GE-Proton 11-2' });
});

test('usa identificadores de aplicativos apenas de links do catálogo Flathub', () => {
  assert.equal(flathubId('https://flathub.org/apps/io.github.benjamimgois.goverlay'), 'io.github.benjamimgois.goverlay');
  assert.equal(flathubId('https://flathub.org/apps/-malicious'), undefined);
  assert.equal(flathubId('https://flathub.org.other.test/apps/org.foo.bar'), undefined);
});

test('lista Proton oficial, Proton-CachyOS e GE-Proton de outras instalações', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'peragames-proton-catalog-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'Steam');
  const external = path.join(home, 'Segundo disco');
  const official = path.join(external, 'steamapps', 'common', 'Proton 10.0');
  const shared = path.join(home, '.local', 'share', 'umu', 'compatibilitytools', 'GE-Proton11-2');
  const cachyos = path.join(root, 'compatibilitytools.d', 'proton-cachyos-slr');
  await fs.mkdir(path.join(root, 'steamapps'), { recursive: true });
  await fs.writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" { "1" { "path" ' +
    JSON.stringify(external) + ' } }');
  for (const [folder, id, name] of [
    [official, 'proton_10', 'Proton 10.0-4'],
    [shared, 'GE-Proton11-2', 'GE-Proton 11-2'],
    [cachyos, 'proton-cachyos-slr', 'Proton-CachyOS (SLR)']
  ]) {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'proton'), '');
    await fs.writeFile(path.join(folder, 'compatibilitytool.vdf'),
      '"compatibilitytools" { "compat_tools" { ' + JSON.stringify(id) +
      ' { "install_path" "./" "display_name" ' + JSON.stringify(name) + ' } } }');
  }
  const local = await findProtonVersions({ home, steamRoots: [root] });
  assert.deepEqual(new Set(local.filter(version => version.path.startsWith(home)).map(version => version.path)),
    new Set([official, shared, cachyos]));
  const tools = await listSteamTools(root, local);
  assert.deepEqual(tools.find(tool => tool.id === 'proton_10'), {
    id: 'proton_10', name: 'Proton 10.0-4', appId: '3658110', installed: true
  });
  assert.equal(tools.find(tool => tool.id === 'proton_11').installed, false);
  assert.equal(tools.find(tool => tool.id === 'GE-Proton11-2').folder, shared);
  assert.equal(tools.find(tool => tool.id === 'proton-cachyos-slr').installed, true);
});

test('grava a escolha da Steam atomicamente e mantém o backup', { skip: process.platform !== 'linux' }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peragames-steam-config-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'config.vdf');
  await fs.writeFile(file, config);
  await saveSteamChoice({ file, text: config }, '42', 'proton_experimental');
  assert.equal(readSteamChoice(await fs.readFile(file, 'utf8'), '42'), 'proton_experimental');
  assert.equal(await fs.readFile(file + '.peragames.bak', 'utf8'), config);
  await assert.rejects(saveSteamChoice({ file, text: config }, '42', 'proton_10'), /mudou/);
});

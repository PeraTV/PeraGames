'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { defaultTool, readSteamChoice, writeSteamChoice, parseSteamTool, saveSteamChoice } = require('../src/steam-proton');
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

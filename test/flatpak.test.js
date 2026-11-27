'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const app = 'io.github.PeraTV.PeraGames';
const directory = path.join(__dirname, '../packaging/flatpak');
const metadataFile = path.join(directory, app + '.metainfo.xml');
const manifest = require('../packaging/flatpak/io.github.PeraTV.PeraGames.json');

test('usa a versão suportada 25.08 do Freedesktop com Electron BaseApp correspondente', () => {
  assert.equal(manifest.runtime, 'org.freedesktop.Platform');
  assert.equal(manifest.sdk, 'org.freedesktop.Sdk');
  assert.equal(manifest['runtime-version'], '25.08');
  assert.equal(manifest.base, 'org.electronjs.Electron2.BaseApp');
  assert.equal(manifest['base-version'], manifest['runtime-version']);
});

test('o Flatpak exporta a ficha AppStream e declara o acesso ao host', () => {
  const metadata = readFileSync(metadataFile, 'utf8');
  assert.ok(metadata.includes('<id>' + manifest['app-id'] + '</id>'));
  assert.ok(metadata.includes('<developer id="io.github.peratv">'));
  assert.ok(metadata.includes('<launchable type="desktop-id">' + app + '.desktop</launchable>'));
  assert.ok(metadata.includes('<icon type="stock">' + app + '</icon>'));
  for (const word of ['Epic Games', 'GOG', 'Amazon Games', 'Proton', 'UMU', 'outside the sandbox']) {
    assert.ok(metadata.includes(word));
  }
  assert.ok(manifest['finish-args'].includes('--talk-name=org.freedesktop.Flatpak'));
  const [module] = manifest.modules;
  assert.ok(module.sources.some(source => source.path === app + '.metainfo.xml'));
  assert.ok(module['build-commands'].some(command => command.endsWith('/app/share/metainfo/' + app + '.metainfo.xml')));
});

test('valida o metainfo com appstreamcli quando disponível', t => {
  const result = spawnSync('appstreamcli', ['validate', '--no-net', metadataFile], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return t.skip('appstreamcli não está instalado');
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readLibraryFolders, readVdfString, steamGames, detectStores, launch } = require('../src/system');
const { stores } = require('../src/catalog');

test('aceita bibliotecas Steam atuais e antigas, com espaços e barras invertidas', () => {
  const root = String.raw`D:\Steam Games`;
  const escaped = root.replaceAll('\\', '\\\\');
  assert.deepEqual(readLibraryFolders('"1" { "path" "' + escaped + '" }'), [root]);
  assert.deepEqual(readLibraryFolders('"1" "' + escaped + '"\n'), [root]);
  assert.equal(readVdfString('"name" "Jogo \\"Legado\\""', 'name'), 'Jogo "Legado"');
});

test('importa jogos completos em discos adicionais e elimina duplicados', async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pera-steam-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const main = path.join(tmp, 'steamapps');
  const otherRoot = path.join(tmp, 'disco extra');
  const extra = path.join(otherRoot, 'steamapps');
  await Promise.all([fs.mkdir(main), fs.mkdir(extra, { recursive: true })]);
  const full = '"appid" "10"\n"name" "Jogo teste"\n"StateFlags" "6"';
  await Promise.all([
    fs.writeFile(path.join(main, 'libraryfolders.vdf'), '"path" ' + JSON.stringify(otherRoot)),
    fs.writeFile(path.join(main, 'appmanifest_10.acf'), full),
    fs.writeFile(path.join(extra, 'appmanifest_10.acf'), full),
    fs.writeFile(path.join(extra, 'appmanifest_12.acf'), '"appid" "12"\n"name" "Em download"\n"StateFlags" "2"')
  ]);
  assert.deepEqual(await steamGames([tmp]), [{ id: 'steam-10', appId: '10', name: 'Jogo teste', source: 'Steam' }]);
});

test('usa somente os aplicativos padrão detectados ou o executável vinculado', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pera-apps-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const steam = path.join(root, 'steam.exe');
  await fs.writeFile(steam, '');
  const found = await detectStores(stores, 'win32', {}, { apps: { dolphin: process.execPath } }, [root]);
  assert.equal(found.steam.file, steam);
  assert.equal(found.dolphin.file, process.execPath);
  assert.equal(found.lutris, null);
  await assert.rejects(launch(path.join(root, 'ausente')), { code: 'ENOENT' });
});

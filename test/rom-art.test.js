'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readDiscIdentity, romArtwork, romTitle } = require('../src/rom-art');
const { detectStores } = require('../src/system');
const { stores } = require('../src/catalog');
const { setTvLogin } = require('../src/tv-startup');

test('identifica Wii e GameCube nos cabeçalhos WBFS, RVZ e ISO', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pera-disc-'));
  const files = [];
  t.after(async () => {
    await Promise.all(files.map(file => fs.unlink(file)));
    await fs.rmdir(folder);
  });
  for (const [extension, offset, id, signature] of [
    ['wbfs', 0x200, 'RMCE01', 'WBFS'], ['rvz', 0x58, 'SSQE01', 'RVZ\x01'], ['iso', 0, 'GLME01', '']
  ]) {
    const file = path.join(folder, 'levantar.' + extension);
    const bytes = Buffer.alloc(0x300);
    if (signature) bytes.write(signature);
    if (extension === 'wbfs') bytes[8] = 9;
    bytes.write(id, offset);
    const gamecube = extension === 'iso';
    bytes.writeUInt32BE(gamecube ? 0xc2339f3d : 0x5d1c9ea3, offset + (gamecube ? 0x1c : 0x18));
    await fs.writeFile(file, bytes);
    files.push(file);
    assert.deepEqual(await readDiscIdentity(file), { id, system: gamecube ? 'gamecube' : 'wii' });
  }
  const art = await romArtwork({ file: files[0], emulator: 'dolphin', name: 'Mario Kart Wii RMCE01 PT-BR' });
  assert.equal(art.name, 'Mario Kart Wii');
  assert.equal(art.art[0], 'https://art.gametdb.com/wii/coverHQ/US/RMCE01.png');
  assert.equal(romTitle("Luigi 's Mansion (BR) (www.exemplo.com)"), "Luigi's Mansion");
});

test('detecta Dolphin em pasta de versão do Windows', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pera-dolphin-'));
  const version = path.join(root, 'dolphin-2509-x64');
  const bin = path.join(version, 'Dolphin-x64');
  const exe = path.join(bin, 'Dolphin.exe');
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(exe, '');
  t.after(async () => {
    await fs.unlink(exe);
    await fs.rmdir(bin);
    await fs.rmdir(version);
    await fs.rmdir(root);
  });
  const results = await detectStores(stores.filter(store => store.id === 'dolphin'), 'win32',
    { 'ProgramFiles(x86)': root }, { apps: {}, roms: [] }, []);
  assert.equal(results.dolphin.file, exe);
});

test('usa a mesma entrada de login para ativar e desativar no Windows e Linux', async t => {
  const settings = [];
  const app = { setLoginItemSettings: value => settings.push(value) };
  await setTvLogin(app, 'win32', true);
  await setTvLogin(app, 'win32', false);
  assert.deepEqual(settings[0], { ...settings[1], openAtLogin: true });
  assert(settings[0].args.includes('--peragames-tv-login'));
  const prior = process.env.XDG_CONFIG_HOME;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pera-tv-'));
  process.env.XDG_CONFIG_HOME = root;
  const folder = path.join(root, 'autostart');
  const file = path.join(folder, 'peragames-tv.desktop');
  t.after(async () => {
    if (prior === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prior;
    await fs.unlink(file).catch(() => {});
    await fs.rmdir(folder);
    await fs.rmdir(root);
  });
  await setTvLogin(app, 'linux', true);
  assert.match(await fs.readFile(file, 'utf8'), /Exec=.*--peragames-tv-login/);
  await setTvLogin(app, 'linux', false);
  await assert.rejects(fs.access(file), { code: 'ENOENT' });
});

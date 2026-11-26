'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { findProtonVersions, isWindowsGame, protonEnvironment } = require('../src/proton');
const { loginCode, storeGameId } = require('../src/linux-stores');

test('detecta Proton por executável e mantém a escolha independente do prefixo', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'peragames-proton-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const steam = path.join(home, 'Steam');
  const runner = path.join(steam, 'compatibilitytools.d', 'GE-Proton11-1');
  await mkdir(runner, { recursive: true });
  await mkdir(path.join(steam, 'compatibilitytools.d', 'invalid'));
  await writeFile(path.join(runner, 'proton'), '');
  assert.deepEqual(await findProtonVersions({ home, steamRoots: [steam], custom: [runner] }),
    [{ path: runner, name: 'GE-Proton11-1' }]);
  assert.deepEqual(protonEnvironment(undefined, home), { PROTONPATH: 'GE-Proton', WINEPREFIX: home });
  assert.deepEqual(protonEnvironment(runner, home), { PROTONPATH: runner, WINEPREFIX: home });
});

test('separa jogos da Steam e dos emuladores da seleção de Proton', () => {
  assert.equal(isWindowsGame({ file: '/games/file.EXE' }), true);
  assert.equal(isWindowsGame({ store: 'gog' }), true);
  assert.equal(isWindowsGame({ appId: '123', file: '/games/file.exe' }), false);
  assert.equal(isWindowsGame({ emulator: 'android', file: '/games/file.exe' }), false);
});

test('aceita os formatos de login esperados e rejeita origens e identificadores inválidos', () => {
  const code = 'demo-authorization-code';
  assert.equal(loginCode('epic', JSON.stringify({ authorizationCode: code })), code);
  assert.equal(loginCode('gog', 'https://embed.gog.com/on_login_success?origin=client&code=' + code), code);
  assert.throws(() => loginCode('gog', 'https://other.example/on_login_success?code=' + code), /inválido/);
  assert.equal(storeGameId('gog', '1234567'), true);
  assert.equal(storeGameId('epic', '--option'), false);
});

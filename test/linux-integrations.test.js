'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { findProtonVersions, isWindowsGame, protonEnvironment, windowsRunner } = require('../src/proton');
const { loginCode, storeGameId } = require('../src/linux-stores');
const { releasePackages } = require('../src/proton-catalog');
const { releaseAsset } = require('../src/store-tools');
const { steamAccountGames } = require('../src/steam-account');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

test('detecta o início e falhas do runner em jogos da Amazon', async () => {
  const moduleFile = require.resolve('../src/linux-stores');
  const requireStore = createRequire(moduleFile);
  const moduleExports = {};
  let processMonitor;
  const load = name => name === './system' ? {
    launch: async (file, args, settings) => {
      assert.deepEqual(Array.from(args.slice(0, 4)), ['launch', 'game-id', '--no-wine', '--wrapper']);
      assert.match(args[4], /PERAGAMES_RUNNER_EXIT/);
      processMonitor = settings;
    }
  } : requireStore(name);
  vm.runInNewContext(readFileSync(moduleFile, 'utf8'), { require: load, process, module: moduleExports });
  const failures = [];
  const play = () => moduleExports.exports.play('amazon', { tool: 'nile', baseArgs: [] }, {
    id: 'game-id', umu: '/apps/umu run', onStatus: reason => failures.push(reason)
  });
  await play();
  processMonitor.onLine('Game is out of date, please update');
  processMonitor.onClose(1);
  await play();
  processMonitor.onLine('PERAGAMES_RUNNER_START');
  processMonitor.onLine('bwrap: No permissions to create a new namespace');
  processMonitor.onLine('PERAGAMES_RUNNER_EXIT=1');
  processMonitor.onClose(0);
  await play();
  processMonitor.onLine('Unable to launch a game: fuel.json doesn\'t exist');
  processMonitor.onClose(0);
  assert.deepEqual(failures, ['update', 'runner-start', 'runtime', 'missing']);
});

test('usa os parâmetros da Epic para supervisionar o Proton diretamente no Linux', async () => {
  const moduleFile = require.resolve('../src/linux-stores');
  const requireStore = createRequire(moduleFile);
  const moduleExports = {};
  const notices = [];
  let monitor;
  const system = {
    runHostTool: async (tool, args) => {
      assert.equal(tool, 'legendary');
      assert.deepEqual(Array.from(args), ['launch', 'game-id', '--no-wine', '--json']);
      return { stdout: JSON.stringify({ game_executable: 'Game.exe', game_directory: '/games/test',
        working_directory: '/games/test', game_parameters: ['-windowed'], egl_parameters: ['-AUTH_TYPE=exchangecode'],
        environment: { WINEPREFIX: '/old-prefix' } }) };
    },
    fileExists: async () => true,
    launch: async (runner, args, options) => {
      assert.equal(runner, '/tools/umu-run');
      assert.deepEqual(Array.from(args), ['/games/test/Game.exe', '-windowed', '-AUTH_TYPE=exchangecode']);
      assert.equal(options.hostCwd, '/games/test');
      assert.equal(options.environment.WINEPREFIX, '/pfx');
      monitor = options;
    }
  };
  vm.runInNewContext(readFileSync(moduleFile, 'utf8'), {
    require: name => name === './system' ? system : name === 'node:path' ? path.posix : requireStore(name),
    process: { platform: 'linux' }, module: moduleExports
  });
  const launched = await moduleExports.exports.play('epic', { tool: 'legendary', baseArgs: [] }, {
    id: 'game-id', umu: '/tools/umu-run', environment: { WINEPREFIX: '/pfx' }, onStatus: state => notices.push(state)
  });
  assert.equal(launched, true);
  monitor.onClose(0);
  assert.deepEqual(notices, ['runner-start', 'early-exit']);
});

test('usa o umu preparado pelo PeraGames para abrir o jogo com o Proton selecionado', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'peragames-umu-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, '1.4.4');
  const file = path.join(folder, 'umu-run');
  await mkdir(folder);
  await writeFile(file, '', { mode: 0o700 });
  const runner = await windowsRunner(undefined, root, root, root);
  assert.equal(path.basename(runner.file), 'umu-run');
  assert.deepEqual(runner.environment, { PROTONPATH: 'GE-Proton', WINEPREFIX: root });
});

test('encontra a pasta real do jogo GOG e monitora a abertura pelo gogdl', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'peragames-gog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'Game');
  await mkdir(folder);
  await writeFile(path.join(folder, 'goggame-123.info'), '{}');
  const moduleFile = require.resolve('../src/linux-stores');
  const requireStore = createRequire(moduleFile);
  const moduleExports = {};
  let monitor;
  vm.runInNewContext(readFileSync(moduleFile, 'utf8'), {
    require: name => name === './system' ? { ...requireStore(name), launch: async (tool, args, options) => {
      assert.equal(tool, 'gogdl');
      assert.deepEqual(Array.from(args.slice(0, 8)), ['--auth-config-path', 'auth.json', 'launch', folder,
        '123', '--platform', 'windows', '--no-wine']);
      assert.match(args[9], /PERAGAMES_RUNNER_START/);
      monitor = options;
    } } : requireStore(name),
    process: { platform: 'linux' }, module: moduleExports
  });
  const notices = [];
  const config = { tool: 'gogdl', baseArgs: ['--auth-config-path', 'auth.json'] };
  const settings = { id: '123', folder: root, umu: '/tools/umu-run', onStatus: value => notices.push(value) };
  assert.equal(await moduleExports.exports.play('gog', config, settings), true);
  monitor.onLine('PERAGAMES_RUNNER_START');
  monitor.onLine('PERAGAMES_RUNNER_EXIT=1');
  assert.equal(await moduleExports.exports.play('gog', config, { ...settings, id: '456' }), false);
  assert.deepEqual(notices, ['runner-start', 'runner', 'missing']);
});

test('seleciona os componentes oficiais da loja por sistema e arquitetura', () => {
  assert.equal(releaseAsset('epic', 'win32', 'x64').asset, 'legendary_windows_x64.exe');
  assert.equal(releaseAsset('gog', 'darwin', 'x64').asset, 'gogdl_macos_x86_64');
  assert.equal(releaseAsset('amazon', 'linux', 'x64').asset, 'nile_linux_x86_64');
  assert.equal(releaseAsset('amazon', 'linux', 'arm64').asset, 'nile_linux_arm64');
  assert.equal(releaseAsset('amazon', 'win32', 'arm64'), undefined);
});

test('importa a biblioteca Steam com AppIDs únicos e distingue perfil invisível de biblioteca vazia', async t => {
  let response = { games: [{ appid: 620, name: 'Portal 2' }, { appid: 620, name: 'Portal 2' }, { appid: 'bad', name: 'Inválido' }] };
  t.mock.method(global, 'fetch', async url => {
    assert.equal(url.origin, 'https://api.steampowered.com');
    assert.equal(url.searchParams.get('steamid'), '76561198000000000');
    return { ok: true, json: async () => ({ response }) };
  });
  const key = 'a'.repeat(32);
  const profile = 'https://steamcommunity.com/profiles/76561198000000000/';
  assert.deepEqual((await steamAccountGames(profile, key)).games.map(game => game.appId), ['620']);
  response = { game_count: 0 };
  assert.deepEqual((await steamAccountGames(profile, key)).games, []);
  response = {};
  await assert.rejects(steamAccountGames(profile, key), /visibilidade/);
  await assert.rejects(steamAccountGames('https://example.com/profiles/76561198000000000', key), /SteamID64/);
});

test('seleciona pacotes oficiais de Proton para a arquitetura e exige verificação', () => {
  const tag = 'cachyos-11.0-20261005-slr';
  const base = 'https://github.com/CachyOS/proton-cachyos/releases/download/' + tag + '/';
  const name = 'proton-cachyos-11.0-20261005-slr-x86_64';
  const archive = { name: name + '.tar.xz', size: 450000000, browser_download_url: base + name + '.tar.xz' };
  const checksum = { name: name + '.sha512sum', size: 180, browser_download_url: base + name + '.sha512sum' };
  const release = { tag_name: tag, assets: [archive, checksum] };
  assert.equal(releasePackages('cachyos', release, 'x64')[0].checksum, checksum.browser_download_url);
  assert.deepEqual(releasePackages('cachyos', release, 'arm64'), []);
  assert.deepEqual(releasePackages('cachyos', { ...release, assets: [archive] }, 'x64'), []);
  assert.deepEqual(releasePackages('cachyos', { ...release, assets: [
    { ...archive, browser_download_url: 'https://example.com/' + archive.name }, checksum
  ] }, 'x64'), []);
});

test('detecta Proton por executável e mantém a escolha independente do prefixo', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'peragames-proton-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const steam = path.join(home, 'Steam');
  const runner = path.join(steam, 'compatibilitytools.d', 'GE-Proton11-1');
  await mkdir(runner, { recursive: true });
  await mkdir(path.join(steam, 'compatibilitytools.d', 'invalid'));
  await writeFile(path.join(runner, 'proton'), '');
  const versions = await findProtonVersions({ home, steamRoots: [steam], custom: [runner] });
  assert.deepEqual(versions.filter(version => version.path.startsWith(home)),
    [{ path: runner, name: 'GE-Proton11-1' }]);
  assert.deepEqual(protonEnvironment(undefined, home), { PROTONPATH: 'GE-Proton', WINEPREFIX: home });
  assert.deepEqual(protonEnvironment(runner, home), { PROTONPATH: runner, WINEPREFIX: home });
});

test('separa jogos da Steam e dos emuladores da seleção de Proton', () => {
  assert.equal(isWindowsGame({ file: '/games/file.EXE' }), true);
  assert.equal(isWindowsGame({ store: 'gog' }), true);
  assert.equal(isWindowsGame({ store: 'amazon' }), true);
  assert.equal(isWindowsGame({ appId: '123', file: '/games/file.exe' }), false);
  assert.equal(isWindowsGame({ emulator: 'android', file: '/games/file.exe' }), false);
});

test('aceita os formatos de login esperados e rejeita origens e identificadores inválidos', () => {
  const code = 'demo-authorization-code';
  assert.equal(loginCode('amazon', 'https://www.amazon.com/?openid.oa2.authorization_code=' + code), code);
  assert.throws(() => loginCode('amazon', 'https://www.amazon.com.other.test/?openid.oa2.authorization_code=' + code), /URL inteira/);
  assert.throws(() => loginCode('amazon', 'https://www.amazon.com/ap/signin'), /URL inteira/);
  assert.equal(loginCode('epic', JSON.stringify({ authorizationCode: code })), code);
  assert.equal(loginCode('gog', 'https://embed.gog.com/on_login_success?origin=client&code=' + code), code);
  assert.throws(() => loginCode('gog', 'https://other.example/on_login_success?code=' + code), /inválido/);
  assert.equal(storeGameId('gog', '1234567'), true);
  assert.equal(storeGameId('epic', '--option'), false);
});

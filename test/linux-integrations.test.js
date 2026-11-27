'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { findProtonVersions, isWindowsGame, protonDirectoryFromSelection, storeGamePrefix, windowsRunner } = require('../src/proton');
const { loginCode, storeGameId } = require('../src/linux-stores');
const { releasePackages } = require('../src/proton-catalog');
const { releaseAsset } = require('../src/store-tools');
const { steamAccountGames } = require('../src/steam-account');
const { readSteamShortcuts, steamShortcuts } = require('../src/system');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

test('importa os atalhos não Steam da conta ativa e calcula o ID de inicialização', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'peragames-shortcuts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const account = 76561198000000000n;
  const folder = path.join(root, 'userdata', String(account & 0xffffffffn), 'config');
  const shortcut = Buffer.concat([Buffer.from('\0shortcuts\0\x000\0\x02appid\0'), Buffer.from([0x78, 0x56, 0x34, 0x92]),
    Buffer.from('\x01AppName\0Example Recomp\0\x01Exe\0"C:/Games/Example.exe"\0\x08\x08\x08')]);
  assert.equal(readSteamShortcuts(shortcut)[0].appname, 'Example Recomp');
  assert.deepEqual(readSteamShortcuts(shortcut.subarray(0, 22)), []);
  await mkdir(folder, { recursive: true });
  await mkdir(path.join(root, 'config'));
  await writeFile(path.join(root, 'config', 'loginusers.vdf'), `"users" { "${account}" { "MostRecent" "1" } }`);
  await writeFile(path.join(folder, 'shortcuts.vdf'), shortcut);
  const id = String((0x92345678n << 32n) | 0x02000000n);
  assert.deepEqual(await steamShortcuts([root]), [{ id: 'shortcut-' + id, steamShortcut: id,
    name: 'Example Recomp', source: 'Steam · Não Steam' }]);
});

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
  processMonitor.onLine('RuntimeError: launch failed');
  processMonitor.onLine('PERAGAMES_RUNNER_EXIT=1');
  processMonitor.onClose(0);
  await play();
  processMonitor.onLine('Unable to launch a game: fuel.json doesn\'t exist');
  processMonitor.onClose(0);
  await play();
  processMonitor.onLine('ERROR: Environment variable not set or is empty: PROTONPATH');
  processMonitor.onLine('Traceback (most recent call last)');
  processMonitor.onClose(0);
  await play();
  processMonitor.onLine('/home/player/.local/share/umu/umu-shim: 14: exec: proton: not found');
  processMonitor.onClose(127);
  await play();
  processMonitor.onLine('wineserver: failed to load l_intl.nls');
  processMonitor.onLine('wine client error:0: recvmsg: Connection reset by peer');
  processMonitor.onClose(1);
  assert.deepEqual(failures, [
    'update', 'runner-start', 'runtime-namespace', 'missing', 'runtime-proton-path', 'runtime-loader', 'runtime-wine-data'
  ]);
});

test('usa os parâmetros da Epic para supervisionar o Proton diretamente no Linux', async () => {
  const moduleFile = require.resolve('../src/linux-stores');
  const requireStore = createRequire(moduleFile);
  const moduleExports = {};
  const notices = [];
  let monitor;
  const system = {
    runHostTool: async (tool, args) => {
      if (tool === 'busctl') return { stdout: JSON.stringify({ data: [[...Buffer.from('/games/Test Game'), 0], {}] }) };
      if (tool === 'test') {
        assert.ok(['/games/Test Game', '/games/Test Game/Game.exe'].includes(args[1]));
        return { stdout: '' };
      }
      assert.equal(tool, 'legendary');
      assert.deepEqual(Array.from(args), ['launch', 'game-id', '--no-wine', '--json']);
      return { stdout: JSON.stringify({ game_executable: 'Game.exe', game_directory: '/run/user/1000/doc/abc/Test Game',
        working_directory: '/run/user/1000/doc/abc/Test Game', game_parameters: ['-windowed'], egl_parameters: ['-AUTH_TYPE=exchangecode'],
        environment: { WINEPREFIX: '/old-prefix' } }) };
    },
    fileExists: async () => true,
    launch: async (runner, args, options) => {
      assert.equal(runner, '/tools/umu-run');
      assert.deepEqual(Array.from(args), ['/games/Test Game/Game.exe', '-windowed', '-AUTH_TYPE=exchangecode', 'quoted argument']);
      assert.equal(options.hostCwd, '/games/Test Game');
      assert.equal(options.environment.WINEPREFIX, '/pfx');
      assert.equal(options.environment.GAMEID, 'umu-0');
      assert.equal(options.environment.STORE, 'egs');
      monitor = options;
    }
  };
  const load = name => name === './system' ? system : name === 'node:path' ? path.posix : requireStore(name);
  const hostModule = {};
  vm.runInNewContext(readFileSync(require.resolve('../src/host-paths'), 'utf8'), {
    require: load, Buffer, process: { platform: 'linux' }, module: hostModule
  });
  vm.runInNewContext(readFileSync(moduleFile, 'utf8'), {
    require: name => name === './host-paths' ? hostModule.exports : load(name),
    process: { platform: 'linux' }, module: moduleExports
  });
  const launched = await moduleExports.exports.play('epic', { tool: 'legendary', baseArgs: [] }, {
    id: 'game-id', umu: '/tools/umu-run', environment: { PROTONPATH: 'GE-Proton', WINEPREFIX: '/pfx' },
    onStatus: state => notices.push(state), additionalArgs: ['quoted argument']
  });
  assert.equal(launched, true);
  monitor.onClose(0);
  assert.deepEqual(notices, ['runner-start', 'early-exit']);
});

test('passa ao UMU o caminho absoluto do GE-Proton detectado em modo automático', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'peragames-umu-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, '1.4.4');
  const file = path.join(folder, 'umu-run');
  await mkdir(folder);
  await writeFile(file, '', { mode: 0o700 });
  const managed = path.join(root, 'proton');
  const architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const ge = path.join(managed, 'GE-Proton11-14-' + architecture);
  await mkdir(path.join(ge, 'files/share/wine'), { recursive: true });
  await writeFile(path.join(ge, 'proton'), '', { mode: 0o700 });
  await writeFile(path.join(ge, 'toolmanifest.vdf'), '');
  assert.equal(await protonDirectoryFromSelection(managed), ge);
  assert.equal(await protonDirectoryFromSelection(ge), ge);
  const duplicate = path.join(managed, 'GE-Proton11-13-' + architecture);
  await mkdir(duplicate);
  await writeFile(path.join(duplicate, 'proton'), '');
  await writeFile(path.join(duplicate, 'toolmanifest.vdf'), '');
  assert.equal(await protonDirectoryFromSelection(managed), undefined);
  const runner = await windowsRunner(undefined, root, { home: root, umuRoot: root, managed });
  assert.equal(path.basename(runner.file), 'umu-run');
  assert.deepEqual(runner.environment, { PROTONPATH: ge, WINEPREFIX: root });
  assert.deepEqual(await windowsRunner(ge, root, { home: root, umuRoot: root, managed }), runner);
});

test('instala o GE-Proton oficial verificado quando o modo automático ainda não tem uma versão local', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'peragames-ge-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const moduleFile = require.resolve('../src/proton-catalog');
  const requireCatalog = createRequire(moduleFile);
  const catalog = {};
  const architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const name = 'GE-Proton11-14-' + architecture;
  const asset = name + '.tar.gz';
  const bytes = Buffer.from('fixture');
  const digest = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const sha512 = require('node:crypto').createHash('sha512').update(bytes).digest('hex');
  const url = 'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton11-14/' + asset;
  const releasePage = 'https://github.com/GloriousEggroll/proton-ge-custom/releases';
  let downloads = 0;
  let apiUnavailable = false;
  vm.runInNewContext(readFileSync(moduleFile, 'utf8'), {
    require: key => key === './system' ? { runHostTool: async (command, args) => {
      assert.equal(command, 'tar');
      const extracted = path.join(args[3], name);
      await mkdir(path.join(extracted, 'files/share/wine'), { recursive: true });
      await writeFile(path.join(extracted, 'proton'), '', { mode: 0o700 });
      await writeFile(path.join(extracted, 'toolmanifest.vdf'), '');
    } } : requireCatalog(key),
    process, module: catalog, AbortSignal, URL,
    fetch: async target => {
      if (target === url) {
        downloads++;
        return new Response(bytes);
      }
      if (target === releasePage + '/latest') return Response.redirect(releasePage + '/tag/GE-Proton11-14');
      if (target === url.replace('.tar.gz', '.sha512sum')) return new Response(sha512 + '  ' + asset);
      assert.match(target, /^https:\/\/api\.github\.com\/repos\/GloriousEggroll\/proton-ge-custom\/releases(?:\/latest|\?)/);
      if (apiUnavailable) return new Response(null, { status: 403 });
      return Response.json({ tag_name: 'GE-Proton11-14', assets: [
        { name: asset, size: bytes.length, browser_download_url: url, digest: 'sha256:' + digest }
      ] });
    }
  });
  const proton = {};
  const protonFile = require.resolve('../src/proton');
  const requireProton = createRequire(protonFile);
  vm.runInNewContext(readFileSync(protonFile, 'utf8'), {
    require: key => key === './proton-catalog' ? catalog.exports :
      key === './umu' ? { ensureUmu: async () => 'umu-run' } : requireProton(key),
    process, module: proton
  });
  const managed = path.join(root, 'proton');
  const run = () => proton.exports.windowsRunner('GE-Proton', root, { home: root, managed });
  const runners = await Promise.all([run(), run()]);
  for (const runner of runners) assert.equal(runner.environment.PROTONPATH, path.join(managed, name));
  assert.equal(downloads, 1);
  assert.equal((await run()).environment.PROTONPATH, path.join(managed, name));
  assert.equal(downloads, 1);
  apiUnavailable = true;
  const manualRoot = path.join(root, 'manual');
  const listing = await catalog.exports.listReleases(manualRoot, 'ge', 1);
  assert.equal(listing.websiteOnly, true);
  assert.equal(listing.entries[0].name, name);
  await catalog.exports.installRelease(manualRoot, listing.entries[0].id, () => {});
  const fallbackRoot = path.join(root, 'fallback');
  assert.equal(await catalog.exports.installLatestGE(fallbackRoot), path.join(fallbackRoot, name));
  assert.equal(downloads, 3);
});

test('separa prefixos de Wine e Proton sem perder os prefixos anteriores compatíveis', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'peragames-prefix-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'epic-example');
  await mkdir(legacy);
  await writeFile(path.join(legacy, 'system.reg'), 'wine');
  assert.equal(await storeGamePrefix(legacy, 'wine-system'), legacy);
  assert.equal(await storeGamePrefix(legacy, 'GE-Proton'), path.join(root, 'proton', 'epic-example'));
  await mkdir(path.join(legacy, 'pfx'));
  assert.equal(await storeGamePrefix(legacy, 'GE-Proton'), legacy);
  assert.equal(await storeGamePrefix(legacy, 'wine-system'), path.join(root, 'wine', 'epic-example'));
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

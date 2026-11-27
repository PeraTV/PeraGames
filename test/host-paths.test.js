'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const vm = require('node:vm');
const { hostPath, migratePaths } = require('../src/host-paths');
const { runHostTool } = require('../src/system');
const { gameLaunchOptions, knownGame, winetricksVerbs, installedLauncherExecutable } = require('../src/windows-compatibility');
const { stores } = require('../src/catalog');

function linuxModule(name, overrides) {
  const filename = require.resolve('../src/' + name);
  const nativeRequire = createRequire(filename);
  const module = {};
  vm.runInNewContext(readFileSync(filename, 'utf8'), {
    require: key => Object.hasOwn(overrides, key) ? overrides[key] : key === 'node:path' ? path.posix : nativeRequire(key),
    Buffer, module, process: { platform: 'linux', arch: 'x64', env: { FLATPAK_ID: 'io.github.PeraTV.PeraGames' } },
    URL, URLSearchParams, fetch: overrides.fetch, AbortSignal, setTimeout, clearTimeout
  });
  return module.exports;
}

test('resolve documento de diretório e de arquivo, com sufixos e espaços', async () => {
  const lookup = async ({ id }) => id === 'abc12' ? '/home/user/Games/Space Game' : '/media/Store/Game.exe';
  const directory = '/run/user/1203/doc/abc12/Space Game';
  assert.equal(await hostPath(directory + '/bin files/Game.exe', lookup), '/home/user/Games/Space Game/bin files/Game.exe');
  assert.equal(await hostPath('/run/flatpak/doc/qwert/Game.exe', lookup), '/media/Store/Game.exe');
  assert.equal(await hostPath('/home/user/Games/Space Game', lookup), '/home/user/Games/Space Game');
  await assert.rejects(hostPath(directory + '/../../other', lookup), /Flatpak expirou/);
  await assert.rejects(hostPath('/run/user/1203/doc/stale/Missing', async () => undefined), /Flatpak expirou/);
});

test('migra biblioteca antiga e metadados sem alterar saves, IDs ou argumentos', async () => {
  const dir = '/run/user/1000/doc/a1/Space Game';
  const stale = '/run/user/1000/doc/z9/Missing';
  const lookup = async parts => parts.id === 'a1' ? '/home/player/Space Game' : undefined;
  const resolve = value => hostPath(value, lookup);
  const data = {
    games: [{ id: 'epic-Quail', file: dir + '/game.exe', installFolder: dir, args: ['--example'] }],
    gameProton: { 'epic-Quail': { proton: dir + '/GE Proton', prefix: stale, prefixBackups: { proton: dir + '/old-prefix' } } },
    protonFolders: [dir + '/GE Proton'],
    preferences: { installDirectory: dir },
    played: { 'epic-Quail': 10 }
  };
  assert.equal(await migratePaths(data, resolve), true);
  assert.deepEqual(data.games[0], { id: 'epic-Quail', file: '/home/player/Space Game/game.exe',
    installFolder: '/home/player/Space Game', args: ['--example'] });
  assert.equal(data.gameProton['epic-Quail'].proton, '/home/player/Space Game/GE Proton');
  assert.equal(data.gameProton['epic-Quail'].prefix, stale);
  assert.equal(data.gameProton['epic-Quail'].prefixBackups.proton, '/home/player/Space Game/old-prefix');
  assert.deepEqual(data.played, { 'epic-Quail': 10 });
  const epic = { Quail: { install_path: dir, executable: 'Game.exe' } };
  const amazon = [{ id: 'example', path: dir }];
  assert.equal(await migratePaths(epic, resolve, true), true);
  assert.equal(await migratePaths(amazon, resolve, true), true);
  assert.equal(epic.Quail.install_path, amazon[0].path);
  assert.equal(epic.Quail.executable, 'Game.exe');
});

test('grava a migração dos registros instalados sem tocar em outros arquivos da loja', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peragames-store-paths-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = path.join(root, 'installed.json');
  const authentication = path.join(root, 'auth.json');
  await fs.writeFile(authentication, 'unchanged');
  await fs.writeFile(library, JSON.stringify([{ id: 'one', path: '/run/user/1000/doc/ab12/Game Folder' }]));
  const host = linuxModule('host-paths', { './system': {
    runHostTool: async () => ({ stdout: JSON.stringify({ data: [[...Buffer.from('/home/player/Game Folder'), 0], {}] }) })
  } });
  await host.migrateStoreFile(library);
  assert.deepEqual(JSON.parse(await fs.readFile(library, 'utf8')), [{ id: 'one', path: '/home/player/Game Folder' }]);
  assert.equal(await fs.readFile(authentication, 'utf8'), 'unchanged');
  assert.deepEqual((await fs.readdir(root)).sort(), ['auth.json', 'installed.json']);
});

test('Epic, GOG e Amazon chegam ao flatpak-spawn com caminhos reais e diagnóstico sem credenciais', async () => {
  const portalGame = '/run/user/1000/doc/aa22/Game Files';
  const portalProton = '/run/user/1000/doc/bb33/GE-Proton11-14';
  const gameDir = '/home/player/Game Files';
  const protonDir = '/home/player/GE-Proton11-14';
  const prefix = '/home/player/Pera Prefix';
  const processCalls = [];
  const execCalls = [];
  let invalidCwd = false;
  const output = (file, args, options, callback) => {
    execCalls.push(args);
    const tool = args.find(value => ['busctl', 'test', 'legendary', 'find'].includes(value));
    let stdout = '';
    let error;
    if (tool === 'busctl') stdout = JSON.stringify({ data: [[...Buffer.from(args.at(-1) === 'aa22' ? gameDir : protonDir), 0], {}] });
    if (tool === 'test' && invalidCwd && args.at(-2) === '-d' && args.at(-1) === gameDir) error = new Error('Missing path');
    if (tool === 'legendary') stdout = JSON.stringify({ game_executable: 'Start Game.exe', game_directory: portalGame,
      working_directory: portalGame, egl_parameters: ['-AUTH_PASSWORD=private-test-secret'] });
    if (tool === 'find' && args.includes(gameDir)) stdout = gameDir + '/goggame-12.info\0';
    queueMicrotask(() => callback(error, { stdout, stderr: '' }));
    return {};
  };
  const system = linuxModule('system', {
    'node:child_process': {
      execFile: output,
      spawn(file, args, options) {
        const child = new EventEmitter();
        child.unref = () => {};
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        processCalls.push({ file, args, options, child });
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }
    },
    'node:util': { promisify: fn => (...args) => new Promise((resolve, reject) => fn(...args,
      (error, value) => error ? reject(error) : resolve(value))) }
  });
  const host = linuxModule('host-paths', { './system': system });
  const proton = linuxModule('proton', { './system': system, './host-paths': host,
    './umu': { ensureUmu: async () => '/tools/umu-run' } });
  const stores = linuxModule('linux-stores', { './system': system, './host-paths': host });
  assert.equal(await proton.protonDirectoryFromSelection(portalProton), protonDir);
  const runner = await proton.windowsRunner(portalProton, prefix, {});
  assert.equal(runner.environment.PROTONPATH, protonDir);
  assert.ok(execCalls.some(args => args.at(-1) === protonDir + '/files/share/wine'));
  for (const [provider, tool, id] of [['epic', 'legendary', 'Quail'], ['gog', 'gogdl', '12'], ['amazon', 'nile', 'test-id']]) {
    const statuses = [];
    assert.equal(await stores.play(provider, { tool, baseArgs: [] }, {
      id, folder: portalGame, umu: runner.file, environment: runner.environment,
      onStatus: value => statuses.push(value), additionalArgs: ["it's one argument"]
    }), true);
    const call = processCalls.at(-1);
    assert.equal(call.file, 'flatpak-spawn');
    assert.equal(call.args[0], '--host');
    assert.ok(call.args.includes('--env=PROTONPATH=' + protonDir));
    assert.ok(call.args.every(arg => !arg.includes(portalProton) && !arg.includes(portalGame)));
    if (provider === 'epic') {
      assert.ok(call.args.includes('--directory=' + gameDir));
      assert.ok(call.args.includes(gameDir + '/Start Game.exe'));
      assert.ok(call.args.includes('-AUTH_PASSWORD=private-test-secret'));
      assert.ok(call.args.includes("it's one argument"));
    } else {
      assert.ok(call.args.includes(tool));
      assert.match(call.args.at(-1), /PERAGAMES_CWD_MISSING/);
    }
    call.child.stdout.end('Launch command: -AUTH_PASSWORD=private-test-secret\n');
    call.child.stderr.end();
    call.child.emit('close', 1);
    assert.ok(statuses.every(value => !value.includes('private-test-secret')));
  }
  invalidCwd = true;
  await assert.rejects(stores.play('epic', { tool: 'legendary', baseArgs: [] }, {
    id: 'Quail', umu: runner.file, environment: runner.environment, onStatus() {}
  }), /pasta de trabalho não existe no Linux/);
});

test('prepara cópias sem apagar prefixos existentes e restringe opções de dependências', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peragames-prefix-copy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = path.join(root, 'old prefix');
  await fs.mkdir(original);
  await fs.writeFile(path.join(original, 'save.dat'), 'progress');
  const compat = linuxModule('windows-compatibility', {
    'node:path': path, './host-paths': { hostExists: async file =>
      Boolean(file) && await fs.stat(file).then(stat => stat.isDirectory(), () => false) },
    './system': { runHostTool: async (file, args) => {
      if (file === 'realpath') return { stdout: original + '\n' };
      assert.equal(file, 'cp');
      await fs.cp(original, args.at(-1), { recursive: true });
    } },
    fetch: async url => Response.json(url.includes('codename=other-game') ? [
      { store: 'gog', codename: 'other-game', umu_id: 'umu-example' },
      { store: 'egs', codename: 'other-game', umu_id: 'umu-wrong-store' }
    ] : [])
  });
  const { next: copy, backup } = await compat.preparePrefixChange({ root, prefix: original, action: 'install' });
  assert.equal(backup, original);
  await fs.writeFile(path.join(copy, 'save.dat'), 'new progress');
  const recreated = await compat.preparePrefixChange({ root, prefix: copy, action: 'recreate' });
  assert.equal(recreated.backup, copy);
  assert.deepEqual(await fs.readdir(recreated.next), []);
  const restored = await compat.preparePrefixChange({
    root, prefix: recreated.next, previous: recreated.backup, action: 'restore'
  });
  assert.equal(restored.next, copy);
  assert.equal(restored.backup, recreated.next);
  assert.equal(await fs.readFile(path.join(restored.next, 'save.dat'), 'utf8'), 'new progress');
  await assert.rejects(compat.preparePrefixChange({ root, prefix: original, action: 'restore' }), /backup/);
  assert.equal(await fs.readFile(path.join(original, 'save.dat'), 'utf8'), 'progress');
  assert.equal(knownGame({ store: 'epic', storeId: 'Quail' }).steamId, '322110');
  assert.deepEqual(knownGame({ store: 'epic', storeId: 'Quail' }).dependencies, ['d3dcompiler_43', 'd3dx9_43']);
  const ids = await compat.umuGameEnvironment({ store: 'epic', storeId: 'Quail' }, {});
  assert.equal(ids.GAMEID, 'umu-322110');
  assert.equal(ids.STORE, 'egs');
  assert.equal((await compat.umuGameEnvironment({ store: 'gog', storeId: 'other-game' }, {})).GAMEID, 'umu-example');
  assert.equal(knownGame({ store: 'amazon', storeId: 'Quail' }), undefined);
  assert.deepEqual(winetricksVerbs('d3dcompiler_43 d3dx9_43 d3dx9_43'), ['d3dcompiler_43', 'd3dx9_43']);
  assert.throws(() => winetricksVerbs('--force'), /componentes/);
  assert.deepEqual(gameLaunchOptions({ argumentsText: 'with spaces\n-windowed' }).args, ['with spaces', '-windowed']);
  assert.throws(() => gameLaunchOptions({ environmentText: 'PROTONPATH=/other' }), /NOME=valor/);
  assert.throws(() => gameLaunchOptions({ argumentsText: '-AUTH_PASSWORD=dummy' }), /credenciais/);
});

test('diagnostica o host sem executar o jogo e omite credenciais e caminhos do relatório', async () => {
  const toolsUsed = [];
  const home = '/home/private test';
  const exe = home + '/Windows Game/Game.exe';
  const diagnostics = linuxModule('game-diagnostics', {
    './host-paths': { hostPath: async value => value, hostExists: async value => value !== exe },
    './system': {
      findLinuxCommand: async () => '/usr/bin/vulkaninfo',
      async runHostTool(tool, args) {
        toolsUsed.push([tool, ...args]);
        if (tool === 'cat') return { stdout: 'd3dcompiler_43\n-AUTH_PASSWORD=TEST_PRIVATE_VALUE\n' };
        if (tool === 'ldconfig') return { stdout: ' libGL.so.1 (libc6) => /usr/lib32/libGL.so.1\n libvulkan.so.1 (libc6) => /usr/lib32/libvulkan.so.1' };
        return { stdout: '' };
      }
    }
  });
  const result = await diagnostics.diagnoseGame({
    resolvePaths: async () => ({ directory: home + '/Windows Game', executable: exe, cwd: home + '/Windows Game' }),
    prefix: async () => home + '/Prefix', backup: home + '/Backup',
    runner: home + '/GE Proton', umu: '/usr/bin/umu-run', protonUsing: true, home,
    knownDependencies: ['d3dcompiler_43', 'd3dx9_43'], lastStage: 'dependency'
  });
  const statuses = Object.fromEntries(result.checks.map(({ key, status }) => [key, status]));
  assert.equal(statuses.executable, 'missing');
  assert.equal(statuses.cwd, 'ok');
  assert.equal(statuses.libraries32, 'detected');
  assert.equal(statuses.d3dcompiler_43, 'detected');
  assert.equal(statuses.d3dx9_43, 'unknown');
  assert.ok(toolsUsed.every(([tool]) => ['true', 'cat', 'ldconfig', 'printenv', '/usr/bin/vulkaninfo'].includes(tool)));
  const report = diagnostics.diagnosticReport({ ...result, checks: [
    ...result.checks, { key: 'authentication', status: 'Bearer TEST_PRIVATE_VALUE' },
    { key: 'authorization: TEST_PRIVATE_VALUE', status: 'ok' }
  ] });
  assert.match(report, /Winetricks d3dcompiler_43/);
  assert.match(report, /Última etapa com falha .* Dependência/);
  assert.doesNotMatch(report, /private test|Game\.exe|TEST_PRIVATE_VALUE|AUTH_PASSWORD|Bearer|authorization/i);
});

test('Winetricks usa o UMU no prefixo da cópia e relata falhas sem devolver stdout ou stderr', async () => {
  const compatibility = linuxModule('windows-compatibility', { './system': {
    launch: async (file, args, options) => {
      assert.equal(file, '/host/umu-run');
      assert.deepEqual(Array.from(args), ['winetricks', 'd3dcompiler_43', 'd3dx9_43']);
      assert.equal(options.environment.WINEPREFIX, '/host/prefix-copy');
      assert.equal(options.environment.GAMEID, 'umu-322110');
      options.onLine('ERROR: -AUTH_PASSWORD=never-forward');
    }
  } });
  await assert.rejects(compatibility.installWinetricks({ file: '/host/umu-run',
    environment: { WINEPREFIX: '/host/prefix-copy', PROTONPATH: '/host/proton' }
  }, ['d3dcompiler_43', 'd3dx9_43'], { GAMEID: 'umu-322110' }, '/host/prefix-copy'),
  { message: 'O Winetricks falhou. O prefixo anterior continua ativo.' });
});

test('abre cmd.exe no diretório real com espaços dentro do Steam Linux Runtime', {
  skip: process.platform !== 'linux' || !process.env.PERAGAMES_TEST_UMU || !process.env.PERAGAMES_TEST_PROTON
}, async t => {
  const root = await fs.mkdtemp(path.join(os.homedir(), 'peragames-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'Working Directory');
  await fs.mkdir(directory);
  const { stdout } = await runHostTool(process.env.PERAGAMES_TEST_UMU, ['cmd.exe', '/d', '/c', 'cd'], {
    hostCwd: directory, timeout: 300000, maxBuffer: 1024 * 1024,
    environment: { PROTONPATH: process.env.PERAGAMES_TEST_PROTON, WINEPREFIX: path.join(root, 'prefix'), GAMEID: 'umu-0' }
  });
  assert.ok(stdout.toLowerCase().includes(directory.replaceAll('/', '\\').toLowerCase()), 'cmd.exe deve executar no diretório real');
});

test('vincula o download do host à chamada Flatpak e só libera a fila após o processo parar', async () => {
  const controller = new AbortController();
  const child = new EventEmitter();
  Object.assign(child, { pid: 123, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
  const system = linuxModule('system', {
    'node:child_process': {
      execFile() { assert.fail('o cancelamento Flatpak deve usar o processo já iniciado'); },
      spawn(file, args) {
        assert.equal(file, 'flatpak-spawn');
        assert.deepEqual(Array.from(args), ['--host', '--watch-bus', '/host/store', 'install', 'test game']);
        return child;
      }
    }
  });
  const signals = [];
  child.kill = signal => signals.push(signal);
  let settled = false;
  const job = system.launch('/host/store', ['install', 'test game'], {
    signal: controller.signal, wait: true, onLine() {}
  }).finally(() => { settled = true; });
  controller.abort();
  assert.deepEqual(signals, ['SIGINT']);
  assert.equal(settled, false);
  child.emit('close', 1);
  await assert.rejects(job, { name: 'AbortError' });
});

test('encontra os launchers instalados em prefixos próprios com Wine ou Proton', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peragames launchers '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = {
    ea: ['pfx', 'drive_c', 'Program Files', 'Electronic Arts', 'EA Desktop', '13.805.11.6320', 'EA Desktop', 'EADesktop.exe'],
    battle: ['drive_c', 'Program Files (x86)', 'Battle.net', 'Battle.net Launcher.exe'],
    ubisoft: ['pfx', 'drive_c', 'Program Files (x86)', 'Ubisoft', 'Ubisoft Game Launcher', 'upc.exe']
  };
  for (const [id, segments] of Object.entries(files)) {
    const store = stores.find(item => item.id === id);
    const prefix = path.join(root, id);
    const file = path.join(prefix, ...segments);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '');
    assert.equal(await installedLauncherExecutable(store, prefix), file);
    assert.equal(await installedLauncherExecutable(store, root), undefined);
  }
});

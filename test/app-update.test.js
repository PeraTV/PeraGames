'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installFlatpakUpdate } = require('../src/app-update');

for (const userInstall of [true, false]) {
  test('atualiza o Flatpak no escopo instalado e permite autorização no sistema ' + (userInstall ? '(usuário)' : '(sistema)'), async () => {
    const file = '/home/test/PeraGames Updates/PeraGames-Linux-x64.flatpak';
    const commands = [];
    await installFlatpakUpdate(file, async (program, args) => {
      assert.equal(program, 'flatpak-spawn');
      commands.push(args);
      if (!userInstall && args.includes('info')) throw new Error('Not installed for this user');
    });
    assert.deepEqual(commands[0], ['--host', 'flatpak', 'info', '--user', 'io.github.PeraTV.PeraGames']);
    assert.deepEqual(commands[1], ['--host', 'flatpak', 'install',
      ...(userInstall ? ['--user', '--noninteractive'] : ['--system']),
      '--assumeyes', '--reinstall', '--bundle', file]);
  });
}

test('troca o erro bruto de autorização por uma mensagem sem caminho pessoal', async () => {
  await assert.rejects(installFlatpakUpdate('/home/test/private/game.flatpak', async (_program, args) => {
    if (args.includes('info')) throw new Error('Not installed for this user');
    throw Object.assign(new Error('Command failed: ' + args.join(' ')), {
      stderr: 'Flatpak system operation ConfigureRemote not allowed for user'
    });
  }), error => {
    assert.match(error.message, /Linux não autorizou/);
    assert.doesNotMatch(error.message, /home|ConfigureRemote/);
    return true;
  });
});

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installFlatpakUpdate } = require('../src/app-update');

const appId = 'io.github.PeraTV.PeraGames';
const listingCommand = ['--host', 'flatpak', 'list', '--user', '--app', '--columns=application'];

for (const { title, output, userInstall } of [
  {
    title: 'usa o escopo do usuário quando três branches listam o mesmo App ID',
    output: ['org.mozilla.firefox', appId, appId, appId, 'com.valvesoftware.Steam'].join('\n'),
    userInstall: true
  },
  {
    title: 'aceita linhas duplicadas com espaços e finais CRLF',
    output: `  ${appId} \r\n${appId}\r\n`,
    userInstall: true
  },
  {
    title: 'ignora IDs semelhantes, Locale, Debug, Beta e linhas com branch',
    output: [appId + '.Locale', appId + '.Debug', appId + '.Beta', appId + 'Tools',
      'org.example.' + appId, appId + '/x86_64/beta'].join('\n'),
    userInstall: false
  },
  {
    title: 'usa o escopo do sistema quando o PeraGames está ausente na instalação do usuário',
    output: 'org.mozilla.firefox\ncom.valvesoftware.Steam\n',
    userInstall: false
  },
  {
    title: 'usa o escopo do sistema quando a lista do usuário está vazia',
    output: '',
    userInstall: false
  }
]) {
  test(title, async () => {
    const file = '/home/test/PeraGames Updates/PeraGames-Linux-x64.flatpak';
    const commands = [];
    await installFlatpakUpdate(file, async (program, args, options) => {
      assert.equal(program, 'flatpak-spawn');
      commands.push({ args, options });
      if (args[2] === 'list') return { stdout: output };
    });
    assert.deepEqual(commands, [
      { args: listingCommand, options: { timeout: 15000 } },
      {
        args: ['--host', 'flatpak', 'install', ...(userInstall ? ['--user', '--noninteractive'] : ['--system']),
          '--assumeyes', '--reinstall', '--bundle', file],
        options: { timeout: 300000 }
      }
    ]);
  });
}

test('troca o erro bruto de autorização por uma mensagem sem caminho pessoal', async () => {
  await assert.rejects(installFlatpakUpdate('/home/test/private/game.flatpak', async (_program, args) => {
    if (args[2] === 'list') return { stdout: '' };
    throw Object.assign(new Error('Command failed: ' + args.join(' ')), {
      stderr: 'Flatpak system operation ConfigureRemote not allowed for user'
    });
  }), error => {
    assert.match(error.message, /Linux não autorizou/);
    assert.doesNotMatch(error.message, /home|ConfigureRemote/);
    return true;
  });
});

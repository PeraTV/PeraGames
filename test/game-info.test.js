'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lookupGame, steamAssets, titleKey } = require('../src/game-info');
const { romArguments } = require('../src/catalog');

const response = data => ({ ok: true, json: async () => data });
const steamItem = {
  appid: 2215200, success: 1, app_type: 0,
  assets: { asset_url_format: 'steam/apps/2215200/${FILENAME}', library_capsule: 'abc123/library_600x900.jpg' }
};

test('resolve a capa moderna e só aceita caminhos de arte reconhecidos', () => {
  assert.equal(steamAssets(steamItem).cover,
    'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/2215200/abc123/library_600x900.jpg');
  assert.equal(steamAssets({ assets: { ...steamItem.assets, library_capsule: 'https://other.invalid/file.jpg' } }).cover, '');
});

test('consulta um jogo independente por nome e devolve sinopse e capa da Steam', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.includes('storesearch')) {
      assert.equal(url.searchParams.get('term'), 'LEGO Batman');
      return response({ items: [{ id: 1, name: 'LEGO Batman 2' }, { id: 2215200, name: 'LEGO® Batman™' }] });
    }
    if (url.pathname.includes('GetItems')) return response({ response: { store_items: [steamItem] } });
    assert.equal(url.searchParams.get('l'), 'brazilian');
    assert.equal(url.searchParams.get('appids'), '2215200');
    return response({ 2215200: { data: { type: 'game', short_description: '<b>Uma aventura</b> &amp; ação.' } } });
  });
  const info = await lookupGame({ name: 'LEGO_Batman (USA)' });
  assert.equal(info.description, 'Uma aventura & ação.');
  assert.equal(info.source, 'Steam');
  assert.match(info.cover, /\/abc123\/library_600x900\.jpg$/);
});

test('ignora resultado parecido e busca um jogo de emulador na Wikipédia', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.hostname === 'store.steampowered.com') return response({ items: [{ name: 'Super Mario World 2', id: 1 }] });
    assert.equal(url.hostname, 'pt.wikipedia.org');
    return response({ query: { pages: [
      { title: 'Super Mario World 2', extract: 'É um jogo diferente.', pageid: 1 },
      { title: 'Super Mario World', extract: 'É um jogo eletrônico de plataforma.', pageid: 302 }
    ] } });
  });
  const info = await lookupGame({ name: 'Super Mario World (USA) [Rev 1]' });
  assert.equal(info.source, 'Wikipédia');
  assert.equal(info.url, 'https://pt.wikipedia.org/?curid=302');
  assert.equal(titleKey('LEGO® Batman™: Legacy'), 'lego batman legacy');
});

test('entrega caminho da ROM e núcleo como argumentos individuais', () => {
  const file = 'C:/Meus jogos/Jogo.rvz';
  assert.deepEqual(romArguments({ emulator: 'dolphin', file }), ['-e', file, '-C', 'Main.BluetoothPassthrough.Enabled=False']);
  assert.deepEqual(romArguments({ emulator: 'dolphin', file }, { system: 'gamecube' }), ['-e', file]);
  assert.deepEqual(romArguments({ emulator: 'dolphin', file }, { system: 'wii', passthrough: true }), ['-e', file]);
  assert.deepEqual(romArguments({ emulator: 'pcsx2', file }), ['-batch', '--', file]);
  assert.deepEqual(romArguments({ emulator: 'retroarch', core: 'C:/core.dll', file }), ['-L', 'C:/core.dll', file]);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lookupGame, steamAssets, titleKey } = require('../src/game-info');
const { getCompatibility, protonDBPage } = require('../src/game-compatibility');
const { findGridCover, verifyGridKey } = require('../src/steamgriddb');
const { romArguments } = require('../src/catalog');

const response = data => ({ ok: true, json: async () => data });
const steamItem = {
  appid: 2215200, success: 1, app_type: 0,
  assets: { asset_url_format: 'steam/apps/2215200/${FILENAME}', library_capsule: 'abc123/library_600x900.jpg' }
};

test('SteamGridDB prefere capa vertical válida e consulta pelo AppID quando conhecido', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/api/v2/grids/steam/477160');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    const base = 'https://cdn.steamgriddb.com/grid/';
    return response({ success: true, data: [
      { width: 920, height: 430, url: base + 'wide.jpg', score: 12 },
      { width: 600, height: 900, url: base + 'portrait.png', score: 5 },
      { width: 660, height: 930, url: base + 'adult.png', nsfw: true, score: 25 },
      { width: 600, height: 900, url: 'https://example.com/grid/outsider.jpg', score: 50 }
    ] });
  });
  assert.equal(await findGridCover({ appId: '477160', name: 'Human Fall Flat' }, 'fixture-key'),
    'https://cdn.steamgriddb.com/grid/portrait.png');
  assert.equal(fetch.mock.callCount(), 1);
});

test('SteamGridDB só usa um título exato e não revela a chave quando o serviço recusa a autenticação', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async input => {
    assert.match(input, /\/search\/autocomplete\/Example%20Game$/);
    return response({ success: true, data: [
      { id: 10, name: 'Example Game' }, { id: 11, name: 'Example Game' }
    ] });
  });
  assert.equal(await findGridCover({ name: 'Example Game.exe' }, 'fixture-key'), undefined);
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => ({ status: 401, ok: false }));
  await assert.rejects(verifyGridKey('fixture-key'), {
    message: 'A chave do SteamGridDB não foi aceita.'
  });
});

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

test('consulta a edição Steam para um executável independente e mantém o resultado em cache', async context => {
  const requests = context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.includes('storesearch')) {
      return response({ items: url.searchParams.get('term') === 'Human Fall Flat' ?
        [{ id: 477160, name: 'Human Fall Flat' }, { id: 1, name: 'Human Fall Flat 2' }] : [] });
    }
    if (url.hostname === 'www.protondb.com') {
      assert.match(url.pathname, /\/477160\.json$/);
      return response({ tier: 'gold', total: 31 });
    }
    return response({ 477160: { data: { platforms: { linux: false } } } });
  });
  const report = await getCompatibility({ name: 'HumanFallFlat.exe' }, 'pt-BR');
  assert.deepEqual(report, { appId: '477160', status: 'rated', tier: 'gold', total: 31 });
  assert.equal(await getCompatibility({ appId: '477160', name: 'Human Fall Flat' }), report);
  assert.equal(requests.mock.callCount(), 4);
  assert.equal(protonDBPage(report.appId), 'https://www.protondb.com/app/477160');
});

test('mostra Linux nativo quando a Steam confirma e evita atribuir a nota de títulos ambíguos', async context => {
  context.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.includes('storesearch')) return response({
      items: [{ id: 701, name: 'Game' }, { id: 702, name: 'Game' }]
    });
    assert.equal(url.hostname, 'www.protondb.com');
    return { status: 404, ok: false };
  });
  assert.deepEqual(await getCompatibility({ name: 'Game' }), { status: 'unmatched' });
  const native = await getCompatibility({ name: 'Game', info: { url: 'https://store.steampowered.com/app/701/', steamLinux: true } });
  assert.equal(native.tier, 'native');
  assert.equal(protonDBPage(undefined), 'https://www.protondb.com/explore');
});

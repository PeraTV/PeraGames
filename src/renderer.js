'use strict';

const api = window.pera;
const { languageFor, translator } = window.peraLanguage;
let t = translator(navigator.language);

function localizeMarkup(locale) {
  const language = languageFor(locale);
  document.documentElement.lang = language;
  t = translator(locale);
  if (language !== 'en') return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const label = node.data.trim();
    if (label) node.data = node.data.replace(label, () => t(label));
  }
  for (const node of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      if (node.hasAttribute(attr)) node.setAttribute(attr, t(node.getAttribute(attr)));
    }
  }
}
const byId = id => document.getElementById(id);
const galleryDefaults = [['steam', 'Steam'], ['lutris', 'Lutris'], ['heroic', 'Heroic'], ['retroarch', 'RetroArch']];
const galleryPreferencesKey = 'peragames.galleryLaunchers';
let galleryLaunchers = galleryDefaults.map(([id]) => id);
try {
  const saved = JSON.parse(localStorage.getItem(galleryPreferencesKey));
  if (Array.isArray(saved)) galleryLaunchers = saved.filter(id => typeof id === 'string');
} catch {}

function decorateTvIcons() {
  const ns = 'http://www.w3.org/2000/svg';
  for (const button of document.querySelectorAll('[data-tv], .tv-shortcut, [data-tv-icon], #gallery-store')) {
    const key = button.dataset.tv || button.dataset.target || button.dataset.tvIcon || 'store';
    const icon = document.createElementNS(ns, 'svg');
    const mark = document.createElementNS(ns, 'use');
    icon.setAttribute('class', 'tv-nav-icon');
    mark.setAttribute('href', '#tv-icon-' + key);
    icon.append(mark);
    button.firstElementChild.replaceChildren(icon);
  }
}
const steamApp = 'https://cdn.akamai.steamstatic.com/steam/apps/';
const groups = new Map([['Lojas', 'Lojas de jogos'], ['Ferramentas', 'Ferramentas'], ['Emuladores', 'Emuladores']]);
const tabs = [['all', 'Explorar'], ...groups, ['installed', 'Instalados']];
const romEmulators = [['dolphin', 'Dolphin'], ['pcsx2', 'PCSX2'], ['ppsspp', 'PPSSPP'], ['retroarch', 'RetroArch']];
const brandDomains = {
  steam: 'steampowered.com', epic: 'store.epicgames.com', gog: 'gog.com', amazon: 'amazongames.com',
  heroic: 'heroicgameslauncher.com', xbox: 'xbox.com', battle: 'battle.net', ea: 'ea.com', ubisoft: 'ubisoft.com',
  lutris: 'lutris.net', protonup: 'davidotek.github.io', wine: 'winehq.org',
  openrgb: 'openrgb.org', discord: 'discord.com', obs: 'obsproject.com', playnite: 'playnite.link',
  retroarch: 'retroarch.com', dolphin: 'dolphin-emu.org', pcsx2: 'pcsx2.net', ppsspp: 'ppsspp.org', afterburner: 'msi.com'
};
const brandSlugs = {
  'msi-player': 'msi',
  steam: 'steam', epic: 'epicgames', gog: 'gogdotcom', heroic: 'heroicgameslauncher',
  xbox: 'xbox', battle: 'battledotnet', ea: 'ea', ubisoft: 'ubisoft', lutris: 'lutris', discord: 'discord', obs: 'obsstudio'
};
const officialMarks = {
  afterburner: 'https://asset.msi.com/global/picture/app/afterburner.png',
  corectrl: 'https://gitlab.com/corectrl/corectrl/-/raw/master/resources/icon/128x128/corectrl.svg',
  playnite: 'https://playnite.link/applogo.png',
  retroarch: 'https://dl.flathub.org/media/org/libretro/RetroArch/3ee0774bac871b4ff7a8a6927c43b394/icons/128x128/org.libretro.RetroArch.png',
  openrgb: 'https://dl.flathub.org/media/org/openrgb/OpenRGB/24f61561827f19003c930ac7261ea1ee/icons/128x128/org.openrgb.OpenRGB.png',
  goverlay: 'https://dl.flathub.org/media/io/github/benjamimgois.goverlay/ec9a91653d75b0b4ce1e147d065d3ee3/icons/128x128/io.github.benjamimgois.goverlay.png',
  protonup: 'https://dl.flathub.org/media/net/davidotek/pupgui2/cb80abc806d40793dec0412c81f83c68/icons/128x128/net.davidotek.pupgui2.png',
  dolphin: 'https://raw.githubusercontent.com/dolphin-emu/dolphin/562875dd60fd/Data/Sys/Resources/dolphin_logo%402x.png',
  pcsx2: 'https://raw.githubusercontent.com/PCSX2/pcsx2/81526d4dc7cc/bin/resources/icons/AppIconLarge.png',
  ppsspp: 'https://raw.githubusercontent.com/hrydgard/ppsspp/a2f4ce214f22/source_assets/image/icon_regular.png'
};
const systems = [
  ['wii', 'Nintendo Wii', 'Dolphin', 'dolphin', 'theme-wii', 'Wii.svg'],
  ['gamecube', 'Nintendo GameCube', 'Dolphin', 'dolphin', 'theme-gamecube', 'Nintendo_GameCube_symbol_logo.svg'],
  ['pcsx2', 'PlayStation 2', 'PCSX2', 'pcsx2', 'theme-steam', 'PlayStation_2_logo.svg'],
  ['ppsspp', 'PlayStation Portable', 'PPSSPP', 'ppsspp', 'theme-psp', 'PSP_Logo.svg'],
  ['retroarch', 'Sistemas clássicos', 'RetroArch', 'retroarch', 'theme-arcade']
];
const androidSystem = ['android', 'Android', 'Atalhos de jogos', 'android', 'theme-arcade', 'Android robot.svg'];
let state = { games: [], roms: [], stores: [], featured: null, platform: '' };
let page = 'home';
let filter = 'all';
let romFilter = 'all';
let selectedGame;
let theater = false;
let theaterCategory = 'home';
let theaterSystem = '';
let theaterGame;
let homeRotation;
const highlightSources = [['pc', 'Jogos de PC'], ...[...systems, androidSystem].map(([id, name]) => [id, name]), ['all', 'Todos os jogos']];
const homePrefsKey = 'peragames.highlight';
let homePrefs = { source: 'pc', autoplay: false };
try {
  const saved = JSON.parse(localStorage.getItem(homePrefsKey));
  if (highlightSources.some(([id]) => id === saved?.source)) homePrefs = saved;
} catch {
  // Use the default choices when stored preferences cannot be read.
}
let homeSpotlight = homePrefs.pausedGame;
const highlightInterval = 8000;
let initialTv = true;
let selectedStore = 'dolphin';
let loaded = false;
let draftArt = '';
let toastTimer;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text, action, className = 'button') {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', () => action(node));
  return node;
}

function notify(message) {
  const notice = byId('tv-appearance').open ? byId('tv-appearance-feedback') :
    byId('tv-settings').open ? byId('tv-settings-feedback') :
    byId('game-editor').open ? byId('game-feedback') : byId('notice');
  clearTimeout(toastTimer);
  notice.textContent = t(message);
  notice.hidden = false;
  toastTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

async function perform(node, action, success) {
  const keepFocus = document.activeElement === node;
  node.disabled = true;
  try {
    const result = await action();
    if (result?.games) {
      state = result;
      loaded = true;
      render();
      if (byId('game-editor').open) renderGameDetails();
      if (initialTv) {
        initialTv = false;
        if (state.tv?.openOnLaunch || state.tv?.loginLaunch) enterTheater();
      }
    }
    if (success) notify(success);
    return true;
  } catch (error) {
    notify(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    return false;
  } finally {
    node.disabled = false;
    if (keepFocus && node.isConnected && document.activeElement === document.body) node.focus({ preventScroll: true });
  }
}

function switchPage(target) {
  if (target !== page) {
    byId('app-search').value = '';
    if (target !== 'library' || page !== 'home') byId('search').value = '';
  }
  page = target;
  filter = 'all';
  render();
  byId('scroll').scrollTop = 0;
}

function matches(text, query) {
  return text.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'));
}

function orderedGames(games = state.games) {
  return games.toSorted((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name, 'pt-BR'));
}

function setArt(image, sources, minWidth = 0, ambient, preferPortrait = false) {
  sources = [...new Set(sources.filter(Boolean))];
  const key = minWidth + ':' + preferPortrait + ':' + sources.join('|');
  if (image.dataset.sources === key) return;
  image.dataset.sources = key;
  if (ambient) {
    ambient.hidden = true;
    ambient.removeAttribute('src');
  }
  const urls = [...sources];
  let wideFallback;
  let usingFallback = false;
  const advance = () => {
    let next = urls.shift();
    if (!next && wideFallback && !usingFallback) {
      usingFallback = true;
      next = wideFallback;
    }
    image.hidden = !next || Boolean(minWidth) || preferPortrait;
    if (usingFallback && next === image.currentSrc && image.naturalWidth) image.onload();
    else if (next) image.src = next;
    else image.removeAttribute('src');
  };
  image.onerror = advance;
  image.onload = () => {
    if (minWidth && (image.naturalWidth < minWidth || image.naturalWidth / image.naturalHeight < 1.5)) {
      advance();
      return;
    }
    const landscape = image.naturalWidth > image.naturalHeight;
    if (preferPortrait && landscape && !usingFallback) {
      wideFallback ||= image.currentSrc;
      advance();
      return;
    }
    image.hidden = false;
    image.classList.toggle('landscape', landscape);
    image.classList.toggle('panoramic', image.naturalWidth / image.naturalHeight >= 2.7);
    if (image.classList.contains('tv-card-cover') && !landscape) {
      image.parentElement.style.setProperty('--poster-ratio', image.naturalWidth / image.naturalHeight);
    }
    if (ambient) {
      ambient.src = image.currentSrc;
      ambient.hidden = false;
    }
  };
  advance();
}

function gameArtwork(game) {
  const steam = game.appId ? steamApp + game.appId + '/' : '';
  return [game.cover, ...(game.artwork || []), ...(steam ? ['library_600x900.jpg', 'library_600x900_2x.jpg', 'header.jpg'].map(file => steam + file) : [])];
}

function gameBanners(game, preferSteamHero = false) {
  return [game.customBackdrop, preferSteamHero && game.steamHero, game.hero,
    game.appId && steamApp + game.appId + '/library_hero.jpg', ...(game.screens || [])];
}

function gameSource(game) {
  const system = systems.find(([id]) => game.system === id);
  return system ? t(system[1]) : romEmulators.find(([id]) => game.emulator === id)?.[1] || game.source;
}

function gameCard(game) {
  const card = el('article', 'game-card');
  if (game.emulator) card.dataset.system = systemOf(game);
  const art = button('', () => showGameDetails(game), 'game-art');
  art.setAttribute('aria-label', t('Detalhes de {name}', { name: game.name }));
  art.title = t('Ver detalhes de {name}', { name: game.name });
  art.append(el('span', 'game-placeholder', game.name));
  if (game.appId || game.cover || game.artwork?.length) {
    const image = el('img');
    image.alt = '';
    image.loading = 'lazy';
    setArt(image, gameArtwork(game), 0, undefined, !game.emulator && !game.customCover);
    art.append(image);
  }

  const info = el('div', 'game-info');
  info.append(el('h3', '', game.name), el('p', '', gameSource(game)));
  const actions = el('div', 'actions');
  const play = button(t('▶ Jogar'), node => perform(node, () => api.play(game.id)), 'button primary');
  const favorite = button(game.favorite ? '★' : '☆', node => perform(node, () => api.favorite(game.id)), 'button');
  favorite.setAttribute('aria-label', t('Favorito: {name}', { name: game.name }));
  favorite.setAttribute('aria-pressed', String(game.favorite));
  const feature = button(t('Fixar'), () => editFeature(game.id), 'button');
  feature.title = t('Personalizar destaque com {name}', { name: game.name });
  actions.append(play, favorite);
  if (!game.emulator) actions.append(feature);
  if (!game.appId) {
    actions.append(button(t('Remover'), node => {
      if (window.confirm(t('Remover este jogo da coleção do PeraGames?'))) perform(node, () => api.removeGame(game.id));
    }, 'plain'));
  }
  info.append(actions);
  card.append(art, info);
  return card;
}

function storeLibraryCard(game) {
  const card = el('article', 'game-card unavailable-game');
  const source = { epic: 'Epic Games', gog: 'GOG', amazon: 'Amazon Games' }[game.provider];
  const art = button('', () => showGameDetails({ ...game, source }), 'game-art');
  art.setAttribute('aria-label', t('Detalhes de {name}', { name: game.name }));
  art.append(el('span', 'game-placeholder', game.name));
  if (game.cover) {
    const image = el('img');
    image.loading = 'lazy';
    image.alt = '';
    setArt(image, [game.cover]);
    art.append(image);
  }
  const info = el('div', 'game-info');
  info.append(el('h3', '', game.name), el('p', '', source + ' · ' + t('Não instalado')));
  const install = button(t('Instalar jogo'), async node => {
    node.textContent = t('Instalando…');
    await perform(node, async () => {
      const games = await api.installLinuxStoreGame({ provider: game.provider, id: game.id });
      if (games) return api.refresh();
    });
    if (node.isConnected) node.textContent = t('Instalar jogo');
  }, 'button primary');
  info.append(install);
  card.append(art, info);
  return card;
}

function fillGames(id, games, filtered, storeGames = []) {
  const grid = byId(id);
  grid.replaceChildren(...games.map(gameCard), ...storeGames.map(storeLibraryCard));
  if (games.length || storeGames.length) return;
  const romLibrary = id === 'rom-game-cards';
  const message = !loaded ? t('Carregando biblioteca…') : filtered ? t('Nenhum jogo encontrado.') :
    romLibrary ? t('Escolha o emulador e adicione arquivos de jogos ou importe uma pasta.') :
      t('Adicione um jogo local ou atualize sua biblioteca da Steam.');
  const empty = el('div', 'empty');
  empty.append(el('p', '', message));
  if (loaded && !filtered && !romLibrary) {
    empty.append(button(t('Adicionar jogo'), addGameFromLibrary, 'button primary'));
  }
  grid.append(empty);
}

function featuredGame(id) {
  return state.games.find(game => game.id === id);
}

function featuredArt(setting, game) {
  if (setting?.art) return [setting.art];
  if (game?.appId && game.appId !== '1091500') return [game.hero, steamApp + game.appId + '/library_hero.jpg', steamApp + game.appId + '/header.jpg'];
  return game?.source === 'Local' ? [] : ['assets/feature-default.jpg',
    'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/8de85f0fe24d47d8498a48c6c8e6fe571e2e76ec/library_hero.jpg'];
}

function storeIcon(item) {
  const image = el('img', 'store-mark');
  image.alt = '';
  const slug = brandSlugs[item.id];
  const domain = brandDomains[item.id];
  setArt(image, [officialMarks[item.id], slug && ('https://cdn.simpleicons.org/' + slug + '/fff1e7'), item.executableIcon,
    domain && ('https://www.google.com/s2/favicons?sz=128&domain=' + domain)]);
  return image;
}

let previewStoreGame;
let compatibilityView;
const compatibilityTiers = {
  native: 'Nativo', platinum: 'Platina', gold: 'Ouro', silver: 'Prata', bronze: 'Bronze', borked: 'Não roda'
};

function renderCompatibility(game) {
  const indicator = byId('game-compatibility');
  const note = byId('game-compatibility-note');
  indicator.hidden = note.hidden = Boolean(game.emulator);
  delete indicator.dataset.tier;
  if (game.emulator) return;
  const result = compatibilityView?.result;
  const tier = result?.tier;
  if (tier) indicator.dataset.tier = tier;
  indicator.textContent = tier ? t(compatibilityTiers[tier]) + ' · ProtonDB ↗' :
    t('ProtonDB ↗');
  if (!result) note.textContent = t('Consultando compatibilidade no Linux…');
  else if (tier) {
    const edition = game.appId ? '' : t('Referência da edição Steam. A versão que você adicionou pode se comportar de outro jeito.');
    const source = tier === 'native' ? t('A Steam lista uma versão nativa para Linux.') :
      t('Classificação da comunidade ProtonDB.');
    const reports = tier !== 'native' && result.total > 0 ?
      t('Relatos: {count}.', { count: result.total }) : '';
    note.textContent = [source, reports, edition].filter(Boolean).join(' ');
  } else {
    note.textContent = t({
      unmatched: 'O ProtonDB não tem uma correspondência confirmada para este título.',
      unrated: 'Ainda não há uma classificação no ProtonDB.',
      unavailable: 'A consulta de compatibilidade está indisponível no momento.'
    }[result.status]);
  }
}

async function loadGameCompatibility(game, view) {
  try {
    view.result = await api.gameCompatibility({ id: game.id, provider: game.provider });
  } catch {
    view.result = { status: 'unavailable' };
  }
  if (compatibilityView === view && byId('game-editor').open) renderGameDetails();
}

function renderGameDetails() {
  const game = previewStoreGame || [...state.games, ...(state.roms || [])].find(item => item.id === selectedGame);
  if (!game) return;
  const info = game.info || {};
  byId('game-title').textContent = game.name;
  const favorite = byId('game-favorite');
  favorite.setAttribute('aria-pressed', String(Boolean(game.favorite)));
  favorite.textContent = game.favorite ? t('★ Remover dos favoritos') : t('☆ Favoritar');
  byId('game-platform').textContent = [gameSource(game), game.discId].filter(Boolean).join(' · ');
  byId('game-summary').textContent = info.customDescription || info.description || t('A sinopse aparece aqui após a busca ou quando você adicionar uma.');
  const facts = byId('game-facts');
  const labels = [['Biblioteca', gameSource(game)], ['Gêneros', info.genres], ['Lançamento', info.date], ['Desenvolvedora', info.developer]];
  facts.replaceChildren(...labels.filter(([, value]) => value).map(([label, value]) => {
    const row = el('div');
    row.append(el('dt', '', t(label)), el('dd', '', value));
    return row;
  }));
  const poster = byId('game-poster');
  poster.toggleAttribute('data-fill', !game.emulator);
  setArt(poster, gameArtwork(game), 0, undefined, !game.emulator && !game.customCover);
  setArt(byId('game-backdrop'), gameBanners(game), 900);
  byId('game-reset-cover').hidden = !game.customCover;
  byId('game-reset-backdrop').hidden = !game.customBackdrop;
  const source = byId('game-info-source');
  source.hidden = !info.source;
  source.textContent = t(info.source || '') + ' ↗';
  byId('game-query').disabled = Boolean(game.appId);
  byId('game-query-label').hidden = Boolean(game.appId);
  byId('game-proton').hidden = !game.canUseProton;
  byId('game-proton-open').hidden = !game.canUseProton;
  byId('game-setup-edit').hidden = !game.canEditSetup;
  byId('game-favorite').hidden = Boolean(previewStoreGame);
  byId('game-customize').hidden = Boolean(previewStoreGame);
  byId('game-play').textContent = t(previewStoreGame ? 'Instalar jogo' : '▶ Jogar');
  renderCompatibility(game);
}

function showProtonSettings(settings) {
  const select = byId('proton-version');
  const fallback = settings.steam ? 'steam-default' : 'GE-Proton';
  const value = settings.proton || fallback;
  const options = settings.versions.map(({ name, path, download, register }) => {
    const label = download ? t('{name} · disponível para baixar', { name }) :
      register ? t('{name} · adicionar à Steam', { name }) : name;
    return new Option(label, path);
  });
  if (value !== fallback && !options.some(option => option.value === value)) {
    options.push(new Option(t('A versão selecionada do Proton não foi encontrada.'), value));
  }
  select.replaceChildren(new Option(t(settings.steam ? 'Padrão da Steam' : 'GE-Proton mais recente (automático)'), fallback), ...options);
  select.value = value;
  select.dataset.saved = value;
  byId('proton-note').textContent = settings.steam
    ? t('Feche a Steam antes de salvar. Para instalar uma versão oficial, use Baixar pela Steam.')
    : settings.umu
    ? t('O modo automático baixa e atualiza o GE-Proton ao iniciar o jogo.')
    : t('Instale o umu-launcher no Linux para iniciar jogos com Proton.');
  byId('proton-help').hidden = settings.steam || settings.umu;
  const downloads = settings.steamDownloads || [];
  byId('proton-downloads').hidden = !downloads.length;
  byId('proton-download-version').replaceChildren(...downloads.map(({ id, name }) => new Option(name, id)));
  byId('proton-prefix-settings').hidden = settings.steam;
  byId('proton-executable-settings').hidden = !settings.canChooseExecutable;
  byId('proton-executable-text').textContent = settings.executable
    ? t('Executável do Windows: {file}', { file: settings.executable })
    : t('Este jogo abre no Linux. Para usar Proton, indique o executável da versão Windows.');
  byId('proton-executable-reset').hidden = !settings.executable;
  byId('proton-prefix-text').textContent = settings.prefix
    ? t('Prefixo Wine: {folder}', { folder: settings.prefix }) : t('Prefixo separado para este jogo');
  byId('proton-prefix-reset').hidden = !settings.prefix;
}

let pendingProton;
let latestProtonRelease;
async function listLatestProton(id, refresh = false) {
  const release = byId('proton-release');
  try {
    if (!latestProtonRelease || refresh) latestProtonRelease = await api.protonLatest(id);
    if (selectedGame === id) release.textContent = t('GE-Proton disponível: {version}', { version: latestProtonRelease });
  } catch (error) {
    if (refresh && selectedGame === id) release.textContent = t(error.message);
  }
}

async function changeProton(action) {
  if (pendingProton || !selectedGame) return;
  const id = selectedGame;
  const panel = byId('game-proton');
  const status = byId('proton-status');
  const controls = [...panel.querySelectorAll('button, select')];
  controls.forEach(control => { control.disabled = true; });
  status.textContent = t('Consultando…');
  pendingProton = true;
  try {
    const result = await action(id);
    if (selectedGame !== id) return;
    status.textContent = '';
    if (result?.versions) showProtonSettings(result);
  } catch (error) {
    if (selectedGame === id) {
      const select = byId('proton-version');
      if (select.dataset.saved) select.value = select.dataset.saved;
      status.textContent = t(error.message);
    }
  } finally {
    pendingProton = false;
    controls.forEach(control => { control.disabled = false; });
    if (selectedGame !== id && panel.open && !panel.hidden) changeProton(api.protonSettings);
  }
}

let protonCatalogPage = 0;
let protonCatalogRows = [];
let protonCatalogMore = false;
let protonCatalogBusy = false;
let downloadingProton;
const protonCatalogStatus = () => byId('proton-catalog-status');

function renderProtonCatalog() {
  byId('proton-catalog-source').disabled = protonCatalogBusy;
  const more = byId('proton-catalog-more');
  more.hidden = !protonCatalogMore;
  more.disabled = protonCatalogBusy;
  byId('proton-catalog-entries').replaceChildren(...protonCatalogRows.map(item => {
    const row = el('div', 'proton-catalog-entry');
    const size = Math.round(item.size / (1024 * 1024));
    const action = button(t(item.installed ? 'Instalado' : 'Instalar'), () => installCatalogProton(item), 'button');
    action.disabled = item.installed || protonCatalogBusy;
    row.append(el('span', '', item.name + ' · ' + size + ' MiB'), action);
    return row;
  }));
}

async function loadProtonCatalog(reset = false) {
  if (protonCatalogBusy) return;
  if (reset) {
    protonCatalogPage = 0;
    protonCatalogRows = [];
    protonCatalogMore = false;
  }
  const source = byId('proton-catalog-source').value;
  protonCatalogBusy = true;
  renderProtonCatalog();
  protonCatalogStatus().textContent = t('Consultando…');
  try {
    const { entries, next } = await api.protonCatalog({ source, page: protonCatalogPage + 1 });
    protonCatalogPage += 1;
    protonCatalogRows.push(...entries.filter(entry => !protonCatalogRows.some(row => row.id === entry.id)));
    protonCatalogMore = next;
    protonCatalogStatus().textContent = protonCatalogRows.length ? '' : t('Nenhuma versão encontrada para este sistema.');
  } catch (error) {
    protonCatalogStatus().textContent = t(error.message);
  } finally {
    protonCatalogBusy = false;
    renderProtonCatalog();
  }
}

function openProtonCatalog() {
  byId('proton-catalog-dialog').showModal();
  if (!downloadingProton) loadProtonCatalog(true);
}

function refreshInstalledProton() {
  if (byId('game-setup-dialog').open && !setupBusy) {
    const current = byId('game-setup-runner').value;
    return setupAction(async () => ({ ...await api.gameSetupRunners(), selectedRunner: current }));
  }
  if (byId('game-editor').open && byId('game-proton').open) return changeProton(api.protonSettings);
}

async function installCatalogProton(item) {
  if (protonCatalogBusy) return;
  downloadingProton = item.id;
  protonCatalogBusy = true;
  renderProtonCatalog();
  protonCatalogStatus().textContent = t('Preparando download…');
  try {
    await api.installProtonRelease(item.id);
    item.installed = true;
    protonCatalogStatus().textContent = t('Proton instalado. Selecione a versão no jogo ou launcher.');
    await refreshInstalledProton();
  } catch (error) {
    protonCatalogStatus().textContent = t(error.message);
  } finally {
    downloadingProton = undefined;
    protonCatalogBusy = false;
    renderProtonCatalog();
  }
}

function showGameDetails(game) {
  previewStoreGame = game.provider ? game : undefined;
  selectedGame = previewStoreGame ? undefined : game.id;
  const view = {};
  compatibilityView = view;
  byId('game-feedback').hidden = true;
  byId('game-query').value = game.name;
  byId('game-description').value = game.info?.customDescription || '';
  byId('game-customize').open = false;
  byId('game-proton').open = false;
  const protonVersion = byId('proton-version');
  protonVersion.replaceChildren();
  protonVersion.disabled = true;
  delete protonVersion.dataset.saved;
  byId('proton-note').textContent = '';
  byId('proton-prefix-settings').hidden = true;
  byId('proton-executable-settings').hidden = true;
  byId('proton-help').hidden = true;
  byId('proton-downloads').hidden = true;
  byId('proton-status').textContent = '';
  byId('proton-release').textContent = '';
  renderGameDetails();
  byId('game-editor').showModal();
  if (!game.emulator) loadGameCompatibility(game, view);
  if (!previewStoreGame && !game.info?.customDescription && (!game.info?.description ||
      (game.info.language || 'pt-BR') !== document.documentElement.lang)) byId('game-lookup').click();
}

let gameSetup;
let setupBusy = false;
function setupIsWindows() { return byId('game-setup-platform').value === 'windows'; }

function renderGameSetup() {
  const windows = setupIsWindows();
  byId('game-setup-platform').disabled = setupBusy || Boolean(gameSetup?.launcher);
  byId('game-setup-save').textContent = t(gameSetup?.launcher ? 'Salvar em Lojas' : 'Salvar na biblioteca');
  byId('game-setup-windows').hidden = !windows;
  byId('game-setup-install').hidden = !windows;
  byId('game-setup-save').disabled = setupBusy || !gameSetup?.file;
  byId('game-setup-executable-text').textContent = gameSetup?.file || t('Nenhum executável selecionado.');
  byId('game-setup-prefix-text').textContent = gameSetup?.prefix || gameSetup?.defaultPrefix || '';
  const cover = byId('game-setup-cover-preview');
  cover.hidden = !gameSetup?.cover;
  if (gameSetup?.cover) cover.src = gameSetup.cover;
  else cover.removeAttribute('src');
}

function setSetupRunners(versions, selection) {
  const select = byId('game-setup-runner');
  const value = selection || select.value || 'GE-Proton';
  select.replaceChildren(new Option(t('GE-Proton mais recente (automático)'), 'GE-Proton'),
    ...versions.map(({ path, name }) => new Option(t(name), path)));
  select.value = value;
}

async function setupAction(action, message = 'Consultando…') {
  if (setupBusy) return;
  setupBusy = true;
  const controls = [...byId('game-setup-dialog').querySelectorAll('button, input, select, textarea')];
  controls.forEach(control => { control.disabled = true; });
  const status = byId('game-setup-status');
  status.textContent = t(message);
  try {
    const next = await action();
    if (next) {
      gameSetup = { ...gameSetup, ...next };
      if (next.versions) setSetupRunners(next.versions, next.selectedRunner);
    }
    status.textContent = next?.installed ? t('Instalador encerrado. Escolha o executável instalado para salvar.') : '';
  } catch (error) { status.textContent = t(error.message); }
  finally {
    setupBusy = false;
    controls.forEach(control => { control.disabled = false; });
    renderGameSetup();
  }
}

function addGameFromLibrary(node) {
  if (state.platform !== 'linux' || !api.startGameSetup) return perform(node, api.addGame);
  openGameSetup();
}

function openGameSetup(id, storeId) {
  gameSetup = undefined;
  byId('game-setup-form').reset();
  byId('game-setup-title').textContent = t(storeId ? 'Configurar launcher de Windows' : id ? 'Editar inicialização' : 'Adicionar jogo ou aplicativo');
  byId('game-setup-runner').replaceChildren();
  renderGameSetup();
  byId('game-setup-dialog').showModal();
  setupAction(async () => {
    const setup = await api.startGameSetup({ id, storeId });
    byId('game-setup-platform').value = setup.windows === false ? 'linux' : 'windows';
    byId('game-setup-name').value = setup.title || '';
    byId('game-setup-args').value = setup.argumentsText || '';
    byId('game-setup-mangohud').checked = Boolean(setup.mangoHud);
    byId('game-setup-gamemode').checked = Boolean(setup.gameMode);
    return setup;
  });
}

function highlightGames() {
  const source = homePrefs.source;
  if (source === 'pc') return orderedGames();
  const roms = state.roms || [];
  return orderedGames(source === 'all' ? [...state.games, ...roms] : roms.filter(game => systemOf(game) === source));
}

function saveHomeHighlight(prefs) {
  homePrefs = { ...prefs, pausedGame: prefs.autoplay ? undefined : homeSpotlight };
  try { localStorage.setItem(homePrefsKey, JSON.stringify(homePrefs)); } catch {}
  renderHero();
}

function renderHero() {
  const games = highlightGames();
  const rotatingGame = (homePrefs.autoplay || homeSpotlight) && (games.find(game => game.id === homeSpotlight) || games[0]);
  if (rotatingGame) homeSpotlight = rotatingGame.id;
  const emptyRotation = homePrefs.autoplay && !games.length;
  const setting = rotatingGame ? null : state.featured;
  const defaultGame = state.games.find(game => game.appId === '1091500');
  const game = rotatingGame || (setting?.gameId ? featuredGame(setting.gameId) : setting ? null : defaultGame);
  const custom = Boolean(setting);
  const title = byId('hero-title');
  title.textContent = emptyRotation ? t('Nenhum jogo neste sistema') :
    setting?.title || game?.name || (custom ? 'Meu destaque' : 'Cyberpunk 2077');
  title.title = title.textContent;
  title.classList.toggle('hero-title-long', title.textContent.length > 31);
  const source = byId('hero-source');
  source.textContent = game ? gameSource(game) : '';
  source.hidden = !(custom || rotatingGame) || !game;
  byId('hero').classList.toggle('rotating', Boolean(rotatingGame));
  if (rotatingGame) {
    setArt(byId('hero-cover'), gameBanners(game, true), 900, byId('hero-ambient'));
    setArt(byId('hero-poster'), gameArtwork(game), 0, byId('hero-poster-ambient'), !game.customCover);
  } else {
    setArt(byId('hero-cover'), emptyRotation ? [] : featuredArt(setting, game), 0, byId('hero-ambient'));
    setArt(byId('hero-poster'), [], 0, byId('hero-poster-ambient'));
  }
  const trigger = byId('featured');
  trigger.hidden = emptyRotation || (custom && !game);
  trigger.textContent = game ? t('▶ Jogar') : t('Ver na Steam ↗');
  trigger.onclick = () => perform(trigger, game ? () => api.play(game.id) : api.featureStore);
  resetHomeRotation();
}

function stepHomeHighlight() {
  const games = highlightGames();
  const index = games.findIndex(game => game.id === homeSpotlight);
  if (!games.length) return;
  homeSpotlight = games[(index + 1) % games.length].id;
  renderHero();
}

function resetHomeRotation() {
  clearInterval(homeRotation);
  if (!homePrefs.autoplay || theater || page !== 'home' || byId('hero').hidden || highlightGames().length < 2) return;
  homeRotation = setInterval(() => {
    if (document.hidden || document.querySelector('dialog[open]') ||
        byId('featured').matches(':focus, :hover')) return;
    stepHomeHighlight();
  }, highlightInterval);
}

function editFeature(gameId) {
  const setting = state.featured;
  const selected = gameId ?? setting?.gameId ?? '';
  const options = [new Option(t('Sem jogo vinculado'), ''), ...orderedGames().map(game => new Option(game.name, game.id))];
  byId('feature-game').replaceChildren(...options);
  byId('feature-game').value = featuredGame(selected) ? selected : '';
  byId('feature-source').replaceChildren(...highlightSources.map(([id, name]) => new Option(t(name), id)));
  byId('feature-source').value = homePrefs.source;
  byId('feature-autoplay').checked = gameId ? false : homePrefs.autoplay;
  byId('feature-title').value = gameId ? '' : setting?.title || '';
  draftArt = gameId ? '' : setting?.art || '';
  renderDraft();
  byId('feature-editor').showModal();
}

function renderDraft() {
  const game = featuredGame(byId('feature-game').value);
  setArt(byId('draft-cover'), featuredArt({ art: draftArt }, game));
  byId('feature-clear').disabled = !draftArt;
}

function marketTile(item, active) {
  const tile = button('', () => {
    selectedStore = item.id;
    renderCatalog();
    document.querySelector('.market-tile[aria-pressed="true"]')?.focus();
  }, 'market-tile');
  tile.dataset.store = item.id;
  tile.setAttribute('aria-pressed', String(active));
  tile.append(storeIcon(item), el('strong', '', item.name));
  if (item.installed) tile.append(el('span', 'installed-dot'));
  return tile;
}

function details(item) {
  const aside = byId('store-details');
  aside.replaceChildren();
  aside.hidden = !item;
  if (!item) return;
  aside.dataset.store = item.id;
  const art = el('div', 'detail-art');
  art.append(storeIcon(item));
  const body = el('div', 'detail-body');
  body.append(el('h2', '', item.name));
  if (item.systems) body.append(el('span', 'detail-subtitle', item.systems));
  body.append(el('p', '', item.description));
  const facts = el('dl');
  const platform = { win32: 'Windows', darwin: 'macOS' }[state.platform] || 'Linux';
  const status = item.installed ? t('Disponível') : item.userAdded ? t('Executável indisponível') :
    item.available ? t('Não instalado') : item.windowsSetup ? t('Disponível via Wine ou Proton') :
      t('Indisponível no {system}', { system: platform });
  for (const [term, value] of [[t('Sistema'), platform], [t('Fonte'), item.userAdded ? t('Atalho local') : item.available || item.installed ? item.downloadSource : '—'],
    [t('Estado'), status]]) {
    const row = el('div');
    row.append(el('dt', '', term), el('dd', '', value));
    facts.append(row);
  }
  body.append(facts);
  if (item.installed || item.available) {
    const label = item.installed ? t(item.configuredLauncher ? 'Abrir com Wine ou Proton' :
      item.windowsShortcut ? 'Abrir com Wine' : item.id === 'wine' ? 'Configurar Wine' : 'Abrir') :
      state.platform === 'linux' ? t(item.id === 'epic' ? 'Baixar a prévia oficial' : 'Instalar no Linux') :
      t('Baixar para {system}', { system: platform });
    body.append(button(label, async node => {
      if (!item.installed && item.canInstallFlatpak) node.textContent = t('Instalando pelo Flatpak…');
      await perform(node, () => item.installed ? api.openStore(item.id) : api.downloadStore(item.id),
        !item.installed && item.canInstallFlatpak ? 'Instalação concluída.' : undefined);
      if (node.isConnected) node.textContent = label;
    }, 'button primary launch'));
  }
  if (state.platform === 'linux') {
    if (['epic', 'gog', 'amazon'].includes(item.id) || item.amazonInstaller) {
      const store = item.amazonInstaller ? state.stores.find(store => store.id === 'amazon') : item;
      body.append(button(t('Conectar conta no PeraGames'), () => openLinuxStoreLibrary(store), 'button'));
    }
    if (item.windowsSetup) {
      body.append(button(t(item.configuredLauncher ? 'Editar Wine ou Proton' : 'Configurar com Wine ou Proton'),
        () => openGameSetup(undefined, item.id), 'button'));
    }
    if (item.windowsInstaller) {
      body.append(button(t('Baixar instalador do Windows ↗'), node => perform(node, () => api.openWindowsInstaller(item.id)), 'plain'));
    }
    if (item.windowsShortcut) {
      body.append(button(t('Testar teclado no Wine'), node => perform(node, async () => {
        const { version } = await api.testWineKeyboard(item.id);
        notify(t('{version}. Digite no Bloco de Notas para verificar o teclado.', { version }));
      }), 'button'));
    }
    if (item.amazonInstaller) {
      body.append(el('p', '', t('Se o login do instalador travar no Wine, conecte sua conta Amazon pelo PeraGames.')));
    }
  }
  const links = el('div', 'detail-links');
  if (item.website) links.append(button(t('Página oficial ↗'), node => perform(node, () => api.storeWebsite(item.id)), 'plain'));
  if (item.website && state.platform === 'linux') {
    links.append(button(t('Copiar link'), node => perform(node, () => api.copyStoreLink(item.id), 'Link copiado.'), 'plain'));
    if (!item.userAdded && item.id !== 'wine') {
      links.append(button(t('Buscar na loja do Linux'), node => perform(node, () => api.openLinuxSoftware(item.name)), 'plain'));
    }
  }
  if (item.available || item.userAdded) {
    links.append(button(item.custom ? t('Trocar executável') : t('Localizar executável'), node => perform(node, () => api.linkStore(item.id)), 'plain'));
  }
  if (item.custom) {
    links.append(button(item.userAdded ? t('Remover atalho') : t('Desvincular'), node => perform(node, () => api.unlinkStore(item.id)), 'plain'));
  }
  body.append(links);
  aside.append(art, body);
}

let storeDialogProvider;
let storeDialogCommand;
let storeDialogGames = [];
let storeDialogBusy = false;

function renderLinuxStoreGames() {
  const query = byId('linux-store-search').value;
  const selected = storeDialogGames.filter(game => matches(game.name, query));
  byId('linux-store-games').replaceChildren(...selected.map(game => {
    const row = el('div', 'linux-store-game');
    const install = button(t(game.installed ? 'Atualizar jogo' : 'Instalar jogo'), () => {
      storeDialogAction(provider => api.installLinuxStoreGame({ provider, id: game.id }), 'Instalando ou atualizando o jogo…');
    });
    install.disabled = storeDialogBusy;
    row.append(el('strong', '', game.name), install);
    if (game.installed) row.append(button(t('▶ Jogar'), node => {
      perform(node, () => api.play(storeDialogProvider + '-' + game.id));
    }, 'button primary'));
    return row;
  }));
}

async function storeDialogAction(action, statusText = 'Consultando…') {
  if (storeDialogBusy || !storeDialogProvider) return;
  storeDialogBusy = true;
  const status = byId('linux-store-status');
  const controls = [...byId('linux-store-dialog').querySelectorAll('button:not(#linux-store-close), input')];
  controls.forEach(control => { control.disabled = true; });
  status.textContent = t(statusText);
  try {
    const result = await action(storeDialogProvider);
    status.textContent = '';
    if (Array.isArray(result)) {
      storeDialogGames = result;
      if (!result.length) status.textContent = t('Nenhum jogo encontrado.');
      const next = await api.refresh();
      if (next?.stores) { state = next; render(); }
    }
  } catch (error) {
    status.textContent = t(error.message);
  } finally {
    storeDialogBusy = false;
    controls.forEach(control => { control.disabled = false; });
    renderLinuxStoreGames();
  }
}

function openLinuxStoreLibrary(item) {
  if (storeDialogBusy || !api.linuxStoreInfo) return;
  storeDialogProvider = item.id;
  storeDialogGames = [];
  byId('linux-store-title').textContent = item.name;
  byId('linux-store-search').value = '';
  byId('linux-store-code').value = '';
  byId('linux-store-account').hidden = true;
  byId('linux-store-setup').hidden = true;
  byId('linux-store-system').hidden = true;
  byId('linux-store-tool').hidden = true;
  byId('linux-store-amazon-help').hidden = item.id !== 'amazon';
  renderLinuxStoreGames();
  byId('linux-store-dialog').showModal();
  storeDialogAction(loadLinuxStoreLibrary);
}

async function loadLinuxStoreLibrary(provider) {
  const { ready, commandName } = await api.linuxStoreInfo(provider);
  storeDialogCommand = commandName;
  byId('linux-store-account').hidden = !ready;
  byId('linux-store-setup').hidden = ready;
  byId('linux-store-system').hidden = ready;
  byId('linux-store-tool').hidden = ready;
  if (!ready) throw new Error(t('Instale ou vincule o componente {tool} para conectar a conta.', { tool: commandName }));
  return api.linuxStoreLibrary(provider);
}

function renderCatalog() {
  const query = byId('app-search').value;
  byId('app-search-system').hidden = state.platform !== 'linux' || !query.trim();
  const visible = state.stores.filter(item =>
    (filter === 'all' || (filter === 'installed' ? item.installed : item.category === filter)) &&
    matches(item.name + ' ' + item.description, query));
  const current = visible.find(item => item.id === selectedStore) || visible[0];
  const showBanner = filter === 'all' && !query.trim();
  byId('market-banner').hidden = !showBanner;
  byId('catalog-tabs').replaceChildren(...tabs.map(([id, label]) => {
    const tab = button(t(label), () => {
      filter = id;
      renderCatalog();
      byId('catalog-tabs').querySelector('[aria-pressed="true"]')?.focus();
    });
    tab.setAttribute('aria-pressed', String(id === filter));
    return tab;
  }));

  const sections = [];
  for (const [category, label] of groups) {
    const entries = visible.filter(item => item.category === category);
    if (!entries.length) continue;
    const section = el('section', 'market-group');
    section.dataset.category = category;
    const grid = el('div', 'market-tiles');
    const limit = category === 'Ferramentas' ? 3 : 4;
    const preferred = category === 'Ferramentas' ? ['discord', 'obs', 'afterburner'] : [];
    const quick = preferred.length ? preferred.map(id => entries.find(item => item.id === id)).filter(Boolean) : entries.slice(0, limit);
    grid.append(...(showBanner ? quick : entries).map(item => marketTile(item, item === current)));
    const heading = el('div', 'market-heading');
    heading.append(el('h2', '', t(label)));
    if (showBanner && entries.length > limit) {
      heading.append(button(t('Ver todos →'), () => {
        filter = category;
        renderCatalog();
        byId('catalog-tabs').querySelector('[aria-pressed="true"]')?.focus();
      }, 'plain'));
    }
    section.append(heading, grid);
    sections.push(section);
  }
  const emptyLabel = !loaded ? t('Buscando aplicativos…') : filter === 'installed' ? t('Nenhum aplicativo detectado.') : t('Nenhum aplicativo encontrado.');
  byId('store-groups').replaceChildren(...sections, ...(sections.length ? [] : [el('p', 'empty', emptyLabel)]));
  details(current);
  document.querySelector('.market').classList.toggle('without-details', !current);
}

function render() {
  clearInterval(homeRotation);
  byId('game-accounts').hidden = state.platform !== 'linux';
  byId('library-install-filter').hidden = state.platform !== 'linux';
  if (theater) {
    renderTheater();
    return;
  }
  const catalog = page === 'stores';
  for (const nav of document.querySelectorAll('[data-page]')) {
    if (nav.dataset.page === page) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
  byId('header-search').hidden = catalog;
  byId('catalog-actions').hidden = !catalog;
  byId('home').hidden = page !== 'home';
  byId('library').hidden = page !== 'library';
  byId('emulator-library').hidden = page !== 'emulators';
  byId('catalog').hidden = !catalog;
  if (catalog) {
    renderCatalog();
    return;
  }
  if (page === 'emulators') {
    renderRoms();
    return;
  }
  const query = byId('search').value;
  const onlyFavorites = page === 'library' && byId('favorites-only').checked;
  const games = orderedGames().filter(game => (!onlyFavorites || game.favorite) && matches(game.name, query));
  if (page === 'home') {
    byId('hero').hidden = Boolean(query.trim());
    renderHero();
    fillGames('quick-games', games.slice(0, query.trim() ? games.length : 5), Boolean(query.trim()));
  } else {
    const installFilter = byId('library-install-filter').value;
    const uninstalled = !onlyFavorites && installFilter !== 'installed'
      ? Object.entries(state.ownedStoreGames || {}).flatMap(([provider, entries]) =>
        entries.filter(entry => !entry.installed && matches(entry.name, query)).map(entry => ({ ...entry, provider })))
      : [];
    const libraryGames = installFilter === 'uninstalled' ? [] : games;
    fillGames('all-game-cards', libraryGames, Boolean(query.trim() || onlyFavorites || installFilter !== 'all'), uninstalled);
  }
}

function renderRoms() {
  const query = byId('search').value;
  const roms = orderedGames(state.roms || []).filter(game =>
    (romFilter === 'all' || systemOf(game) === romFilter) && matches(game.name, query));
  const availableSystems = state.platform === 'win32' ? [...systems, androidSystem] : systems;
  const androidOption = byId('rom-emulator').querySelector('[value="android"]');
  androidOption.hidden = state.platform !== 'win32';
  const options = availableSystems.map(([id, name, label, emulator, theme, mark]) => {
    const tab = button('', () => {
      romFilter = id;
      byId('rom-emulator').value = emulator;
      renderRoms();
      byId('emulator-systems').querySelector('[aria-pressed="true"]')?.focus();
    }, 'console-card');
    tab.dataset.theme = theme;
    tab.setAttribute('aria-pressed', String(romFilter === id));
    const engine = state.stores.find(item => item.id === emulator);
    const icon = storeIcon(engine || { id: emulator });
    if (mark) setArt(icon, ['https://commons.wikimedia.org/wiki/Special:FilePath/' + mark, icon.src]);
    const count = (state.roms || []).filter(game => systemOf(game) === id).length;
    const graphic = el('span', 'system-graphic');
    graphic.dataset.system = id;
    graphic.append(icon);
    tab.dataset.system = id;
    tab.append(graphic, el('strong', '', t(name)), el('small', '', t(label) + ' · ' + t(count === 1 ? '{count} jogo' : '{count} jogos', { count })));
    return tab;
  });
  byId('emulator-systems').replaceChildren(...options);
  const selected = availableSystems.find(([id]) => romFilter === id);
  byId('rom-heading').textContent = t(selected?.[1] || 'Todos os jogos');
  const configure = byId('rom-configure');
  const emulator = selected?.[3] || byId('rom-emulator').value;
  const installed = state.stores.find(item => item.id === emulator)?.installed;
  configure.hidden = Boolean(installed) || emulator === 'android';
  byId('add-roms').textContent = emulator === 'android' ? t('+ Adicionar atalhos') : t('+ Adicionar ROMs');
  byId('add-rom-folder').hidden = emulator === 'android';
  configure.textContent = t('Localizar {name}', { name: romEmulators.find(([id]) => id === emulator)?.[1] || t('emulador') });
  configure.onclick = () => perform(configure, () => api.linkStore(emulator));
  byId('dolphin-adapter-option').hidden = emulator !== 'dolphin';
  byId('dolphin-adapter').checked = Boolean(state.dolphinPassthrough);
  fillGames('rom-game-cards', roms, romFilter !== 'all' || Boolean(query.trim()));
}

function systemOf(game) {
  return game.system || (game.emulator === 'dolphin' ? 'wii' : game.emulator);
}

function importRoms(node, folder) {
  return perform(node, async () => {
    const emulator = byId('rom-emulator').value;
    const result = await api.addRoms({ emulator, folder });
    if (result) {
      byId('search').value = '';
      if (emulator === 'android') romFilter = 'android';
      else if (!systems.some(([id, , , engine]) => id === romFilter && engine === emulator)) romFilter = 'all';
    }
    return result;
  });
}

function allTvGames() {
  const roms = state.roms || [];
  const collection = [...state.games, ...roms];
  if (theaterCategory === 'rom') return orderedGames(roms.filter(game => !theaterSystem || systemOf(game) === theaterSystem));
  if (theaterCategory === 'favorites') return orderedGames(collection.filter(game => game.favorite));
  if (theaterCategory === 'recent') return orderedGames(collection.filter(game => game.lastPlayed));
  if (theaterCategory === 'pc') return orderedGames();
  return orderedGames();
}

function tvLayout() {
  return ['cockpit', 'gallery'].includes(state.tv?.layout) ? state.tv.layout : 'cinema';
}

function initialTvCategory(layout) {
  return layout === 'cockpit' ? 'pc' : 'home';
}

function changeTvCategory(category, system = '') {
  theaterCategory = category;
  theaterSystem = system;
  const deck = byId('theater-deck');
  deck.scrollTop = 0;
  deck.scrollLeft = 0;
  renderTheater();
}

function renderTvSystems() {
  const artwork = { wii: 'wii', gamecube: 'cube', pcsx2: 'ps2', ppsspp: 'psp', retroarch: 'retro', android: 'retro' };
  const focused = document.activeElement?.dataset.system;
  const availableSystems = state.platform === 'win32' ? [...systems, androidSystem] : systems;
  const cards = availableSystems.map(([id, name]) => {
    const tile = button('', () => changeTvCategory('rom', theaterSystem === id ? '' : id), 'tv-system-card');
    tile.dataset.system = id;
    tile.setAttribute('aria-pressed', String(theaterCategory === 'rom' && theaterSystem === id));
    const image = el('img');
    image.src = 'assets/tv/' + artwork[id] + '.jpg';
    image.alt = '';
    tile.setAttribute('aria-label', t(name));
    tile.append(image, el('span', '', t(name)));
    return tile;
  });
  byId('tv-systems-list').replaceChildren(...cards);
  if (focused) cards.find(tile => tile.dataset.system === focused)?.focus({ preventScroll: true });
}

function selectTheaterGame(game) {
  theaterGame = game;
  const title = byId('theater-title');
  title.textContent = game?.name || t('Sua coleção');
  title.classList.toggle('tv-title-long', title.textContent.length > 23);
  byId('theater-label').textContent = game ? [game.info?.genres, gameSource(game)].filter(Boolean).join(' · ') : t('Nenhum jogo nesta lista');
  const synopsis = game?.info?.customDescription || game?.info?.description || '';
  byId('theater-summary').textContent = synopsis;
  byId('theater-summary').hidden = !synopsis;
  for (const id of ['theater-play', 'theater-details']) byId(id).hidden = !game;
  const favorite = byId('theater-favorite');
  favorite.hidden = !game;
  favorite.setAttribute('aria-pressed', String(Boolean(game?.favorite)));
  byId('theater-favorite-label').textContent = game?.favorite ? t('Remover dos favoritos') : t('Favoritar');
  for (const id of ['tv-action-a', 'tv-action-y']) byId(id).disabled = !game;
  setArt(byId('theater-art'), game ? gameBanners(game, tvLayout() !== 'cockpit') : [], 900, byId('theater-ambient'));
  setArt(byId('theater-portrait'), game ? gameArtwork(game) : [], 0, byId('theater-poster-ambient'));
  const tiles = [...byId('theater-deck').querySelectorAll('.tv-card')];
  const center = tiles.findIndex(tile => tile.dataset.game === game?.id);
  const positions = [...byId('tv-gallery-positions').children];
  const currentPosition = Math.round(center * (positions.length - 1) / Math.max(1, tiles.length - 1));
  for (const [index, position] of positions.entries()) {
    position.classList.toggle('is-current', index === currentPosition);
  }
  for (const [index, tile] of tiles.entries()) {
    tile.setAttribute('aria-pressed', String(tile.dataset.game === game?.id));
    if (tvLayout() === 'gallery') {
      const half = Math.floor(tiles.length / 2);
      const offset = (index - center + half + tiles.length) % tiles.length - half;
      tile.dataset.offset = String(offset);
      tile.hidden = Math.abs(offset) > 2;
    }
  }
}

function stepGallery(direction) {
  const games = allTvGames();
  if (games.length < 2) return;
  const index = games.findIndex(game => game.id === theaterGame?.id);
  selectTheaterGame(games[(index + direction + games.length) % games.length]);
}

function openGalleryStore(id) {
  leaveTheater();
  if (id) selectedStore = id;
  switchPage('stores');
}

function renderGalleryLaunchers() {
  byId('gallery-launchers').replaceChildren(...galleryLauncherChoices().filter(({ id }) => galleryLaunchers.includes(id)).map(item => {
    const { id, name } = item;
    const tile = button('', node => {
      if (item.installed) perform(node, () => api.openStore(id));
      else openGalleryStore(id);
    }, 'gallery-launcher');
    const icon = el('img', 'store-mark');
    icon.alt = '';
    icon.src = item.userAdded ? item.executableIcon || 'assets/icons/generic.png' : 'assets/icons/' + id + '.png';
    tile.append(icon, el('span', '', name));
    return tile;
  }));
}

function galleryLauncherChoices() {
  return [
    ...galleryDefaults.map(([id, name]) => ({ ...state.stores.find(store => store.id === id), id, name })),
    ...state.stores.filter(item => item.userAdded)
  ];
}

function setGalleryLauncher(id, enabled) {
  const next = new Set(galleryLaunchers);
  if (enabled) next.add(id);
  else next.delete(id);
  galleryLaunchers = [...next];
  try { localStorage.setItem(galleryPreferencesKey, JSON.stringify(galleryLaunchers)); } catch {}
  renderGalleryLaunchers();
}

function renderGalleryLauncherOptions() {
  byId('gallery-launcher-options').replaceChildren(...galleryLauncherChoices().map(({ id, name }) => {
    const label = el('label', 'tv-check');
    const control = el('input');
    control.type = 'checkbox';
    control.checked = galleryLaunchers.includes(id);
    control.addEventListener('change', () => setGalleryLauncher(id, control.checked));
    label.append(control, document.createTextNode(name));
    return label;
  }));
}

function renderTheater() {
  const layout = tvLayout();
  byId('theater').dataset.layout = layout;
  byId('theater').dataset.category = theaterCategory;
  byId('tv-pc-label').textContent = t(layout === 'gallery' ? 'Biblioteca' : 'Jogos de PC');
  byId('tv-rom-label').textContent = t('Emuladores');
  for (const tab of document.querySelectorAll('[data-tv]')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.tv === theaterCategory));
  }
  for (const shortcut of document.querySelectorAll('[data-target]')) {
    shortcut.setAttribute('aria-pressed', String(shortcut.dataset.target === theaterCategory));
  }
  const titles = { home: layout === 'cockpit' ? 'Sua próxima partida' : 'Seus jogos',
    pc: 'Jogos de PC', rom: 'Biblioteca de emuladores', favorites: 'Favoritos', recent: 'Jogos recentes' };
  byId('tv-shelf-title').textContent = t(titles[theaterCategory]);
  renderTvSystems();
  const games = allTvGames();
  if (layout === 'gallery') renderGalleryLaunchers();
  for (const id of ['gallery-prev', 'gallery-next']) byId(id).hidden = games.length < 2;
  const selected = games.find(game => game.id === theaterGame?.id) || games[0];
  const positions = byId('tv-gallery-positions');
  const showPositions = layout === 'gallery' && games.length > 1;
  positions.hidden = !showPositions;
  positions.replaceChildren(...(showPositions
    ? games.slice(0, 5).map(() => el('span', 'tv-position'))
    : []));
  const active = document.activeElement?.dataset.game;
  const deck = byId('theater-deck');
  const items = games.map(game => {
    const tile = button('', node => {
      selectTheaterGame(game);
      playTheaterGame(node, game);
    }, 'tv-card');
    tile.dataset.game = game.id;
    tile.setAttribute('aria-label', game.name);
    const image = el('img', 'tv-card-cover');
    image.alt = '';
    image.loading = 'lazy';
    const ambient = el('img', 'tv-card-ambient');
    ambient.alt = '';
    ambient.hidden = true;
    const preferPortrait = layout !== 'cockpit' && !game.emulator && !game.customCover;
    setArt(image, gameArtwork(game), 0, ambient, preferPortrait);
    if (layout === 'cockpit') {
      const banner = el('img', 'tv-card-banner');
      banner.alt = '';
      banner.loading = 'lazy';
      setArt(banner, gameBanners(game), 520);
      tile.append(banner);
    }
    tile.append(ambient, image, el('span', '', game.name));
    tile.addEventListener('focus', () => {
      if (tile.matches(':focus-visible')) selectTheaterGame(game);
    });
    return tile;
  });
  deck.replaceChildren(...items);
  if (!games.length) {
    const message = theaterCategory === 'favorites'
      ? 'Os jogos marcados como favoritos aparecem aqui.'
      : 'Nenhum jogo nesta lista.';
    deck.append(el('p', 'tv-empty', message));
  }
  selectTheaterGame(selected);
  if (active) items.find(item => item.dataset.game === active)?.focus({ preventScroll: true });
}

function leaveTheater() {
  theater = false;
  byId('theater').hidden = true;
  document.body.classList.remove('theater-on');
  api.control('theater-exit').catch(error => notify(error.message));
  render();
  byId('enter-theater').focus();
}

function enterTheater() {
  if (theater) return;
  clearInterval(homeRotation);
  theater = true;
  setTvInput('desktop');
  theaterCategory = initialTvCategory(tvLayout());
  theaterSystem = '';
  theaterGame = undefined;
  byId('theater').hidden = false;
  document.body.classList.add('theater-on');
  api.control('theater-enter').catch(error => notify(error.message));
  renderTheater();
  document.querySelector(`[data-tv="${theaterCategory}"]`).focus({ preventScroll: true });
}

const directionKeys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function activeDialog() {
  return document.activeElement?.closest('dialog[open]') || [...document.querySelectorAll('dialog[open]')].at(-1);
}

const navigationTargets = 'button, summary, input:not([type="hidden"]), select, textarea, a[href]';

function focusDirection(key) {
  const [dx, dy] = directionKeys[key];
  const dialog = activeDialog();
  const root = dialog || (theater ? byId('theater') : document.body);
  const active = document.activeElement;
  if (document.body.dataset.input === 'gamepad' && dx && active.matches('select')) {
    const options = [...active.options].filter(option => !option.hidden && !option.disabled);
    if (!options.length) return;
    const index = options.findIndex(option => option.selected);
    active.value = options[(index + dx + options.length) % options.length].value;
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const controls = selector => [...root.querySelectorAll(selector)]
    .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && getComputedStyle(node).visibility === 'visible');
  if (dialog) {
    const items = controls(navigationTargets);
    if (!items.length) return;
    const direction = dx || dy;
    const current = items.indexOf(active);
    const next = current < 0 ? (direction < 0 ? items.length - 1 : 0) :
      (current + direction + items.length) % items.length;
    items[next].focus();
    return;
  }
  if (active === document.body || !root.contains(active)) {
    const first = theater ? byId('theater-tabs').querySelector('[aria-pressed="true"]') :
      document.querySelector('[data-page][aria-current="page"]');
    first?.focus();
    return;
  }
  const center = node => {
    const bounds = node.getBoundingClientRect();
    return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  };
  const [x, y] = center(active);
  const header = byId('theater').querySelector('.tv-header-actions');
  const tabs = byId('theater-tabs');
  const inHeader = header.contains(active);
  const inTabs = tabs.contains(active);
  const menu = controls('.tv-navigation button');
  const settings = controls('.tv-header-actions button');
  const enterSettings = inTabs && (key === 'ArrowUp' || (key === 'ArrowRight' && active === tabs.lastElementChild));
  const returnToMenu = inHeader && (key === 'ArrowDown' || (key === 'ArrowLeft' && active === header.firstElementChild));
  const destination = enterSettings ? settings : returnToMenu ? menu : null;
  const candidates = controls(navigationTargets)
    .filter(node => node !== active && (active.closest('.game-card') === node.closest('.game-card') ||
      !node.closest('.game-info')))
    .map(node => {
      const [nextX, nextY] = center(node);
      const distance = (nextX - x) * dx + (nextY - y) * dy;
      const cross = Math.abs((nextX - x) * dy + (nextY - y) * dx);
      return { node, distance, score: distance + cross * 3 };
    })
    .filter(candidate => candidate.distance > 8)
    .sort((a, b) => a.score - b.score);
  const target = destination?.sort((a, b) => Math.abs(center(a)[0] - x) - Math.abs(center(b)[0] - x))[0] || candidates[0]?.node;
  if (target) {
    target.focus({ preventScroll: true });
    if (theater && target.dataset.game && target.dataset.game !== theaterGame?.id) {
      selectTheaterGame(allTvGames().find(game => game.id === target.dataset.game));
    }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

let lastPadMove = 0;
let previousPadButtons = [];
function setTvInput(input) {
  const root = byId('theater');
  if (root.dataset.input === input) return;
  root.dataset.input = input;
  document.body.dataset.input = input;
  const controller = input === 'gamepad';
  byId('tv-input-label').textContent = controller ? t('Controle') : t('Teclado e mouse');
  byId('tv-action-a').firstElementChild.textContent = controller ? 'A' : 'Enter';
  byId('tv-action-b').firstElementChild.textContent = controller ? 'B' : 'Esc';
  byId('tv-shoulder-hint').hidden = !controller;
}

function stepNavigationTab(direction) {
  if (activeDialog()) return;
  const selector = theater ? '#theater-tabs > button' : '.titlebar [data-page]';
  const tabs = [...document.querySelectorAll(selector)].filter(tab => tab.getClientRects().length && !tab.disabled);
  if (tabs.length < 2) return;
  const current = tabs.findIndex(tab => tab.getAttribute('aria-pressed') === 'true' || tab.getAttribute('aria-current') === 'page');
  const index = current < 0 ? (direction > 0 ? 0 : tabs.length - 1) : (current + direction + tabs.length) % tabs.length;
  const tab = tabs[index];
  tab.focus({ preventScroll: true });
  tab.click();
}

function goBack() {
  const dialog = activeDialog();
  if (dialog) dialog.close();
  else if (theater) leaveTheater();
  else if (page !== 'home') {
    switchPage('home');
    document.querySelector('[data-page="home"]').focus();
  }
}

function showTheaterInfo() {
  if (theaterGame && !activeDialog()) showGameDetails(theaterGame);
}

async function playTheaterGame(node, game = theaterGame) {
  if (!game || node.disabled) return;
  const restoreFocus = document.activeElement === node;
  notify(t('Abrindo {name}…', { name: game.name }));
  await perform(node, async () => {
    const next = await api.play(game.id);
    if (next?.games) state = next;
  });
  if (restoreFocus && theater && node.isConnected && document.activeElement === document.body) {
    node.focus({ preventScroll: true });
  }
}

function pollPad(timestamp) {
  const pad = navigator.getGamepads?.().find(device => device?.connected);
  if (pad) {
    const down = index => Boolean(pad.buttons[index]?.pressed);
    const pressed = index => down(index) && !previousPadButtons[index];
    const key = down(14) || pad.axes[0] < -.54 ? 'ArrowLeft' :
      down(15) || pad.axes[0] > .54 ? 'ArrowRight' :
        down(12) || pad.axes[1] < -.54 ? 'ArrowUp' :
          down(13) || pad.axes[1] > .54 ? 'ArrowDown' : '';
    if (key || [0, 1, 3, 4, 5].some(pressed)) setTvInput('gamepad');
    if (pressed(4) && !down(5)) stepNavigationTab(-1);
    if (pressed(5) && !down(4)) stepNavigationTab(1);
    if (key && timestamp - lastPadMove > 180) {
      focusDirection(key);
      lastPadMove = timestamp;
    }
    if (pressed(0)) {
      if (document.activeElement === document.body) focusDirection('ArrowDown');
      else document.activeElement?.click();
    }
    if (pressed(1)) goBack();
    if (pressed(3) && !activeDialog()) {
      if (theater) showTheaterInfo();
      else document.activeElement?.closest('.game-card')?.querySelector('.game-art')?.click();
    }
    previousPadButtons = Array.from({ length: 6 }, (_, index) => down(index));
  } else {
    if (byId('theater').dataset.input === 'gamepad' && previousPadButtons.length) setTvInput('desktop');
    previousPadButtons = [];
  }
  requestAnimationFrame(pollPad);
}

document.addEventListener('keydown', event => {
  setTvInput('desktop');
  if (event.target.matches?.('textarea, select, input:not([type="checkbox"]), [contenteditable]')) return;
  if (event.key === 'Enter' && event.target.matches?.('input[type="checkbox"]')) {
    event.preventDefault();
    event.target.click();
    return;
  }
  if (Object.hasOwn(directionKeys, event.key)) {
    event.preventDefault();
    focusDirection(event.key);
  } else if (event.key.toLowerCase() === 'y' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !activeDialog()) {
    event.preventDefault();
    if (theater) showTheaterInfo();
    else document.activeElement?.closest('.game-card')?.querySelector('.game-art')?.click();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    goBack();
  }
});
for (const name of ['pointerdown', 'pointermove']) {
  document.addEventListener(name, event => {
    if (name === 'pointerdown' || event.movementX || event.movementY) setTvInput('desktop');
  });
}

for (const nav of document.querySelectorAll('[data-page]')) {
  nav.addEventListener('click', () => switchPage(nav.dataset.page));
}
for (const control of document.querySelectorAll('[data-window]')) {
  control.addEventListener('click', () => perform(control, () => api.control(control.dataset.window)));
}
api.onMaximized(maximized => {
  const control = document.querySelector('[data-window="maximize"]');
  control.title = maximized ? t('Restaurar') : t('Maximizar');
  control.setAttribute('aria-label', control.title);
});
byId('all-games').addEventListener('click', () => switchPage('library'));
byId('search').addEventListener('input', render);
byId('app-search').addEventListener('input', renderCatalog);
byId('app-search-system').addEventListener('click', event =>
  perform(event.currentTarget, () => api.openLinuxSoftware(byId('app-search').value)));
byId('favorites-only').addEventListener('change', render);
byId('add-game').addEventListener('click', event => addGameFromLibrary(event.currentTarget));
byId('library-install-filter').addEventListener('change', render);
byId('game-accounts').addEventListener('click', () => {
  const dialog = byId('game-accounts-dialog');
  const options = state.stores.filter(store => ['epic', 'gog', 'amazon'].includes(store.id)).map(store => {
    const connected = Object.hasOwn(state.ownedStoreGames || {}, store.id);
    return button(store.name + ' · ' + t(connected ? 'Sincronizar' : 'Conectar'), () => {
      dialog.close();
      openLinuxStoreLibrary(store);
    });
  });
  byId('game-account-options').replaceChildren(...options);
  dialog.showModal();
});
byId('game-accounts-close').addEventListener('click', () => byId('game-accounts-dialog').close());
byId('game-setup-close').addEventListener('click', () => byId('game-setup-dialog').close());
byId('game-setup-edit').addEventListener('click', () => {
  byId('game-editor').close();
  openGameSetup(selectedGame);
});
byId('game-setup-dialog').addEventListener('cancel', event => { if (setupBusy) event.preventDefault(); });
byId('game-setup-platform').addEventListener('change', () => {
  if (gameSetup) gameSetup.file = setupIsWindows() ? gameSetup.windowsFile : gameSetup.linuxFile;
  renderGameSetup();
});
for (const [id, kind] of [['executable', 'game'], ['cover', 'cover'], ['prefix', 'prefix'], ['proton', 'proton']]) {
  byId('game-setup-' + id).addEventListener('click', () => {
    setupAction(() => api.pickGameSetup({ kind, windows: setupIsWindows() }));
  });
}
byId('game-setup-install').addEventListener('click', () => {
  setupAction(() => api.runGameInstaller({ runner: byId('game-setup-runner').value }), 'Aguardando o instalador do Windows…');
});
byId('game-setup-form').addEventListener('submit', event => {
  event.preventDefault();
  setupAction(async () => {
    state = await api.saveGameSetup({
      title: byId('game-setup-name').value,
      windows: setupIsWindows(), runner: byId('game-setup-runner').value,
      argumentsText: byId('game-setup-args').value,
      mangoHud: byId('game-setup-mangohud').checked,
      gameMode: byId('game-setup-gamemode').checked
    });
    render();
    byId('game-setup-dialog').close();
  }, 'Salvando na biblioteca…');
});
byId('refresh-games').addEventListener('click', event => perform(event.currentTarget, api.refresh, 'Biblioteca atualizada.'));
async function checkAppUpdate() {
  const status = byId('app-update-status');
  const check = byId('app-update-check');
  const release = byId('app-update-release');
  const install = byId('app-update-install');
  if (check.disabled) return;
  status.textContent = t('Consultando atualizações…');
  release.hidden = true;
  install.hidden = true;
  check.disabled = true;
  try {
    const { version, status: result, latest, installable } = await api.checkAppUpdate();
    const messages = {
      unconfigured: t('A publicação das atualizações do PeraGames ainda não foi configurada.'),
      'no-release': t('Ainda não há uma versão publicada.'),
      current: t('O PeraGames está atualizado.'),
      available: t('A versão {version} está disponível.', { version: latest })
    };
    status.textContent = t('Versão instalada: {version}. {message}', { version, message: messages[result] });
    release.hidden = result !== 'available' || installable;
    install.hidden = !installable;
  } catch {
    status.textContent = t('Não foi possível verificar a atualização. Tente novamente.');
  } finally {
    check.disabled = false;
  }
}
byId('app-update-open').addEventListener('click', () => {
  byId('app-update-dialog').showModal();
  checkAppUpdate();
});
byId('app-update-close').addEventListener('click', () => byId('app-update-dialog').close());
byId('app-update-check').addEventListener('click', checkAppUpdate);
byId('app-update-release').addEventListener('click', event => perform(event.currentTarget, api.openAppRelease));
byId('app-update-install').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = byId('app-update-status');
  const check = byId('app-update-check');
  button.disabled = true;
  check.disabled = true;
  status.textContent = t('Baixando e verificando a atualização…');
  try {
    const installed = await api.installAppUpdate();
    status.textContent = installed?.restart ? t('Atualização instalada. Feche e reabra o PeraGames pelo menu.') :
      t('A atualização está pronta para ser instalada.');
    button.hidden = true;
  } catch (error) {
    status.textContent = t(error.message);
  } finally {
    button.disabled = false;
    check.disabled = false;
  }
});
byId('enter-theater').addEventListener('click', enterTheater);
byId('exit-theater').addEventListener('click', leaveTheater);
for (const id of ['theater-play', 'tv-action-a']) {
  byId(id).addEventListener('click', event => playTheaterGame(event.currentTarget));
}
byId('theater-favorite').addEventListener('click', event => {
  if (theaterGame) perform(event.currentTarget, () => api.favorite(theaterGame.id));
});
byId('theater-details').addEventListener('click', showTheaterInfo);
byId('tv-action-y').addEventListener('click', showTheaterInfo);
byId('tv-action-b').addEventListener('click', goBack);
byId('gallery-prev').addEventListener('click', () => stepGallery(-1));
byId('gallery-next').addEventListener('click', () => stepGallery(1));
byId('gallery-store').addEventListener('click', () => openGalleryStore());
byId('gallery-config').addEventListener('click', () => {
  renderGalleryLauncherOptions();
  byId('gallery-config-dialog').showModal();
});
byId('gallery-config-close').addEventListener('click', () => byId('gallery-config-dialog').close());
byId('gallery-add-launcher').addEventListener('click', event => perform(event.currentTarget, async () => {
  const existing = new Set(state.stores.map(item => item.id));
  const result = await api.addCustomStore();
  if (result?.stores) {
    state = result;
    const item = state.stores.find(store => store.userAdded && !existing.has(store.id));
    if (item) setGalleryLauncher(item.id, true);
    renderGalleryLauncherOptions();
  }
}));
const paletteOptions = [...document.querySelectorAll('[data-scheme]')];
function applyPalette(scheme) {
  document.body.dataset.palette = scheme;
  for (const option of paletteOptions) option.setAttribute('aria-pressed', String(option.dataset.scheme === scheme));
}
let palette = 'amber';
try { palette = localStorage.getItem('peragames.palette') || palette; } catch {}
applyPalette(paletteOptions.some(option => option.dataset.scheme === palette) ? palette : 'amber');
for (const option of paletteOptions) {
  option.addEventListener('click', () => {
    applyPalette(option.dataset.scheme);
    try { localStorage.setItem('peragames.palette', option.dataset.scheme); } catch {}
  });
}
for (const id of ['open-palette', 'tv-open-palette', 'tv-palette-open']) {
  byId(id).addEventListener('click', () => byId('palette-dialog').showModal());
}
byId('close-palette').addEventListener('click', () => byId('palette-dialog').close());
for (const tab of document.querySelectorAll('[data-tv], .tv-shortcut')) {
  tab.addEventListener('click', () => changeTvCategory(tab.dataset.tv || tab.dataset.target));
}
const layoutOptions = [...document.querySelectorAll('.tv-layout-option')];
byId('tv-appearance-open').addEventListener('click', () => {
  for (const tile of layoutOptions) tile.setAttribute('aria-pressed', String(tile.dataset.layout === tvLayout()));
  byId('tv-appearance-feedback').hidden = true;
  byId('tv-appearance').showModal();
  layoutOptions.find(tile => tile.dataset.layout === tvLayout())?.focus();
});
byId('tv-appearance-close').addEventListener('click', () => byId('tv-appearance').close());
for (const tile of layoutOptions) {
  tile.addEventListener('click', async () => {
    const layout = tile.dataset.layout;
    if (await perform(tile, async () => {
      const next = await api.setTvLayout(layout);
      theaterCategory = initialTvCategory(layout);
      theaterSystem = '';
      return next;
    })) {
      byId('tv-appearance').close();
      byId('tv-appearance-open').focus();
    }
  });
}
byId('tv-settings-open').addEventListener('click', () => {
  const system = { win32: 'Windows', darwin: 'macOS' }[state.platform] || 'Linux';
  byId('tv-login-label').textContent = t('Iniciar no Modo TV ao entrar no {system}', { system });
  byId('tv-open-on-launch').checked = Boolean(state.tv?.openOnLaunch);
  byId('tv-on-login').checked = Boolean(state.tv?.atLogin);
  byId('tv-settings-feedback').hidden = true;
  byId('tv-settings').showModal();
});
byId('tv-settings-close').addEventListener('click', () => byId('tv-settings').close());
byId('tv-settings-save').addEventListener('click', async event => {
  const settings = { openOnLaunch: byId('tv-open-on-launch').checked, atLogin: byId('tv-on-login').checked };
  if (await perform(event.currentTarget, () => api.setTvSettings(settings))) byId('tv-settings').close();
});
byId('rom-all').addEventListener('click', () => { romFilter = 'all'; renderRoms(); });
byId('rom-emulator').addEventListener('change', renderRoms);
byId('dolphin-adapter').addEventListener('change', async event => {
  const node = event.currentTarget;
  if (!await perform(node, () => api.setDolphinPassthrough(node.checked))) {
    node.checked = Boolean(state.dolphinPassthrough);
  }
});
byId('add-roms').addEventListener('click', event => importRoms(event.currentTarget, false));
byId('add-rom-folder').addEventListener('click', event => importRoms(event.currentTarget, true));
byId('emulator-market').addEventListener('click', () => {
  switchPage('stores');
  filter = 'Emuladores';
  renderCatalog();
});
byId('game-close').addEventListener('click', () => byId('game-editor').close());
byId('linux-store-close').addEventListener('click', () => byId('linux-store-dialog').close());
byId('linux-store-search').addEventListener('input', renderLinuxStoreGames);
byId('linux-store-setup').addEventListener('click', () => storeDialogAction(provider => api.openLinuxStore({ provider, setup: true })));
byId('linux-store-system').addEventListener('click', () =>
  storeDialogAction(() => api.openLinuxSoftware(storeDialogCommand)));
byId('linux-store-tool').addEventListener('click', () => storeDialogAction(async provider => {
  if (await api.linkLinuxStoreTool(provider)) return loadLinuxStoreLibrary(provider);
}));
byId('linux-store-login').addEventListener('click', async () => {
  await storeDialogAction(provider => api.openLinuxStore({ provider }));
  if (!byId('linux-store-status').textContent) byId('linux-store-status').textContent = t('Cole o retorno que apareceu após entrar na conta.');
});
byId('linux-store-load').addEventListener('click', () => storeDialogAction(api.linuxStoreLibrary));
byId('linux-store-connect').addEventListener('submit', event => {
  event.preventDefault();
  if (storeDialogBusy) return;
  const input = byId('linux-store-code');
  const code = input.value;
  input.value = '';
  storeDialogAction(provider => api.connectLinuxStore({ provider, code }));
});
byId('game-proton').addEventListener('toggle', event => {
  if (event.target.open) {
    changeProton(api.protonSettings);
    if (api.protonLatest) listLatestProton(selectedGame);
  }
});
byId('game-proton-open').addEventListener('click', () => {
  const panel = byId('game-proton');
  panel.open = true;
  panel.querySelector('summary').focus();
});
byId('proton-version').addEventListener('change', event => {
  const proton = event.currentTarget.value;
  changeProton(id => api.protonSave({ id, proton }));
});
byId('proton-add').addEventListener('click', () => changeProton(api.protonAdd));
byId('proton-manager').addEventListener('click', openProtonCatalog);
byId('game-setup-proton-manager').addEventListener('click', openProtonCatalog);
byId('proton-catalog-close').addEventListener('click', () => byId('proton-catalog-dialog').close());
byId('proton-catalog-source').addEventListener('change', () => loadProtonCatalog(true));
byId('proton-catalog-more').addEventListener('click', () => loadProtonCatalog());
api.onProtonProgress?.(({ id, stage, received, total }) => {
  if (downloadingProton !== id) return;
  protonCatalogStatus().textContent = stage === 'extract' ? t('Extraindo Proton…') :
    t('Baixando Proton… {percent}%', { percent: Math.floor(received * 100 / total) });
});
byId('proton-download').addEventListener('click', () => {
  const toolId = byId('proton-download-version').value;
  changeProton(id => api.protonSteamDownload({ id, toolId }));
});
byId('proton-latest').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  await listLatestProton(selectedGame, true);
  button.disabled = false;
});
byId('proton-help').addEventListener('click', () => changeProton(api.protonHelp));
byId('proton-prefix').addEventListener('click', () => changeProton(id => api.protonPrefix({ id })));
byId('proton-prefix-reset').addEventListener('click', () => changeProton(id => api.protonPrefix({ id, reset: true })));
byId('proton-executable').addEventListener('click', () => changeProton(id => api.protonExecutable({ id })));
byId('proton-executable-reset').addEventListener('click', () => changeProton(id => api.protonExecutable({ id, reset: true })));
byId('game-lookup').addEventListener('click', async event => {
  const node = event.currentTarget;
  const id = selectedGame;
  const label = node.textContent;
  node.textContent = t('Consultando…');
  byId('game-feedback').hidden = true;
  const updated = await perform(node, () => api.lookupGame({ id, query: byId('game-query').value }));
  const game = updated && id === selectedGame && state.games.find(item => item.id === id);
  const appId = /\/app\/(\d+)\/$/.exec(game?.info?.url || '')?.[1];
  if (appId && !game.appId && appId !== compatibilityView?.result?.appId) {
    const view = {};
    compatibilityView = view;
    renderGameDetails();
    loadGameCompatibility(game, view);
  }
  node.textContent = label;
});
byId('game-cover').addEventListener('click', event => perform(event.currentTarget, () => api.pickCover(selectedGame)));
byId('game-reset-cover').addEventListener('click', event => perform(event.currentTarget, () => api.resetCover(selectedGame)));
byId('game-choose-backdrop').addEventListener('click', event => perform(event.currentTarget, () => api.pickBackdrop(selectedGame)));
byId('game-reset-backdrop').addEventListener('click', event => perform(event.currentTarget, () => api.resetBackdrop(selectedGame)));
byId('cover-search').addEventListener('click', event => perform(event.currentTarget, () =>
  api.searchCover({ id: selectedGame, query: byId('game-query').value })));
byId('game-play').addEventListener('click', event => {
  const game = previewStoreGame;
  return perform(event.currentTarget, async () => {
    if (!game) return api.play(selectedGame);
    const games = await api.installLinuxStoreGame({ provider: game.provider, id: game.id });
    if (!games) return;
    if (games.some(item => item.id === game.id && item.installed) && previewStoreGame === game) byId('game-editor').close();
    return api.refresh();
  });
});
byId('game-compatibility').addEventListener('click', event =>
  perform(event.currentTarget, () => api.gameCompatibilityLink(compatibilityView?.result?.appId)));
byId('game-favorite').addEventListener('click', event => perform(event.currentTarget, () => api.favorite(selectedGame)));
byId('game-info-source').addEventListener('click', event => perform(event.currentTarget, () => api.gameInfoSource(selectedGame)));
byId('game-save-info').addEventListener('click', event => perform(event.currentTarget, () =>
  api.saveGameInfo({ id: selectedGame, description: byId('game-description').value }), t('Sinopse salva.')));
byId('find-launchers').addEventListener('click', async event => {
  if (await perform(event.currentTarget, api.refresh)) {
    byId('app-search').value = '';
    filter = 'installed';
    renderCatalog();
    byId('catalog-tabs').querySelector('[aria-pressed="true"]')?.focus();
  }
});
byId('add-launcher').addEventListener('click', event => perform(event.currentTarget, async () => {
  const result = await api.addCustomStore();
  if (result) {
    selectedStore = result.stores.filter(item => item.userAdded).at(-1)?.id;
    filter = 'Lojas';
    byId('app-search').value = '';
  }
  return result;
}));
byId('market-feature').addEventListener('click', () => {
  selectedStore = 'goverlay';
  renderCatalog();
  byId('store-details').scrollIntoView({ block: 'nearest' });
});
byId('feature-edit').addEventListener('click', () => editFeature());
byId('feature-close').addEventListener('click', () => byId('feature-editor').close());
byId('feature-game').addEventListener('change', renderDraft);
byId('feature-clear').addEventListener('click', () => { draftArt = ''; renderDraft(); });
byId('feature-art').addEventListener('click', event => perform(event.currentTarget, async () => {
  const art = await api.pickFeatureArt();
  if (art) { draftArt = art; renderDraft(); }
}));
byId('feature-reset').addEventListener('click', async event => {
  if (await perform(event.currentTarget, () => api.saveFeature(null))) {
    homeSpotlight = undefined;
    saveHomeHighlight({ source: 'pc', autoplay: false });
    byId('feature-editor').close();
  }
});
byId('feature-form').addEventListener('submit', async event => {
  event.preventDefault();
  const previous = state.featured;
  const settings = { gameId: byId('feature-game').value, title: byId('feature-title').value, art: draftArt };
  if (await perform(byId('feature-save'), () => api.saveFeature(settings), t('Destaque salvo.'))) {
    const source = byId('feature-source').value;
    const autoplay = byId('feature-autoplay').checked;
    const edited = Object.keys(settings).some(key => settings[key] !== (previous?.[key] || ''));
    if (source !== homePrefs.source || edited) homeSpotlight = undefined;
    saveHomeHighlight({ source, autoplay });
    byId('feature-editor').close();
  }
});
async function start() {
  const locale = await api.getLocale?.().catch(() => undefined) || navigator.language;
  localizeMarkup(locale);
  decorateTvIcons();
  requestAnimationFrame(pollPad);
  render();
  perform(byId('refresh-games'), api.refresh);
}
start();

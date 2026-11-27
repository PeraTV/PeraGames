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
const galleryDefaults = [['steam', 'Steam'], ['lutris', 'Lutris'], ['retroarch', 'RetroArch']];
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
const romEmulators = [['dolphin', 'Dolphin'], ['pcsx2', 'PCSX2'], ['ppsspp', 'PPSSPP'], ['rpcs3', 'RPCS3'],
  ['shadps4', 'shadPS4'], ['xemu', 'xemu'], ['xenia', 'Xenia'], ['retroarch', 'RetroArch']];
const brandDomains = {
  steam: 'steampowered.com', epic: 'store.epicgames.com', gog: 'gog.com', amazon: 'amazongames.com',
  xbox: 'xbox.com', battle: 'battle.net', ea: 'ea.com', ubisoft: 'ubisoft.com',
  lutris: 'lutris.net', protonup: 'davidotek.github.io', wine: 'winehq.org',
  openrgb: 'openrgb.org', discord: 'discord.com', obs: 'obsproject.com', playnite: 'playnite.link',
  retroarch: 'retroarch.com', dolphin: 'dolphin-emu.org', pcsx2: 'pcsx2.net', ppsspp: 'ppsspp.org', afterburner: 'msi.com'
};
const brandSlugs = {
  'msi-player': 'msi',
  steam: 'steam', epic: 'epicgames', gog: 'gogdotcom',
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
const consoleMarks = Object.fromEntries(['dolphin', 'pcsx2', 'ppsspp', 'retroarch', 'rpcs3', 'shadps4', 'xemu', 'xenia']
  .map(id => [id, 'assets/icons/' + id + (['rpcs3', 'shadps4', 'xemu'].includes(id) ? '.svg' : '.png')]));
const systems = [
  ['wii', 'Nintendo Wii', 'Dolphin', 'dolphin', 'theme-wii', 'Wii.svg'],
  ['gamecube', 'Nintendo GameCube', 'Dolphin', 'dolphin', 'theme-gamecube', 'Nintendo_GameCube_symbol_logo.svg'],
  ['pcsx2', 'PlayStation 2', 'PCSX2', 'pcsx2', 'theme-steam', 'PlayStation_2_logo.svg'],
  ['ppsspp', 'PlayStation Portable', 'PPSSPP', 'ppsspp', 'theme-psp', 'PSP_Logo.svg'],
  ['rpcs3', 'PlayStation 3', 'RPCS3', 'rpcs3', 'theme-steam'],
  ['shadps4', 'PlayStation 4', 'shadPS4', 'shadps4', 'theme-steam'],
  ['xemu', 'Xbox', 'xemu', 'xemu', 'theme-arcade'],
  ['xenia', 'Xbox 360', 'Xenia', 'xenia', 'theme-arcade'],
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
let tvLibraryPage = 0;
const tvPageSize = 40;
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
  const notice = byId('preferences-dialog').open ? byId('prefs-feedback') :
    byId('tv-appearance').open ? byId('tv-appearance-feedback') :
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

async function playFromButton(node, id, action = () => api.play(id)) {
  if (node.disabled) return;
  const label = node.textContent;
  node.textContent = t('Iniciando…');
  node.setAttribute('aria-busy', 'true');
  try { await perform(node, action); }
  finally {
    if (node.textContent === t('Iniciando…')) node.textContent = label;
    node.removeAttribute('aria-busy');
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

function setArt(image, sources, minWidth = 0, ambient, preferPortrait = false, onMissing) {
  sources = [...new Set(sources.filter(Boolean))];
  const key = minWidth + ':' + preferPortrait + ':' + Boolean(onMissing) + ':' + sources.join('|');
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
    if (!next && !usingFallback) onMissing?.();
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
  return [game.cover, ...(game.artwork || []), ...(steam ? ['library_600x900.jpg', 'library_600x900_2x.jpg', 'header.jpg'].map(file => steam + file) : []),
    game.gridCover];
}

function gameBanners(game, preferSteamHero = false) {
  return [game.customBackdrop, preferSteamHero && game.steamHero, game.hero,
    game.appId && steamApp + game.appId + '/library_hero.jpg', ...(game.screens || [])];
}

function gameSource(game) {
  const system = systems.find(([id]) => game.system === id);
  return system ? t(system[1]) : romEmulators.find(([id]) => game.emulator === id)?.[1] || game.source;
}

function addLibraryArtwork(art, game) {
  const image = el('img', 'game-card-cover');
  image.alt = '';
  image.loading = 'lazy';
  setArt(image, gameArtwork(game), 0, undefined, !game.emulator && !game.customCover);
  art.append(image);
}

function gameCard(game) {
  const card = el('article', 'game-card');
  if (game.emulator) card.dataset.system = systemOf(game);
  const art = button('', () => showGameDetails(game), 'game-art');
  art.setAttribute('aria-label', t('Detalhes de {name}', { name: game.name }));
  art.title = t('Ver detalhes de {name}', { name: game.name });
  art.append(el('span', 'game-placeholder', game.name));
  if (game.appId || game.cover || game.artwork?.length || game.gridCover) {
    addLibraryArtwork(art, game);
  }

  const info = el('div', 'game-info');
  info.append(el('h3', '', game.name), el('p', '', gameSource(game)));
  const actions = el('div', 'actions');
  const play = button(t('▶ Jogar'), node => playFromButton(node, game.id), 'button primary');
  const favorite = button(game.favorite ? '★' : '☆', node => perform(node, () => api.favorite(game.id)), 'button');
  favorite.setAttribute('aria-label', t('Favorito: {name}', { name: game.name }));
  favorite.setAttribute('aria-pressed', String(game.favorite));
  const feature = button(t('Fixar'), () => editFeature(game.id), 'button');
  feature.title = t('Personalizar destaque com {name}', { name: game.name });
  actions.append(play, favorite);
  if (!game.emulator) actions.append(feature);
  if (!game.appId && !game.steamShortcut) {
    actions.append(button(t('Remover'), node => {
      if (window.confirm(t('Remover este jogo da coleção do PeraGames?'))) perform(node, () => api.removeGame(game.id));
    }, 'plain'));
  }
  info.append(actions);
  card.append(art, info);
  return card;
}

const canInstallStoreGame = game => state.platform !== 'darwin' || game.provider !== 'amazon';
const storeInstallLabel = game => game.provider === 'steam' ? 'Instalar pela Steam' : 'Instalar jogo';
const libraryOrigins = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', amazon: 'Amazon Games',
  'steam-shortcut': 'Atalhos não Steam', recomp: 'Jogos Recomp', exe: 'Arquivos EXE', local: 'Jogos locais' };

function storeLibraryCard(game) {
  const card = el('article', 'game-card unavailable-game');
  const source = t(libraryOrigins[game.provider] || game.provider);
  const art = button('', () => showGameDetails({ ...game, source }), 'game-art');
  art.setAttribute('aria-label', t('Detalhes de {name}', { name: game.name }));
  art.append(el('span', 'game-placeholder', game.name));
  if (game.cover) {
    addLibraryArtwork(art, game);
  }
  const info = el('div', 'game-info');
  info.append(el('h3', '', game.name), el('p', '', source + ' · ' + t('Não instalado')));
  const install = button(t(storeInstallLabel(game)), async node => {
    node.textContent = t(game.provider === 'steam' ? 'Abrindo a Steam.' : 'Instalando…');
    await perform(node, async () => {
      await queueStoreGame(game.provider, game.id);
    });
    if (node.isConnected) node.textContent = t(storeInstallLabel(game));
  }, 'button primary');
  if (canInstallStoreGame(game)) info.append(install);
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
  if (consoleMarks[item.id]) image.classList.add('emulator-mark');
  setArt(image, [consoleMarks[item.id], officialMarks[item.id], slug && ('https://cdn.simpleicons.org/' + slug + '/fff1e7'), item.executableIcon,
    domain && ('https://www.google.com/s2/favicons?sz=128&domain=' + domain)]);
  return image;
}

let previewStoreGame;
let compatibilityView;
let gridView;
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

async function loadGridCover(game, view) {
  if (view !== gridView || view.requested || !byId('game-editor').open) return;
  view.requested = true;
  try {
    const query = game.provider || game.appId ? undefined : byId('game-query').value;
    const url = await api.gridCover({ id: game.id, provider: game.provider, query });
    if (!url || view !== gridView || !byId('game-editor').open) return;
    if (game.provider) previewStoreGame.gridCover = url;
    else {
      const entry = [...state.games, ...(state.roms || [])].find(item => item.id === game.id);
      if (entry) entry.gridCover = url;
      render();
    }
    renderGameDetails();
  } catch (error) {
    if (view === gridView && byId('game-editor').open) byId('grid-status').textContent = t(error.message);
  }
}

const gameLaunchMessages = new Map();
function renderGameLaunchFeedback() {
  const feedback = byId('game-launch-feedback');
  feedback.textContent = gameLaunchMessages.get(selectedGame) || '';
  feedback.hidden = !feedback.textContent;
}

function renderGameDetails() {
  renderGameLaunchFeedback();
  const game = previewStoreGame || [...state.games, ...(state.roms || [])].find(item => item.id === selectedGame);
  if (!game) return;
  const recomp = byId('game-recomp');
  recomp.hidden = !game.canMarkRecomp;
  recomp.setAttribute('aria-pressed', String(Boolean(game.recomp)));
  recomp.textContent = t(game.recomp ? 'Desmarcar Recomp' : 'Marcar como Recomp');
  byId('game-uninstall').hidden = !game.canUninstall;
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
  const view = gridView;
  const fallback = state.gridConfigured && !game.customCover && view && !view.lookupPending
    ? () => queueMicrotask(() => loadGridCover(game, view)) : undefined;
  setArt(poster, gameArtwork(game), 0, undefined, !game.customCover && (!game.emulator || Boolean(fallback)), fallback);
  if (!view?.requested) {
    byId('grid-status').textContent = t(!state.gridConfigured ? 'Adicione sua chave para buscar capas automaticamente.' :
      state.gridKeySaved ? 'SteamGridDB conectado.' : 'SteamGridDB conectado nesta sessão.');
  }
  byId('grid-remove').hidden = !state.gridConfigured;
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
  byId('game-replace-executable').hidden = !game.canReplaceExecutable;
  byId('game-cover').hidden = Boolean(previewStoreGame);
  byId('game-online-cover').hidden = Boolean(previewStoreGame);
  byId('game-favorite').hidden = Boolean(previewStoreGame);
  byId('game-customize').hidden = Boolean(previewStoreGame);
  byId('game-play').textContent = t(previewStoreGame ? storeInstallLabel(previewStoreGame) : '▶ Jogar');
  byId('game-play').hidden = Boolean(previewStoreGame && !canInstallStoreGame(previewStoreGame));
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
  select.replaceChildren(new Option(t(settings.steam ? 'Padrão da Steam' : 'GE-Proton automático'), fallback), ...options);
  select.value = value;
  select.dataset.saved = value;
  const folder = byId('proton-folder');
  const showFolder = !settings.steam && value.startsWith('/');
  folder.hidden = !showFolder;
  folder.textContent = showFolder ? t('Pasta do Proton: {folder}', { folder: value }) : '';
  byId('proton-note').textContent = settings.steam
    ? t('Feche a Steam antes de salvar. Para instalar uma versão oficial, use Baixar pela Steam.')
    : settings.umu
    ? t('Usa o GE-Proton mais recente que encontrar no computador. Se não houver nenhum, o PeraGames baixa uma versão oficial.')
    : t('O PeraGames prepara o umu-launcher na primeira vez que você usar o Proton.');
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
  byId('proton-prefix-text').textContent = settings.activePrefix
    ? t('Prefixo Wine: {folder}', { folder: settings.activePrefix }) : t(settings.separateRunners
      ? 'Wine e Proton usam pastas separadas para os dados deste jogo.' : 'Prefixo separado para este jogo');
  byId('proton-prefix-reset').hidden = !settings.activePrefix;
  byId('proton-launch-options').hidden = Boolean(settings.steam);
  byId('proton-maintenance').hidden = !settings.canManagePrefix;
  byId('proton-restore').hidden = !settings.canRestorePrefix;
  byId('proton-arguments').value = (settings.args || []).join('\n');
  byId('proton-environment').value = Object.entries(settings.variables || {}).map(([key, value]) => key + '=' + value).join('\n');
  byId('proton-steam-id').value = settings.steamId || '';
  byId('proton-umu-id').value = settings.umuId || '';
  const profile = settings.recommendedProfile;
  const suggestions = profile?.dependencies.join(' ') || '';
  const hint = byId('proton-dependency-suggestion');
  hint.hidden = !suggestions;
  hint.textContent = profile ? t('Perfil sugerido — Steam {id}, UMU umu-{id}. Componentes: {components}', { id: profile.steamId, components: suggestions }) : '';
  byId('proton-use-profile').hidden = !profile;
  byId('proton-diagnose').hidden = !settings.canManagePrefix;
  byId('proton-guide').hidden = Boolean(settings.steam);
  byId('proton-components').value = suggestions;
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
  const controls = [...panel.querySelectorAll('button, select, input, textarea')];
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
let protonCatalogFailed = false;
let downloadingProton;
const protonCatalogStatus = () => byId('proton-catalog-status');

function renderProtonCatalog() {
  byId('proton-catalog-source').disabled = protonCatalogBusy;
  byId('proton-catalog-retry').hidden = !protonCatalogFailed;
  const more = byId('proton-catalog-more');
  more.hidden = !protonCatalogMore;
  more.disabled = protonCatalogBusy;
  byId('proton-catalog-entries').replaceChildren(...protonCatalogRows.map(item => {
    const row = el('div', 'proton-catalog-entry');
    const size = Math.round(item.size / (1024 * 1024));
    const action = button(t(item.installed ? 'Instalado' : 'Instalar'), () => installCatalogProton(item), 'button');
    action.disabled = item.installed || protonCatalogBusy;
    row.append(el('span', '', item.size ? item.name + ' · ' + size + ' MiB' : item.name), action);
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
  protonCatalogFailed = false;
  protonCatalogBusy = true;
  renderProtonCatalog();
  protonCatalogStatus().textContent = t('Consultando…');
  try {
    const { entries, next, websiteOnly } = await api.protonCatalog({ source, page: protonCatalogPage + 1 });
    protonCatalogPage += 1;
    protonCatalogRows.push(...entries.filter(entry => !protonCatalogRows.some(row => row.id === entry.id)));
    protonCatalogMore = next;
    protonCatalogStatus().textContent = websiteOnly ? t('O catálogo está indisponível. A versão abaixo veio da página oficial.') :
      protonCatalogRows.length ? '' : t('Nenhuma versão encontrada para este sistema.');
  } catch (error) {
    protonCatalogFailed = true;
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
  const needsLookup = !previewStoreGame && !game.info?.customDescription && (!game.info?.description ||
    (game.info.language || 'pt-BR') !== document.documentElement.lang);
  gridView = { lookupPending: needsLookup };
  byId('game-feedback').hidden = true;
  byId('game-query').value = game.name;
  byId('game-description').value = game.info?.customDescription || '';
  byId('game-customize').open = false;
  byId('grid-key').value = '';
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
  if (needsLookup) byId('game-lookup').click();
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
  select.replaceChildren(new Option(t('GE-Proton automático'), 'GE-Proton'),
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
    status.textContent = next?.installed ? t(next.launcher && next.file ? 'Executável encontrado. Salve para abrir em Lojas.' :
      'Instalador encerrado. Escolha o executável instalado para salvar.') : '';
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
  byId('game-setup-title').textContent = t(storeId === 'epic' ? 'Configurar launcher oficial da Epic' :
    storeId ? 'Configurar launcher de Windows' : id ? 'Editar inicialização' : 'Adicionar jogo ou aplicativo');
  byId('game-setup-epic-note').hidden = storeId !== 'epic';
  byId('game-setup-launcher-note').hidden = !['ea', 'battle', 'ubisoft'].includes(storeId);
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
  trigger.onclick = () => game ? playFromButton(trigger, game.id) : perform(trigger, api.featureStore);
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
  if (state.preferences?.motion || !homePrefs.autoplay || theater || page !== 'home' || byId('hero').hidden || highlightGames().length < 2) return;
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
  if (item.id === 'epic') {
    body.append(button(t('Biblioteca da Epic no PeraGames'), () => openStoreAccount(item), 'button primary launch'));
  }
  if (item.installed || item.available) {
    const label = item.id === 'epic' ? t(item.installed ? 'Abrir launcher oficial' : 'Baixar launcher oficial') :
      item.installed ? t(item.configuredLauncher ? 'Abrir com Wine ou Proton' :
      item.windowsShortcut ? 'Abrir com Wine' : item.id === 'wine' ? 'Configurar Wine' : 'Abrir') :
      state.platform === 'linux' ? t('Instalar no Linux') :
      t('Baixar para {system}', { system: platform });
    body.append(button(label, async node => {
      if (!item.installed && item.canInstallFlatpak) node.textContent = t('Instalando pelo Flatpak…');
      await perform(node, () => item.installed ? api.openStore(item.id) : api.downloadStore(item.id),
        !item.installed && item.canInstallFlatpak ? 'Instalação concluída.' : undefined);
      if (node.isConnected) node.textContent = label;
    }, item.id === 'epic' ? 'button' : 'button primary launch'));
  }
  if (['steam', 'gog', 'amazon'].includes(item.id) || item.amazonInstaller) {
    const store = item.amazonInstaller ? state.stores.find(store => store.id === 'amazon') : item;
    body.append(button(t('Conectar conta no PeraGames'), () => openStoreAccount(store), 'button'));
  }
  if (state.platform === 'linux') {
    if (item.windowsSetup) {
      body.append(button(t(item.id === 'epic' ? 'Configurar atalho do launcher oficial' :
        item.configuredLauncher ? 'Editar Wine ou Proton' : 'Configurar com Wine ou Proton'),
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
let storeDialogInstallable = false;
let storeDialogAutoSetup = false;

function renderLinuxStoreGames() {
  const query = byId('linux-store-search').value;
  const selected = storeDialogGames.filter(game => matches(game.name, query));
  byId('linux-store-games').replaceChildren(...selected.map(game => {
    const row = el('div', 'linux-store-game');
    const install = button(t(game.installed ? 'Atualizar jogo' : 'Instalar jogo'), node =>
      perform(node, () => queueStoreGame(storeDialogProvider, game.id)));
    install.hidden = !storeDialogInstallable;
    install.disabled = storeDialogBusy;
    row.append(el('strong', '', game.name), install);
    if (game.installed) row.append(button(t('▶ Jogar'), node => {
      playFromButton(node, storeDialogProvider + '-' + game.id);
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
    status.textContent = typeof result === 'string' ? result : '';
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
  const amazon = item.id === 'amazon';
  byId('linux-store-amazon-help').hidden = !amazon;
  byId('linux-store-amazon-paste').hidden = !amazon;
  byId('linux-store-code-label').textContent = t(amazon ? 'URL de retorno do login da Amazon' : 'Código ou URL de retorno do login');
  byId('linux-store-epic-help').hidden = item.id !== 'epic';
  renderLinuxStoreGames();
  byId('linux-store-dialog').showModal();
  storeDialogAction(loadLinuxStoreLibrary);
}

async function loadLinuxStoreLibrary(provider, sync = Object.hasOwn(state.ownedStoreGames || {}, provider)) {
  const { ready, commandName, installable, autoSetup } = await api.linuxStoreInfo(provider);
  storeDialogInstallable = Boolean(installable);
  storeDialogAutoSetup = Boolean(autoSetup);
  storeDialogCommand = commandName;
  byId('linux-store-account').hidden = !ready;
  byId('linux-store-setup').hidden = ready && !autoSetup;
  byId('linux-store-setup').textContent = t(ready ? 'Reinstalar componente' :
    autoSetup ? 'Instalar componente da loja' : 'Abrir página do componente');
  byId('linux-store-system').hidden = ready || state.platform !== 'linux';
  byId('linux-store-tool').hidden = false;
  byId('linux-store-tool').textContent = t(ready ? 'Trocar componente da loja' : 'Vincular componente da loja');
  if (!ready) throw new Error(t('Instale ou vincule o componente {tool} para conectar a conta.', { tool: commandName }));
  return sync ? api.linuxStoreLibrary(provider) : t('Componente pronto. Abra o login no navegador para conectar sua conta.');
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
  byId('game-accounts').hidden = false;
  byId('library-install-filter').hidden = !Object.keys(state.ownedStoreGames || {}).length;
  document.body.toggleAttribute('data-reduced-motion', Boolean(state.preferences?.motion));
  document.body.toggleAttribute('data-always-titles', Boolean(state.preferences?.titles));
  document.body.toggleAttribute('data-color-uninstalled', Boolean(state.preferences?.color));
  if (byId('preferences-dialog').open && settingsTab === 'accounts') renderAccounts();
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
    const searching = Boolean(query.trim());
    const favorites = games.filter(game => game.favorite);
    const recent = games.filter(game => !game.favorite).slice(0, Math.max(0, 5 - favorites.length));
    fillGames('quick-games', searching ? games : [...favorites, ...recent], searching);
  } else {
    renderPcLibrary(games, query, onlyFavorites);
  }
}

function renderPcLibrary(games, query, onlyFavorites) {
  const available = availableStoreGames();
  const countByOrigin = new Map();
  for (const origin of [...state.games.map(game => game.origin), ...available.map(game => game.provider)]) {
    countByOrigin.set(origin, (countByOrigin.get(origin) || 0) + 1);
  }
  const select = byId('library-origin-filter');
  const origin = countByOrigin.has(select.value) ? select.value : 'all';
  const total = state.games.length + available.length;
  const option = (label, id, count) => new Option(`${t(label)} (${count})`, id);
  select.replaceChildren(option('Todas as origens', 'all', total), ...Object.entries(libraryOrigins)
    .filter(([id]) => countByOrigin.has(id)).map(([id, label]) => option(label, id, countByOrigin.get(id))));
  select.value = origin;

  const installFilter = byId('library-install-filter').value;
  const libraryGames = installFilter === 'uninstalled' ? [] : games.filter(game => origin === 'all' || game.origin === origin);
  const uninstalled = !onlyFavorites && installFilter !== 'installed' ? available.filter(game =>
    (origin === 'all' || game.provider === origin) && matches(game.name, query)) : [];
  const displayed = libraryGames.length + uninstalled.length;
  const scope = origin === 'all' ? total : countByOrigin.get(origin);
  byId('library-game-count').textContent = displayed !== scope
    ? t('{count} de {total} jogos', { count: displayed, total: scope })
    : t(displayed === 1 ? '{count} jogo' : '{count} jogos', { count: displayed });
  fillGames('all-game-cards', libraryGames,
    Boolean(query.trim() || onlyFavorites || installFilter !== 'all' || origin !== 'all'), uninstalled);
}

function availableStoreGames() {
  return Object.entries(state.ownedStoreGames || {}).flatMap(([provider, entries]) => entries.filter(entry => !entry.installed)
    .map(entry => ({ ...entry, provider, source: t(libraryOrigins[provider] || provider), lastPlayed: 0 })));
}

function renderRoms() {
  const query = byId('search').value;
  const roms = orderedGames(state.roms || []).filter(game =>
    (romFilter === 'all' || systemOf(game) === romFilter) && matches(game.name, query));
  const availableSystems = state.platform === 'win32' ? [...systems, androidSystem] : systems;
  const androidOption = byId('rom-emulator').querySelector('[value="android"]');
  androidOption.hidden = state.platform !== 'win32';
  byId('rom-emulator').querySelector('[value="xenia"]').disabled = state.platform !== 'win32';
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
    if (mark && (id === 'wii' || id === 'gamecube' || id === 'android')) {
      setArt(icon, ['https://commons.wikimedia.org/wiki/Special:FilePath/' + mark, icon.src]);
    }
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
  const unavailable = emulator === 'xenia' && state.platform !== 'win32';
  configure.hidden = Boolean(installed) || emulator === 'android' || unavailable;
  byId('add-roms').disabled = unavailable;
  byId('add-rom-folder').disabled = unavailable;
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
  if (theaterCategory === 'pc') return [...orderedGames(), ...orderedGames(tvStoreGames())];
  return orderedGames();
}

const tvStoreGames = () => state.tv?.showUninstalled === false ? [] : availableStoreGames();
const tvGameKey = game => game?.provider ? `${game.provider}-${game.id}` : game?.id;
const tvItemsPerPage = () => theaterCategory === 'pc' ? 84 : tvPageSize;
const currentTvPage = games => {
  const size = tvItemsPerPage();
  return games.slice(tvLibraryPage * size, (tvLibraryPage + 1) * size);
};

function tvLayout() {
  return ['cockpit', 'gallery'].includes(state.tv?.layout) ? state.tv.layout : 'cinema';
}

function changeTvCategory(category, system = '') {
  theaterCategory = category;
  theaterSystem = system;
  tvLibraryPage = 0;
  theaterGame = undefined;
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
    const image = consoleMarks[id] && !artwork[id] ? storeIcon({ id }) : el('img');
    if (consoleMarks[id] && !artwork[id]) image.classList.add('tv-console-mark');
    else image.src = 'assets/tv/' + (artwork[id] || 'pc') + '.jpg';
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
  byId('theater-label').textContent = game
    ? [game.info?.genres, gameSource(game), game.provider && t('Não instalado')].filter(Boolean).join(' · ')
    : t('Nenhum jogo nesta lista');
  const synopsis = game?.info?.customDescription || game?.info?.description || '';
  byId('theater-summary').textContent = synopsis;
  byId('theater-summary').hidden = !synopsis;
  for (const id of ['theater-play', 'theater-details']) byId(id).hidden = !game;
  const canPlay = Boolean(game && (!game.provider || canInstallStoreGame(game)));
  byId('theater-play').hidden = !canPlay;
  byId('theater-play').textContent = t(game?.provider ? storeInstallLabel(game) : '▶ Jogar');
  const favorite = byId('theater-favorite');
  favorite.hidden = !game || Boolean(game.provider);
  favorite.setAttribute('aria-pressed', String(Boolean(game?.favorite)));
  byId('theater-favorite-label').textContent = game?.favorite ? t('Remover dos favoritos') : t('Favoritar');
  byId('tv-action-a').disabled = !canPlay;
  byId('tv-action-y').disabled = !game;
  if (theaterCategory !== 'pc') {
    setArt(byId('theater-art'), game ? gameBanners(game, tvLayout() !== 'cockpit') : [], 900, byId('theater-ambient'));
    setArt(byId('theater-portrait'), game ? gameArtwork(game) : [], 0, byId('theater-poster-ambient'));
  }
  const tiles = [...byId('theater-deck').querySelectorAll('.tv-card')];
  const key = tvGameKey(game);
  const center = tiles.findIndex(tile => tile.dataset.game === key);
  const positions = [...byId('tv-gallery-positions').children];
  const currentPosition = Math.round(center * (positions.length - 1) / Math.max(1, tiles.length - 1));
  for (const [index, position] of positions.entries()) {
    position.classList.toggle('is-current', index === currentPosition);
  }
  for (const [index, tile] of tiles.entries()) {
    tile.setAttribute('aria-pressed', String(tile.dataset.game === key));
    if (tvLayout() === 'gallery' && theaterCategory !== 'pc') {
      const half = Math.floor(tiles.length / 2);
      const offset = (index - center + half + tiles.length) % tiles.length - half;
      tile.dataset.offset = String(offset);
      tile.hidden = Math.abs(offset) > 2;
    }
  }
}

function focusTvGame(game) {
  selectTheaterGame(game);
  const tile = [...byId('theater-deck').querySelectorAll('.tv-card')].find(node => node.dataset.game === tvGameKey(game));
  tile?.focus({ preventScroll: true });
  tile?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function stepTvGame(offset) {
  const games = allTvGames();
  if (!games.length) return;
  const current = games.findIndex(game => tvGameKey(game) === tvGameKey(theaterGame));
  const index = tvLayout() === 'gallery' && theaterCategory !== 'pc' ?
    ((current + offset) % games.length + games.length) % games.length :
    Math.max(0, Math.min(games.length - 1, current + offset));
  const page = Math.floor(index / tvItemsPerPage());
  if (page !== tvLibraryPage) {
    tvLibraryPage = page;
    theaterGame = games[index];
    renderTheater();
  }
  focusTvGame(games[index]);
}

function changeTvPage(direction, focusGame = false) {
  const page = tvLibraryPage + direction;
  const games = allTvGames();
  const selected = games[page * tvItemsPerPage()];
  if (page < 0 || !selected) return false;
  tvLibraryPage = page;
  theaterGame = selected;
  const deck = byId('theater-deck');
  deck.scrollTop = 0;
  deck.scrollLeft = 0;
  renderTheater();
  if (focusGame) focusTvGame(selected);
  return true;
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
  const grid = theaterCategory === 'pc';
  byId('theater').dataset.layout = layout;
  byId('theater').dataset.category = theaterCategory;
  byId('tv-pc-label').textContent = t(layout === 'gallery' ? 'Biblioteca' : 'Jogos de PC');
  byId('tv-shoulder-label').textContent = t(grid ? 'Páginas' : 'Abas');
  byId('tv-rom-label').textContent = t('Emuladores');
  for (const tab of document.querySelectorAll('[data-tv]')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.tv === theaterCategory));
  }
  for (const shortcut of document.querySelectorAll('[data-target]')) {
    shortcut.setAttribute('aria-pressed', String(shortcut.dataset.target === theaterCategory));
  }
  const titles = { home: layout === 'cockpit' ? 'Sua próxima partida' : 'Seus jogos',
    pc: 'Jogos de PC', rom: 'Biblioteca de emuladores', favorites: 'Favoritos', recent: 'Jogos recentes' };
  const library = allTvGames();
  const title = t(titles[theaterCategory]);
  byId('tv-shelf-title').textContent = grid ? `${title} · ${t('{count} jogos', { count: library.length })}` : title;
  renderTvSystems();
  const pages = Math.max(1, Math.ceil(library.length / tvItemsPerPage()));
  tvLibraryPage = Math.min(tvLibraryPage, pages - 1);
  byId('tv-library-pages').hidden = pages === 1;
  byId('tv-page-prev').disabled = tvLibraryPage === 0;
  byId('tv-page-next').disabled = tvLibraryPage + 1 >= pages;
  byId('tv-page-count').textContent = t('Página {page} de {total}', { page: tvLibraryPage + 1, total: pages });
  const games = currentTvPage(library);
  if (layout === 'gallery' && !grid) renderGalleryLaunchers();
  for (const id of ['gallery-prev', 'gallery-next']) byId(id).hidden = grid || games.length < 2;
  const selected = games.find(game => tvGameKey(game) === tvGameKey(theaterGame)) || games[0];
  const positions = byId('tv-gallery-positions');
  const showPositions = !grid && layout === 'gallery' && games.length > 1;
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
    tile.dataset.game = tvGameKey(game);
    tile.classList.toggle('tv-uninstalled', Boolean(game.provider));
    tile.setAttribute('aria-label', game.provider ? `${game.name} · ${gameSource(game)} · ${t('Não instalado')}` : game.name);
    const image = el('img', 'tv-card-cover');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    const ambient = el('img', 'tv-card-ambient');
    ambient.alt = '';
    ambient.hidden = true;
    const preferPortrait = (grid || layout !== 'cockpit') && !game.emulator && !game.customCover;
    setArt(image, gameArtwork(game), 0, grid ? undefined : ambient, preferPortrait);
    if (!grid && layout === 'cockpit') {
      const banner = el('img', 'tv-card-banner');
      banner.alt = '';
      banner.loading = 'lazy';
      setArt(banner, gameBanners(game), 520);
      tile.append(banner);
    }
    tile.append(ambient, image, el('span', '', game.name));
    tile.addEventListener('focus', () => {
      if (tvGameKey(theaterGame) !== tile.dataset.game) selectTheaterGame(game);
    });
    if (layout !== 'gallery' || grid) {
      tile.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' && tvGameKey(theaterGame) !== tile.dataset.game) selectTheaterGame(game);
      });
    }
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
  if (byId('tv-search-dialog').open) renderTvSearch();
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
  theaterCategory = 'home';
  theaterSystem = '';
  tvLibraryPage = 0;
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

function focusNavigationTarget(target) {
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function movePreferencesFocus(active, dx, dy, items) {
  const menu = items.filter(node => node.matches('[data-settings]'));
  const panel = items.filter(node => node.closest('.preferences-layout section'));
  const tab = menu.find(node => node.getAttribute('aria-pressed') === 'true');
  const close = byId('preferences-close');
  const index = menu.indexOf(active);
  if (active === close) {
    if (dy > 0 || dx < 0) focusNavigationTarget(tab);
    return;
  }
  if (index >= 0) {
    if (dx > 0 && panel.length) {
      focusNavigationTarget(panel[0]);
    } else if (dy) {
      focusNavigationTarget(index === 0 && dy < 0 ? close : menu[index + dy]);
    }
    return;
  }
  const position = panel.indexOf(active);
  if (position === -1 || dx < 0) focusNavigationTarget(tab);
  else if (dy) focusNavigationTarget(position === 0 && dy < 0 ? close : panel[position + dy]);
}

function focusDirection(key) {
  const [dx, dy] = directionKeys[key];
  const dialog = activeDialog();
  const root = dialog || (theater ? byId('theater') : document.body);
  const active = document.activeElement;
  const gamepad = document.body.dataset.input === 'gamepad';
  if (gamepad && dx && active.matches('input[type="range"]')) {
    const value = active.value;
    active[dx > 0 ? 'stepUp' : 'stepDown']();
    if (active.value !== value) {
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
  if (gamepad && dx && active.matches('select')) {
    const options = [...active.options].filter(option => !option.hidden && !option.disabled);
    if (!options.length) return;
    const index = options.findIndex(option => option.selected);
    active.value = options[(index + dx + options.length) % options.length].value;
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const controls = selector => [...root.querySelectorAll(selector)]
    .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && getComputedStyle(node).visibility === 'visible' &&
      (!theater || dialog || !node.closest('.theater-foot')));
  if (dialog?.id === 'preferences-dialog' && gamepad) {
    movePreferencesFocus(active, dx, dy, controls(navigationTargets));
    return;
  }
  if (active === document.body || !root.contains(active)) {
    const first = theater ? byId('theater-tabs').querySelector('[aria-pressed="true"]') :
      document.querySelector('[data-page][aria-current="page"]');
    first?.focus();
    return;
  }
  const inSystems = !dialog && theater && active.matches('.tv-system-card');
  if (inSystems && dx) {
    const systems = controls('.tv-system-card');
    const target = systems[systems.indexOf(active) + dx];
    focusNavigationTarget(target);
    return;
  }
  if (!dialog && theater && theaterCategory !== 'pc' && active.matches('.tv-card')) {
    const layout = tvLayout();
    if ((layout === 'gallery' || layout === 'cinema') && dx || layout === 'cockpit' && dy) {
      stepTvGame(dx || dy);
      return;
    }
  }
  const center = node => {
    const bounds = node.getBoundingClientRect();
    return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  };
  const [x, y] = center(active);
  const header = byId('theater').querySelector('.tv-header-actions');
  const tabs = byId('theater-tabs');
  const inHeader = !dialog && header.contains(active);
  const inTabs = !dialog && tabs.contains(active);
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
  focusNavigationTarget(target);
}

let lastPadMove = 0;
let lastPadTrigger = 0;
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
  byId('tv-trigger-hint').hidden = !controller;
}

function stepNavigationTab(direction) {
  if (activeDialog()) return;
  if (theater && theaterCategory === 'pc') {
    changeTvPage(direction, true);
    return;
  }
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
  if (dialog) dialog.requestClose();
  else if (theater) leaveTheater();
  else if (page !== 'home') {
    switchPage('home');
    document.querySelector('[data-page="home"]').focus();
  }
}

function showTheaterInfo() {
  if (activeDialog()) return;
  const key = document.activeElement?.closest('.tv-card')?.dataset.game;
  const game = key && currentTvPage(allTvGames()).find(item => tvGameKey(item) === key);
  if (game || theaterGame) showGameDetails(game || theaterGame);
}

async function playTheaterGame(node, game = theaterGame) {
  if (!game || node.disabled) return;
  if (game.provider) {
    if (canInstallStoreGame(game)) await perform(node, () => queueStoreGame(game.provider, game.id));
    else showGameDetails(game);
    return;
  }
  const restoreFocus = document.activeElement === node;
  notify(t('Abrindo {name}…', { name: game.name }));
  await playFromButton(byId('theater-play'), game.id, async () => {
    const next = await api.play(game.id);
    if (next?.games) state = next;
  });
  if (restoreFocus && theater && node.isConnected && document.activeElement === document.body) {
    node.focus({ preventScroll: true });
  }
}

function pollPad(timestamp) {
  const pad = navigator.getGamepads?.().find(device => device?.connected);
  if (pad && document.hasFocus()) {
    const down = index => Boolean(pad.buttons[index]?.pressed || (index >= 6 && pad.buttons[index]?.value > .55));
    const pressed = index => down(index) && !previousPadButtons[index];
    const key = down(14) || pad.axes[0] < -.54 ? 'ArrowLeft' :
      down(15) || pad.axes[0] > .54 ? 'ArrowRight' :
        down(12) || pad.axes[1] < -.54 ? 'ArrowUp' :
          down(13) || pad.axes[1] > .54 ? 'ArrowDown' : '';
    if (key || [0, 1, 3, 4, 5, 6, 7].some(pressed)) setTvInput('gamepad');
    if (pressed(4) && !down(5)) stepNavigationTab(-1);
    if (pressed(5) && !down(4)) stepNavigationTab(1);
    if (theater && !activeDialog() && down(6) !== down(7) &&
        (pressed(6) || pressed(7) || timestamp - lastPadTrigger > 300)) {
      stepTvGame(down(6) ? -8 : 8);
      lastPadTrigger = timestamp;
    }
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
    previousPadButtons = Array.from({ length: 8 }, (_, index) => down(index));
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
byId('library-origin-filter').addEventListener('change', render);
let downloadJobs = [];
let steamJobs = [];
let steamPoll;
let steamReading = false;
let settingsTab = 'accounts';
const storeNames = { epic: 'Epic Games', gog: 'GOG', amazon: 'Amazon Games' };

function renderDownloadJobs() {
  const panel = byId('download-jobs');
  const focused = document.activeElement?.dataset.downloadAction;
  const labels = { queued: 'Na fila', running: 'Instalando…', cancelling: 'Cancelando…', cancelled: 'Download cancelado',
    finishing: 'Confirmando instalação…', done: 'Concluído', failed: 'Falhou', external: 'Baixando pela Steam',
    'steam-requested': 'Aguardando confirmação na Steam', 'steam-finalizing': 'Instalando pela Steam' };
  panel.replaceChildren(...[...downloadJobs, ...steamJobs].map(job => {
    const row = el('article', 'settings-card download-row');
    const store = state.stores.find(item => item.id === job.source.toLowerCase());
    if (store) row.append(storeIcon(store));
    const content = el('div', 'download-info');
    content.append(el('strong', '', job.name), el('p', '', (storeNames[job.source] || job.source) + ' · ' + t(labels[job.status])));
    const active = ['running', 'cancelling', 'finishing', 'external', 'steam-finalizing'].includes(job.status);
    if (active || job.status === 'done') {
      const bar = el('progress');
      bar.max = 100;
      bar.setAttribute('aria-label', t('Progresso da instalação'));
      if (job.progress !== undefined) {
        bar.value = job.progress;
        content.append(el('span', 'download-percent', Math.floor(job.progress) + '%'));
      }
      content.append(bar);
    }
    if (job.error) content.append(el('p', '', t(job.error)));
    row.append(content);
    const actionsByStatus = [];
    if (job.source === 'Steam' && (active || job.status === 'steam-requested')) {
      actionsByStatus.push(['steam', 'Cancelar na Steam', () => api.steamDownloads(theater)]);
    } else if (['queued', 'running'].includes(job.status)) {
      actionsByStatus.push(['cancel', 'Cancelar download', api.cancelDownload]);
    } else if (!active) {
      if (['failed', 'cancelled'].includes(job.status)) actionsByStatus.push(['retry', 'Tentar novamente', api.retryDownload]);
      actionsByStatus.push(['remove', 'Dispensar', api.removeDownload]);
    }
    if (actionsByStatus.length) {
      const actions = el('div', 'actions');
      for (const [act, label, method] of actionsByStatus) {
        const control = button(t(label), node => perform(node, async () => {
          const result = await method(job.id);
          if (job.source === 'Steam' && Array.isArray(result)) {
            steamJobs = result;
            renderDownloadJobs();
          }
        }), 'plain');
        control.dataset.downloadAction = job.id + ':' + act;
        actions.append(control);
      }
      row.append(actions);
    }
    return row;
  }));
  if (!downloadJobs.length && !steamJobs.length) panel.append(el('p', 'settings-empty', t('Nenhum download nesta sessão.')));
  if (focused) Array.from(panel.querySelectorAll('[data-download-action]'))
    .find(node => node.dataset.downloadAction === focused ||
      node.dataset.downloadAction === focused.replace(/:cancel$/, ':retry'))?.focus({ preventScroll: true });
}

function renderAccounts() {
  const options = state.stores.filter(store => ['steam', 'epic', 'gog', 'amazon'].includes(store.id)).map(store => {
    const connected = Object.hasOwn(state.ownedStoreGames || {}, store.id);
    const tile = button('', () => {
      byId('preferences-dialog').close();
      openStoreAccount(store);
    }, 'settings-card account-tile');
    const label = el('span');
    label.append(el('strong', '', store.name), el('small', '', t(connected ? 'Sincronizar' : 'Conectar')));
    tile.append(storeIcon(store), label);
    return tile;
  });
  byId('prefs-account-options').replaceChildren(...options);
}

function openStoreAccount(store) {
  if (store.id !== 'steam') return openLinuxStoreLibrary(store);
  const dialog = byId('steam-account-dialog');
  byId('steam-account-form').reset();
  byId('steam-account-status').textContent = '';
  dialog.showModal();
  return renderSteamAccount();
}

async function renderSteamAccount() {
  const { profile, ready, saved, count } = await api.steamAccountInfo();
  byId('steam-account-profile').value = profile || '';
  byId('steam-account-key').required = !ready;
  byId('steam-account-disconnect').hidden = count == null;
  byId('steam-account-status').textContent = count == null ? '' : [
    t(count === 1 ? '{count} jogo' : '{count} jogos', { count }),
    !saved && t('Informe a chave novamente após reiniciar o PeraGames para sincronizar.')
  ].filter(Boolean).join(' · ');
}

byId('steam-account-close').addEventListener('click', () => byId('steam-account-dialog').close());
byId('steam-account-dialog').addEventListener('close', () => { byId('steam-account-key').value = ''; });
byId('steam-account-help').addEventListener('click', event => perform(event.currentTarget, api.steamAccountHelp));
for (const [id, page] of [['steam-open-profile', 'profile'], ['steam-open-account', 'account']]) {
  byId(id).addEventListener('click', event => perform(event.currentTarget, () => api.steamAccountGuide(page)));
}
byId('steam-account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = byId('steam-account-key');
  const profile = byId('steam-account-profile');
  const status = byId('steam-account-status');
  status.textContent = t('Consultando.');
  if (await perform(byId('steam-account-sync'), () => api.syncSteamAccount({ profile: profile.value, key: input.value }))) {
    input.value = '';
    await renderSteamAccount();
  } else status.textContent = '';
});
byId('steam-account-disconnect').addEventListener('click', async event => {
  if (await perform(event.currentTarget, api.disconnectSteamAccount)) {
    byId('steam-account-key').value = '';
    await renderSteamAccount();
  }
});

async function renderPreferencesTab(tab) {
  clearInterval(steamPoll);
  settingsTab = tab;
  for (const control of byId('preferences-dialog').querySelectorAll('[data-settings]')) {
    const current = control.dataset.settings === tab;
    control.setAttribute('aria-pressed', String(current));
    byId('prefs-' + control.dataset.settings).hidden = !current;
  }
  if (tab === 'accounts') renderAccounts();
  if (tab === 'integrations') {
    byId('grid-status').textContent = t(!state.gridConfigured ? 'Adicione sua chave para buscar capas automaticamente.' :
      state.gridKeySaved ? 'SteamGridDB conectado.' : 'SteamGridDB conectado nesta sessão.');
    byId('grid-remove').hidden = !state.gridConfigured;
  }
  if (tab === 'diagnostics') {
    try {
      const report = await api.diagnostics();
      const fields = [['Sistema operacional', report.system], ['Processador', report.processor], ['Placa de vídeo', report.gpu || t('Não identificada')],
        ['Memória', report.memory], ['Versão do PeraGames', report.version]];
      byId('prefs-system-report').replaceChildren(...fields.map(([label, value]) => {
        const row = el('div', 'settings-card');
        row.append(el('dt', '', t(label)), el('dd', '', value));
        return row;
      }));
    } catch (error) { notify(error.message); }
  }
  if (tab === 'downloads') {
    const dialog = byId('preferences-dialog');
    const focusDownloads = () => {
      if (!theater || !dialog.open || settingsTab !== 'downloads') return;
      const active = document.activeElement;
      if (dialog.contains(active) && active.closest('#prefs-downloads')) return;
      const action = byId('download-jobs').querySelector('[data-download-action$=":steam"], [data-download-action$=":cancel"]');
      (action || byId('prefs-steam-downloads')).focus();
    };
    const readSteam = async () => {
      if (steamReading || document.hidden || settingsTab !== 'downloads' || !byId('preferences-dialog').open) return;
      steamReading = true;
      try {
        const jobs = await api.steamProgress();
        if (JSON.stringify(jobs) !== JSON.stringify(steamJobs)) {
          steamJobs = jobs;
          if (settingsTab === 'downloads' && byId('preferences-dialog').open) renderDownloadJobs();
        }
      } catch {} finally { steamReading = false; }
    };
    steamPoll = setInterval(readSteam, 4000);
    renderDownloadJobs();
    const current = downloadJobs;
    try {
      const [jobs] = await Promise.all([api.downloadsList(), readSteam()]);
      if (downloadJobs === current) downloadJobs = jobs;
      if (settingsTab === 'downloads') {
        renderDownloadJobs();
        focusDownloads();
      }
    } catch (error) { notify(error.message); }
  }
  byId('prefs-install-path').textContent = state.preferences?.installDirectory || t('Escolhida ao instalar cada jogo.');
}

async function openPreferences(tab = 'accounts') {
  const prefs = state.preferences || {};
  byId('prefs-locale').value = prefs.locale || 'system';
  byId('prefs-zoom').value = prefs.zoom || 100;
  byId('prefs-zoom-value').value = byId('prefs-zoom').value + '%';
  for (const key of ['motion', 'titles', 'color']) byId('prefs-' + key).checked = Boolean(prefs[key]);
  byId('prefs-feedback').hidden = true;
  const dialog = byId('preferences-dialog');
  const opening = !dialog.open;
  if (opening) dialog.showModal();
  const ready = renderPreferencesTab(tab);
  if (opening && document.body.dataset.input === 'gamepad') {
    dialog.querySelector('[data-settings][aria-pressed="true"]')?.focus();
  }
  await ready;
}

async function queueStoreGame(provider, id) {
  if (theater) {
    const game = state.ownedStoreGames?.[provider]?.find(entry => entry.id === id);
    if (!game || !await confirmTvDownload(game.name)) return;
  }
  if (provider === 'steam') await api.steamInstall(id);
  else if (!(await api.installLinuxStoreGame({ provider, id, useDefaultFolder: theater }))?.queued) return;
  for (const dialog of ['linux-store-dialog', 'game-editor']) {
    if (byId(dialog).open) byId(dialog).close();
  }
  await openPreferences('downloads');
}

function confirmTvDownload(name) {
  const dialog = byId('tv-install-confirm');
  if (dialog.open) return Promise.resolve(false);
  dialog.returnValue = '';
  byId('tv-install-message').textContent = t('Quer baixar {name} agora?', { name });
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'download'), { once: true }));
}

byId('preferences-open').addEventListener('click', () => openPreferences());
byId('tv-downloads-open').addEventListener('click', () => openPreferences('downloads'));
byId('preferences-close').addEventListener('click', () => byId('preferences-dialog').close());
byId('grid-settings-link').addEventListener('click', () => openPreferences('integrations'));
byId('preferences-dialog').addEventListener('close', () => clearInterval(steamPoll));
byId('game-accounts').addEventListener('click', () => openPreferences('accounts'));
for (const node of byId('preferences-dialog').querySelectorAll('[data-settings]')) {
  node.addEventListener('click', () => renderPreferencesTab(node.dataset.settings));
}
byId('prefs-steam-downloads').addEventListener('click', event => perform(event.currentTarget, () => api.steamDownloads(theater)));
byId('prefs-steam-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = byId('prefs-steam-link');
  if (await perform(byId('prefs-steam-submit'), () => api.steamInstall(input.value))) input.value = '';
});
byId('prefs-copy-report').addEventListener('click', event => perform(event.currentTarget, api.copyDiagnostics, 'Diagnóstico copiado.'));
byId('prefs-zoom').addEventListener('input', event => { byId('prefs-zoom-value').value = event.target.value + '%'; });
byId('prefs-zoom-reset').addEventListener('click', () => {
  byId('prefs-zoom').value = 100;
  byId('prefs-zoom-value').value = '100%';
});
byId('prefs-form').addEventListener('submit', async event => {
  event.preventDefault();
  const locale = byId('prefs-locale').value;
  const changed = locale !== (state.preferences?.locale || 'system');
  const saved = await perform(byId('prefs-save'), () => api.savePreferences({
    locale, zoom: Number(byId('prefs-zoom').value), motion: byId('prefs-motion').checked,
    titles: byId('prefs-titles').checked, color: byId('prefs-color').checked
  }), 'Configurações salvas.');
  if (saved && changed) await api.control('reload');
});
for (const [id, reset] of [['prefs-pick-path', false], ['prefs-reset-path', true]]) {
  byId(id).addEventListener('click', async event => {
    if (await perform(event.currentTarget, () => api.installDirectory(reset)) && settingsTab === 'installation') {
      renderPreferencesTab('installation');
    }
  });
}
api.onDownloads(jobs => {
  downloadJobs = jobs;
  if (byId('preferences-dialog').open && settingsTab === 'downloads') renderDownloadJobs();
});
api.onDownloadLibrary(library => {
  state = library;
  if (previewStoreGame?.provider === 'steam') {
    const id = 'steam-' + previewStoreGame.id;
    if (state.games.some(game => game.id === id)) {
      selectedGame = id;
      previewStoreGame = undefined;
    }
  }
  render();
  if (byId('game-editor').open) renderGameDetails();
});
api.onSteamDownloadsComplete(({ completed, jobs }) => {
  steamJobs = jobs;
  if (settingsTab === 'downloads' && byId('preferences-dialog').open) renderDownloadJobs();
  notify(completed.length === 1 ? t('{name} foi instalado pela Steam.', { name: completed[0].name }) :
    t('{count} jogos foram instalados pela Steam.', { count: completed.length }));
});
api.onSteamLaunchRequested(name => notify(t('Pedindo à Steam para abrir {name}.', { name })));
api.onStoreLaunchStatus(({ id, name, provider, reason }) => {
  const store = storeNames[provider] || provider;
  const messages = {
    preparing: 'Preparando {name}.',
    'preparing-proton': 'Preparando {name}. No primeiro uso do Proton, pode levar alguns minutos.',
    'runner-start': 'Wine ou Proton está iniciando {name}.',
    update: '{store} pediu uma atualização para {name}. Na lista da loja, selecione Atualizar jogo.',
    signin: 'O login em {store} falhou ao abrir {name}. Conecte a conta novamente em Lojas.',
    missing: 'Os arquivos de {name} não foram encontrados. Confira a instalação em {store}.',
    runtime: 'Falha ao preparar o Steam Linux Runtime para {name}. Abra Diagnosticar jogo para verificar o ambiente.',
    dependency: 'Uma dependência falhou ao iniciar {name}. Confira os componentes sugeridos em Compatibilidade com Proton.',
    'runtime-space': 'Faltou espaço em disco ao preparar o ambiente do Proton para {name}.',
    'runtime-wine-data': 'O Wine não conseguiu carregar o arquivo l_intl.nls ao iniciar {name}. Confira a extração do Proton ou selecione outra versão.',
    'missing-cwd': 'A pasta de trabalho de {name} não está disponível no Linux.',
    'missing-executable': 'O executável de {name} não está disponível no Linux.',
    'runtime-namespace': 'O Linux bloqueou a criação do ambiente isolado do Proton para {name}.',
    'runtime-proton-path': 'O UMU não encontrou a instalação do Proton para {name}.',
    'runtime-loader': 'O UMU iniciou, mas falhou ao carregar o Proton ou o Wine de {name}.',
    'runtime-manifest': 'O UMU não encontrou um runtime compatível com o Proton selecionado para {name}.',
    'runtime-network': 'O UMU não conseguiu acessar o servidor necessário para preparar o Proton para {name}.',
    prefix: 'O Wine ou Proton não conseguiu usar a pasta de dados de {name}. Confira o prefixo nas opções do jogo.',
    graphics: 'O ambiente gráfico falhou ao iniciar {name}.',
    'windows-dll': 'O Windows não encontrou uma DLL necessária para {name}. Confira as dependências do jogo.',
    'windows-exit': 'O executável de {name} encerrou com erro. Confira o arquivo escolhido e os arquivos que acompanham o jogo.',
    runner: 'O processo de {name} encerrou com erro. Abra Diagnosticar jogo para verificar a etapa e o ambiente.',
    'early-exit': '{name} encerrou logo após iniciar. Tente outra versão do Wine ou Proton nas opções do jogo.',
    'store-timeout': '{store} demorou para responder ao abrir {name}. Confira a conexão e tente novamente.',
    store: '{store} não conseguiu abrir {name}.'
  };
  const message = t(messages[reason] || messages.store, { name, store });
  if (['preparing', 'preparing-proton', 'runner-start'].includes(reason)) gameLaunchMessages.delete(id);
  else gameLaunchMessages.set(id, message);
  if (selectedGame === id && byId('game-editor').open) {
    renderGameLaunchFeedback();
    if (gameLaunchMessages.has(id)) return;
  }
  if (byId('linux-store-dialog').open) byId('linux-store-status').textContent = message;
  else notify(message);
});
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
  const confirmed = window.confirm(t('Rodar o instalador em uma cópia do prefixo e manter o original para restauração?'));
  if (!confirmed) return;
  setupAction(() => api.runGameInstaller({ runner: byId('game-setup-runner').value, confirmed }), 'Aguardando o instalador do Windows…');
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
async function checkAppUpdate({ automatic = false } = {}) {
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
    byId('app-update-open').toggleAttribute('data-update-available', result === 'available');
    if (result !== 'available') byId('update-banner').hidden = true;
    else if (automatic && !byId('app-update-dialog').open) {
      byId('update-banner-text').textContent = t('A versão {version} está disponível.', { version: latest });
      byId('update-banner').hidden = false;
    }
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
byId('update-banner-open').addEventListener('click', () => {
  byId('update-banner').hidden = true;
  byId('app-update-dialog').showModal();
});
byId('update-banner-dismiss').addEventListener('click', () => { byId('update-banner').hidden = true; });
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
    byId('update-banner').hidden = true;
    byId('app-update-open').removeAttribute('data-update-available');
    status.textContent = installed?.restart ? t('Atualização instalada. Feche e reabra o PeraGames pelo menu.') :
      t('A atualização está pronta para ser instalada.');
    button.hidden = true;
  } catch (error) {
    const message = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    const translated = t(message);
    status.textContent = translated !== message || /^O Linux não autorizou|^Não foi possível instalar a atualização do Flatpak/.test(message)
      ? translated : t('Não foi possível instalar a atualização. Baixe o instalador na página da versão.');
    byId('app-update-release').hidden = false;
  } finally {
    button.disabled = false;
    check.disabled = false;
  }
});
byId('enter-theater').addEventListener('click', enterTheater);
byId('exit-theater').addEventListener('click', leaveTheater);
function renderTvSearch() {
  const results = byId('tv-search-results');
  const selected = document.activeElement?.dataset.searchGame;
  const query = titleForTvSearch(byId('tv-search-input').value).split(/\s+/).filter(Boolean);
  const games = query.length ? [...state.games, ...(state.roms || []), ...tvStoreGames()]
    .filter(game => {
      const title = titleForTvSearch(game.name);
      return query.every(word => title.includes(word));
    }) : [];
  const visible = games.slice(0, 8);
  results.replaceChildren(...visible.map(game => {
    const row = button('', () => {
      byId('tv-search-dialog').close();
      showGameDetails(game);
    }, 'tv-search-result');
    row.dataset.searchGame = tvGameKey(game);
    row.append(el('strong', '', game.name), el('small', '',
      [gameSource(game), game.provider && t('Não instalado')].filter(Boolean).join(' · ')));
    return row;
  }));
  if (selected) [...results.children].find(row => row.dataset.searchGame === selected)?.focus({ preventScroll: true });
  byId('tv-search-count').textContent = !query.length ? t('Digite parte do nome') : !games.length
    ? t('Nenhum jogo encontrado.') : visible.length < games.length
      ? t('{count} de {total} jogos', { count: visible.length, total: games.length })
      : t(games.length === 1 ? '{count} jogo' : '{count} jogos', { count: games.length });
}

const titleForTvSearch = value => value.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

function editTvSearch(key) {
  const input = byId('tv-search-input');
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (key === 'clear') input.value = '';
  else if (key === 'delete') input.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
  else if (input.value.length - (end - start) < input.maxLength) input.setRangeText(key, start, end, 'end');
  renderTvSearch();
}

function renderTvKeyboard() {
  const keys = [...'QWERTYUIOPASDFGHJKLÇZXCVBNM-\'0123456789'].map(letter =>
    button(letter, () => editTvSearch(letter), 'tv-search-key'));
  for (const [key, label, kind] of [['clear', 'Limpar', 'clear'], [' ', 'Espaço', 'space'], ['delete', 'Apagar', 'delete']]) {
    keys.push(button(t(label), () => editTvSearch(key), 'tv-search-key tv-key-' + kind));
  }
  byId('tv-search-keyboard').replaceChildren(...keys);
}

byId('tv-search-open').addEventListener('click', () => {
  byId('tv-search-input').value = '';
  renderTvKeyboard();
  renderTvSearch();
  byId('tv-search-dialog').showModal();
  const initial = document.body.dataset.input === 'gamepad'
    ? byId('tv-search-keyboard').firstElementChild : byId('tv-search-input');
  initial?.focus();
});
byId('tv-search-close').addEventListener('click', () => byId('tv-search-dialog').close());
byId('tv-search-input').addEventListener('input', renderTvSearch);
byId('tv-search-input').addEventListener('keydown', event => {
  if (event.key === 'Enter') byId('tv-search-results').firstElementChild?.click();
});
for (const [id, direction] of [['tv-page-prev', -1], ['tv-page-next', 1]]) {
  byId(id).addEventListener('click', event => {
    if (!changeTvPage(direction)) return;
    if (event.currentTarget.disabled) byId(direction > 0 ? 'tv-page-prev' : 'tv-page-next').focus();
  });
}
for (const id of ['theater-play', 'tv-action-a']) {
  byId(id).addEventListener('click', event => playTheaterGame(event.currentTarget));
}
byId('theater-favorite').addEventListener('click', event => {
  if (theaterGame) perform(event.currentTarget, () => api.favorite(theaterGame.id));
});
byId('theater-details').addEventListener('click', showTheaterInfo);
byId('tv-action-y').addEventListener('click', showTheaterInfo);
byId('tv-action-b').addEventListener('click', goBack);
byId('gallery-prev').addEventListener('click', () => stepTvGame(-1));
byId('gallery-next').addEventListener('click', () => stepTvGame(1));
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
  byId('tv-show-uninstalled').checked = state.tv?.showUninstalled !== false;
  byId('tv-color-uninstalled').checked = Boolean(state.preferences?.color);
  byId('tv-appearance').showModal();
  layoutOptions.find(tile => tile.dataset.layout === tvLayout())?.focus();
});
byId('tv-color-uninstalled').addEventListener('change', async event => {
  const box = event.currentTarget;
  if (!await perform(box, () => api.savePreferences({ ...state.preferences, color: box.checked }))) {
    box.checked = Boolean(state.preferences?.color);
  }
});
byId('tv-show-uninstalled').addEventListener('change', async event => {
  const box = event.currentTarget;
  if (!await perform(box, () => api.setTvUninstalled(box.checked))) {
    box.checked = state.tv?.showUninstalled !== false;
  }
});
byId('tv-appearance-close').addEventListener('click', () => byId('tv-appearance').close());
for (const tile of layoutOptions) {
  tile.addEventListener('click', async () => {
    const layout = tile.dataset.layout;
    if (await perform(tile, async () => {
      const next = await api.setTvLayout(layout);
      theaterCategory = 'home';
      theaterGame = undefined;
      tvLibraryPage = 0;
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
byId('linux-store-dialog').addEventListener('close', () => { byId('linux-store-code').value = ''; });
byId('linux-store-search').addEventListener('input', renderLinuxStoreGames);
byId('linux-store-setup').addEventListener('click', () => storeDialogAction(async provider => {
  if (!storeDialogAutoSetup) return api.openLinuxStore({ provider, setup: true });
  await api.setupLinuxStoreTool(provider);
  return loadLinuxStoreLibrary(provider);
}, storeDialogAutoSetup ? 'Baixando e verificando o componente da loja.' : 'Consultando.'));
byId('linux-store-system').addEventListener('click', () =>
  storeDialogAction(() => api.openLinuxSoftware(storeDialogCommand)));
byId('linux-store-tool').addEventListener('click', () => storeDialogAction(async provider => {
  if (await api.linkLinuxStoreTool(provider)) return loadLinuxStoreLibrary(provider);
}));
byId('linux-store-login').addEventListener('click', async () => {
  await storeDialogAction(provider => api.openLinuxStore({ provider }));
  if (storeDialogProvider !== 'amazon' && !byId('linux-store-status').textContent) {
    byId('linux-store-status').textContent = t('Cole o retorno que apareceu após entrar na conta.');
  }
});
byId('linux-store-amazon-paste').addEventListener('click', () => storeDialogAction(async () => {
  const value = await api.pasteAmazonLogin();
  if (byId('linux-store-dialog').open) byId('linux-store-code').value = value;
  return t('URL colada. Clique em Vincular conta.');
}));
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
byId('proton-catalog-retry').addEventListener('click', () => loadProtonCatalog());
byId('proton-catalog-official').addEventListener('click', () =>
  api.protonOfficialReleases(byId('proton-catalog-source').value).catch(error => {
    protonCatalogStatus().textContent = t(error.message);
  }));
api.onProtonProgress?.(({ id, stage, received, total }) => {
  if (downloadingProton !== id) return;
  let message = t('Extraindo Proton…');
  if (stage === 'download') message = total ? t('Baixando Proton… {percent}%', { percent: Math.floor(received * 100 / total) }) :
    t('Baixando Proton… {size} MiB', { size: Math.floor(received / (1024 * 1024)) });
  protonCatalogStatus().textContent = message;
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
byId('proton-save-options').addEventListener('click', () => changeProton(id => api.protonLaunchOptions({
  id, argumentsText: byId('proton-arguments').value, environmentText: byId('proton-environment').value,
  steamId: byId('proton-steam-id').value, umuId: byId('proton-umu-id').value
})));
byId('proton-use-profile').addEventListener('click', () => changeProton(api.protonUseProfile));
byId('proton-install-components').addEventListener('click', () => {
  const components = byId('proton-components').value.trim();
  if (components && window.confirm(t('Instalar {components} em uma cópia? O prefixo com os saves ficará guardado.', { components }))) {
    changeProton(id => api.protonMaintainPrefix({ id, action: 'install', components, confirmed: true }));
  }
});
byId('proton-recreate').addEventListener('click', () => {
  if (window.confirm(t('Usar um prefixo novo e guardar o prefixo anterior com os saves?'))) {
    changeProton(id => api.protonMaintainPrefix({ id, action: 'recreate', confirmed: true }));
  }
});
byId('proton-restore').addEventListener('click', () => {
  if (window.confirm(t('Voltar ao prefixo anterior? Os saves do prefixo atual ficarão na pasta guardada.'))) {
    changeProton(id => api.protonMaintainPrefix({ id, action: 'restore', confirmed: true }));
  }
});
let diagnosticGame;
let diagnosticRequest = 0;
byId('proton-diagnose').addEventListener('click', async () => {
  const request = ++diagnosticRequest;
  const game = selectedGame;
  const dialog = byId('proton-diagnostic-dialog');
  const report = byId('proton-diagnostic-report');
  const copy = byId('proton-diagnostic-copy');
  diagnosticGame = undefined;
  report.textContent = t('Consultando.');
  copy.disabled = true;
  byId('proton-diagnostic-status').textContent = '';
  dialog.showModal();
  try {
    const result = await api.diagnoseGame(game);
    if (request !== diagnosticRequest || !dialog.open) return;
    diagnosticGame = game;
    report.textContent = result.report;
    copy.disabled = false;
  } catch {
    if (request === diagnosticRequest && dialog.open) report.textContent = t('Não foi possível verificar o ambiente do jogo.');
  }
});
byId('proton-diagnostic-close').addEventListener('click', () => byId('proton-diagnostic-dialog').close());
byId('proton-diagnostic-copy').addEventListener('click', async () => {
  if (!diagnosticGame) return;
  try {
    await api.copyGameDiagnostics(diagnosticGame);
    byId('proton-diagnostic-status').textContent = t('Relatório copiado.');
  } catch {
    byId('proton-diagnostic-status').textContent = t('Não foi possível copiar o relatório.');
  }
});
byId('proton-executable').addEventListener('click', () => changeProton(id => api.protonExecutable({ id })));
byId('proton-executable-reset').addEventListener('click', () => changeProton(id => api.protonExecutable({ id, reset: true })));
byId('game-lookup').addEventListener('click', async event => {
  const node = event.currentTarget;
  const id = selectedGame;
  const label = node.textContent;
  const artView = gridView = { lookupPending: true };
  renderGameDetails();
  node.textContent = t('Consultando…');
  byId('game-feedback').hidden = true;
  const updated = await perform(node, () => api.lookupGame({ id, query: byId('game-query').value }));
  if (gridView === artView) {
    artView.lookupPending = false;
    renderGameDetails();
  }
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
const coverPicker = byId('cover-picker');
let coverPickerRequest = 0;

async function loadCoverPicker(request, queryFallback = false) {
  const sequence = ++coverPickerRequest;
  const results = byId('cover-picker-results');
  const status = byId('cover-picker-status');
  results.replaceChildren();
  status.textContent = t('Consultando…');
  try {
    let response = await api.coverChoices(request);
    if (queryFallback && !response.covers?.length) {
      response = await api.coverChoices({ id: request.id, query: byId('cover-picker-query').value });
    }
    if (sequence !== coverPickerRequest || !coverPicker.open) return;
    const { covers, games } = response;
    if (covers?.length) {
      results.className = 'cover-picker-grid';
      for (const [index, artwork] of covers.entries()) {
        const size = artwork.width && artwork.height ? artwork.width + ' × ' + artwork.height : t(artwork.source || 'Steam');
        const tile = button('', async node => {
          if (coverPicker.dataset.saving) return;
          coverPicker.dataset.saving = 'true';
          node.disabled = true;
          status.textContent = t('Salvando capa…');
          try {
            state = await api.chooseOnlineCover({ id: request.id, url: artwork.url });
            render();
            if (byId('game-editor').open) renderGameDetails();
            coverPicker.close();
          } catch {
            status.textContent = t('Não foi possível salvar essa capa. Escolha outra opção.');
          } finally {
            node.disabled = false;
            delete coverPicker.dataset.saving;
          }
        }, 'button cover-picker-tile');
        tile.setAttribute('aria-label', t('Escolher capa {number} · {size}', { number: index + 1, size }));
        const preview = el('img');
        preview.alt = '';
        preview.loading = 'lazy';
        preview.addEventListener('error', () => {
          if (preview.src === artwork.thumb && artwork.thumb !== artwork.url) preview.src = artwork.url;
          else {
            tile.remove();
            if (!results.childElementCount) status.textContent = t('Nenhuma capa pôde ser carregada.');
          }
        });
        preview.src = artwork.thumb;
        tile.append(preview, el('span', '', size));
        results.append(tile);
      }
      status.textContent = t('Selecione a capa que quer usar.');
    } else if (games?.length) {
      results.className = 'cover-picker-games';
      for (const game of games) {
        const label = game.year ? game.name + ' (' + game.year + ')' : game.name;
        results.append(button(label, () => loadCoverPicker({ id: request.id, gridId: game.id })));
      }
      status.textContent = t('Escolha o jogo para ver as capas.');
    } else {
      status.textContent = t(state.gridConfigured ? 'Nenhuma capa encontrada. Tente o nome completo ou busque no Google Imagens.' :
        'Conecte o SteamGridDB nas Integrações para pesquisar pelo nome, ou abra o Google Imagens.');
    }
  } catch {
    if (sequence === coverPickerRequest && coverPicker.open) {
      status.textContent = t('Não foi possível consultar as capas. Você também pode buscar no Google Imagens.');
    }
  }
}

byId('game-online-cover').addEventListener('click', () => {
  byId('cover-picker-query').value = byId('game-query').value;
  coverPicker.showModal();
  void loadCoverPicker({ id: selectedGame }, true);
});
byId('cover-picker-close').addEventListener('click', () => coverPicker.close());
byId('cover-picker').addEventListener('close', () => { coverPickerRequest++; });
byId('cover-picker-form').addEventListener('submit', event => {
  event.preventDefault();
  void loadCoverPicker({ id: selectedGame, query: byId('cover-picker-query').value });
});
byId('cover-picker-google').addEventListener('click', event => perform(event.currentTarget, () =>
  api.searchCover({ id: selectedGame, query: byId('cover-picker-query').value })));
byId('cover-picker-file').addEventListener('click', event => perform(event.currentTarget, async () => {
  const next = await api.pickCover(selectedGame);
  if (next?.games) coverPicker.close();
  return next;
}));
byId('game-replace-executable').addEventListener('click', event =>
  perform(event.currentTarget, () => api.replaceExecutable(selectedGame)));
byId('game-reset-cover').addEventListener('click', event => perform(event.currentTarget, () => api.resetCover(selectedGame)));
byId('game-choose-backdrop').addEventListener('click', event => perform(event.currentTarget, () => api.pickBackdrop(selectedGame)));
byId('game-reset-backdrop').addEventListener('click', event => perform(event.currentTarget, () => api.resetBackdrop(selectedGame)));
byId('cover-search').addEventListener('click', event => perform(event.currentTarget, () =>
  api.searchCover({ id: selectedGame, query: byId('game-query').value })));
async function saveGridKey(node, key) {
  if (gridView?.lookupPending) gridView.requested = false;
  else gridView = {};
  delete byId('game-poster').dataset.sources;
  const saved = await perform(node, () => api.saveGridKey(key));
  if (saved && settingsTab === 'integrations') renderPreferencesTab('integrations');
}
byId('grid-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = byId('grid-key');
  const key = input.value;
  input.value = '';
  await saveGridKey(byId('grid-save'), key);
});
byId('grid-remove').addEventListener('click', event => saveGridKey(event.currentTarget, ''));
byId('grid-preferences').addEventListener('click', event => perform(event.currentTarget, api.gridPreferences));
byId('game-play').addEventListener('click', event => {
  const game = previewStoreGame;
  if (!game) return playFromButton(event.currentTarget, selectedGame);
  return perform(event.currentTarget, () => queueStoreGame(game.provider, game.id));
});
byId('game-compatibility').addEventListener('click', event =>
  perform(event.currentTarget, () => api.gameCompatibilityLink(compatibilityView?.result?.appId)));
byId('game-favorite').addEventListener('click', event => perform(event.currentTarget, () => api.favorite(selectedGame)));
byId('game-recomp').addEventListener('click', event => perform(event.currentTarget, () => api.markRecomp(selectedGame)));
byId('game-uninstall').addEventListener('click', async event => {
  const id = selectedGame;
  if (await perform(event.currentTarget, () => api.uninstallGame(id)) && !state.games.some(game => game.id === id)) {
    byId('game-editor').close();
  }
});
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
  void checkAppUpdate({ automatic: true });
}
start();

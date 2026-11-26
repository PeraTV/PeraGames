'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const discIdPattern = /(?:^|[\s[(_-])([A-Z][A-Z0-9]{3}\d{2})(?=$|[\s\])_-])/i;
const regions = { E: 'US', P: 'EN', X: 'EN', Y: 'EN', J: 'JA', K: 'KO', D: 'DE', F: 'FR', I: 'IT', S: 'ES', U: 'AU' };
const namedIds = new Map([
  ['mario kart wii', 'RMCE01'], ['mario party 9', 'SSQE01'], ['mario sports mix', 'RMKE01'],
  ['mario strikers charged', 'R4QE01'], ['donkey kong country returns', 'SF8E01'],
  ['new super mario bros wii', 'SMNE01'], ['luigis mansion', 'GLME01'], ['super mario sunshine', 'GMSE01'],
  ['new super mario allstars', 'SVME01'], ['grand slam tennis', 'R5TE69']
]);

function romTitle(name) {
  return name.replace(/\s*[[(][^\])]*(?:www\.|\.com|\.net|\.org)[^\])]*[\])]/gi, '')
    .replace(discIdPattern, ' ').replace(/[_]+/g, ' ')
    .replace(/(?:\s*(?:[[(](?:USA|Europe|Japan|World|Brazil|BR|PT[- ]?BR|Rev\s+\w+)[\])]|\b(?:PT[- ]?BR|BR)))+$/i, '')
    .replace(/\s+(['’])/g, '$1').replace(/\s+/g, ' ').trim();
}

function discHeader(buffer) {
  if (buffer.length < 0x20) return null;
  const system = buffer.readUInt32BE(0x18) === 0x5d1c9ea3 ? 'wii' :
    buffer.readUInt32BE(0x1c) === 0xc2339f3d ? 'gamecube' : '';
  const id = buffer.toString('ascii', 0, 6);
  return system && /^[A-Z][A-Z0-9]{3}\d{2}$/.test(id) ? { id, system } : null;
}

async function readDiscIdentity(file) {
  const handle = await fs.open(file, 'r').catch(() => null);
  if (!handle) return null;
  try {
    const head = Buffer.alloc(0xe0);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    const header = head.subarray(0, bytesRead);
    const signature = header.toString('ascii', 0, 4);
    if (signature === 'RVZ\x01' || signature === 'WIA\x01') return discHeader(header.subarray(0x58));
    if (signature === 'WBFS' && header[8] >= 9 && header[8] <= 16) {
      const { bytesRead: length } = await handle.read(head, 0, 0x80, 2 ** header[8]);
      return discHeader(head.subarray(0, length));
    }
    return discHeader(header);
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

const retroSystems = {
  nes: 'Nintendo - Nintendo Entertainment System', sfc: 'Nintendo - Super Nintendo Entertainment System',
  smc: 'Nintendo - Super Nintendo Entertainment System', gb: 'Nintendo - Game Boy', gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance', n64: 'Nintendo - Nintendo 64', z64: 'Nintendo - Nintendo 64',
  md: 'Sega - Mega Drive - Genesis', gen: 'Sega - Mega Drive - Genesis'
};

function libretroArt(platform, names, kind) {
  if (!platform) return [];
  return [...new Set(names)].map(name => 'https://thumbnails.libretro.com/' + encodeURIComponent(platform) +
    '/' + kind + '/' + encodeURIComponent(name.replace(/[&*/:`<>?\\|]/g, '_')) + '.png');
}

async function romArtwork(game) {
  if (game.emulator === 'android') return { name: game.name, system: 'android', art: [] };
  const name = romTitle(game.name) || game.name;
  const filename = path.parse(game.file).name;
  if (game.emulator === 'dolphin') {
    const disc = await readDiscIdentity(game.file);
    const key = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const id = disc?.id || filename.match(discIdPattern)?.[1].toUpperCase() || namedIds.get(key);
    const system = disc?.system || (id?.startsWith('G') ? 'gamecube' : 'wii');
    const preferred = regions[id?.[3]] || 'US';
    const chooseRegions = [...new Set([preferred, 'US', 'EN'])];
    const consoleName = system === 'gamecube' ? 'Nintendo - GameCube' : 'Nintendo - Wii';
    const region = preferred === 'EN' ? 'Europe' : 'USA';
    const titles = [name + ' (' + region + ')', filename];
    const cover = (style, country) => 'https://art.gametdb.com/wii/' + style + '/' + country + '/' + id + '.png';
    const art = [...(id ? chooseRegions.map(country => cover('coverHQ', country)) : []),
      ...libretroArt(consoleName, titles, 'Named_Boxarts'),
      ...(id ? chooseRegions.map(country => cover('cover', country)) : [])];
    return { name, system, art, id, screens: libretroArt(consoleName, titles, 'Named_Snaps') };
  }
  const extension = path.extname(game.file).slice(1).toLowerCase();
  const platform = { pcsx2: 'Sony - PlayStation 2', ppsspp: 'Sony - PlayStation Portable' }[game.emulator] || retroSystems[extension];
  const files = [...new Set([filename, name + ' (USA)', name + ' (Europe)', name])];
  return {
    name, system: game.emulator, art: libretroArt(platform, files, 'Named_Boxarts'),
    screens: libretroArt(platform, files.slice(0, 2), 'Named_Snaps')
  };
}

module.exports = { romTitle, readDiscIdentity, romArtwork };

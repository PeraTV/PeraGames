'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { runHostTool } = require('./system');

const portalPattern = /^(\/run\/(?:user\/\d+|flatpak)\/doc)\/([^/]+)(?:\/(.*))?$/;
const portalError = 'O caminho do seletor do Flatpak expirou ou não está acessível. Selecione a pasta ou arquivo novamente.';

function portalParts(value) {
  const match = typeof value === 'string' && portalPattern.exec(value);
  if (!match) return;
  const [, mount, id, relative = ''] = match;
  const components = relative.split('/').filter(Boolean);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || components.some(part => part === '..' || part === '.' || part.includes('\0'))) {
    throw new Error(portalError);
  }
  return { mount, id, name: components[0], suffix: components.slice(1) };
}

async function documentOrigin({ mount, id, name }) {
  const options = { timeout: 5000, maxBuffer: 32 * 1024 };
  const result = await runHostTool('busctl', ['--user', '--json=short', 'call', 'org.freedesktop.portal.Documents',
    '/org/freedesktop/portal/documents', 'org.freedesktop.portal.Documents', 'Info', 's', id], options)
    .then(({ stdout }) => JSON.parse(stdout), () => null).catch(() => null);
  const bytes = result?.data?.[0];
  if (Array.isArray(bytes) && bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Buffer.from(bytes.at(-1) === 0 ? bytes.slice(0, -1) : bytes).toString('utf8');
  }
  const root = path.posix.join(mount, id, name || '');
  const { stdout } = await runHostTool('flatpak', ['document-info', '--', root], options);
  if (stdout.split('\n').includes('id: ' + id)) return /^origin: (\/[^\r\n]*)$/m.exec(stdout)?.[1];
}

async function hostPath(value, lookup = documentOrigin) {
  const parts = portalParts(value);
  if (!parts) return value;
  const original = await lookup(parts).catch(() => undefined);
  if (typeof original !== 'string' || !path.posix.isAbsolute(original) || original.includes('\0') || portalParts(original) ||
      (parts.name && path.posix.basename(original) !== parts.name)) throw new Error(portalError);
  return path.posix.join(original, ...parts.suffix);
}

async function hostExists(value, flag) {
  if (!value || !path.isAbsolute(value) || portalParts(value)) return false;
  if (process.platform === 'linux') {
    return runHostTool('test', [flag, value], { timeout: 5000 }).then(() => true, () => false);
  }
  return fs.stat(value).then(stat => flag === '-d' ? stat.isDirectory() : stat.isFile(), () => false);
}

async function requireHostPath(value, flag, message) {
  const resolved = await hostPath(value);
  if (!await hostExists(resolved, flag)) throw new Error(message);
  return resolved;
}

async function migratePaths(data, resolve = hostPath, storeMetadata = false) {
  const pending = new Map();
  let changed = false;
  const convert = async value => {
    if (typeof value !== 'string') return value;
    const wine = value.startsWith('wine:');
    const original = wine ? value.slice(5) : value;
    if (!portalPattern.test(original)) return value;
    if (!pending.has(original)) pending.set(original, Promise.resolve().then(() => resolve(original)).catch(() => original));
    const result = await pending.get(original);
    if (!result || result === original || portalPattern.test(result)) return value;
    changed = true;
    return wine ? 'wine:' + result : result;
  };
  const visit = async (record, keys) => {
    if (!record || typeof record !== 'object') return;
    await Promise.all(keys.map(async key => {
      if (typeof record[key] === 'string') record[key] = await convert(record[key]);
    }));
  };
  const values = object => Object.values(object || {});
  if (storeMetadata) {
    await Promise.all(values(data).map(entry => visit(entry, ['install_path', 'path', 'executable', 'working_directory'])));
  } else {
    await Promise.all([
      ...values(data.games).map(game => visit(game, ['file', 'installBase', 'installFolder'])),
      ...values(data.gameProton).flatMap(settings => [
        visit(settings, ['proton', 'prefix', 'protonPrefix', 'winePrefix', 'executable']),
        visit(settings?.prefixBackups, ['proton', 'wine'])
      ]),
      ...values(data.ownedStoreGames).flat().map(game => visit(game, ['file', 'installBase', 'installFolder'])),
      visit(data.apps, Object.keys(data.apps || {})), visit(data.storeTools, Object.keys(data.storeTools || {})),
      visit(data.preferences, ['installDirectory']),
      Array.isArray(data.protonFolders) && Promise.all(data.protonFolders.map(async (value, index) => {
        data.protonFolders[index] = await convert(value);
      }))
    ]);
  }
  return changed;
}

async function migrateStoreFile(file) {
  const raw = await fs.readFile(file, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!raw) return;
  const data = JSON.parse(raw);
  if (await migratePaths(data, hostPath, true)) await writeJsonAtomic(file, data, raw);
  return data;
}

async function writeJsonAtomic(file, data, expected) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    if (expected !== undefined && await fs.readFile(file, 'utf8') !== expected) {
      throw new Error('Os caminhos da loja mudaram durante a leitura.');
    }
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

module.exports = { portalParts, hostPath, hostExists, requireHostPath, migratePaths, migrateStoreFile, writeJsonAtomic };

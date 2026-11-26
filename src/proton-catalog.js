'use strict';

const fs = require('node:fs/promises');
const { createWriteStream, constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { runHostTool } = require('./system');

const sources = {
  ge: 'GloriousEggroll/proton-ge-custom',
  cachyos: 'CachyOS/proton-cachyos',
  umu: 'Open-Wine-Components/umu-proton'
};
const pageSize = 20;
const maxBytes = 1500 * 1024 * 1024;
const catalog = new Map();
const downloads = new Map();
const assetName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$/;
const catalogError = 'Não foi possível consultar as versões de Proton.';
const installError = 'Não foi possível instalar esta versão do Proton.';

function matchesAsset(source, name, arch) {
  if (arch === 'arm64') return source === 'ge' && /^GE-Proton[\w.-]+-aarch64\.tar\.gz$/i.test(name);
  if (arch !== 'x64') return false;
  if (source === 'cachyos') return /^proton-cachyos-[\w.-]+-slr-x86[-_]64\.tar\.(?:xz|gz)$/i.test(name);
  if (source === 'umu') return /^UMU-Proton[\w.-]+\.tar\.(?:xz|gz)$/i.test(name) && !/arm64|aarch64/i.test(name);
  return /^GE-Proton[\w.-]+\.tar\.gz$/i.test(name) && !/arm64|aarch64/i.test(name);
}

function releasePackages(source, release, arch) {
  if (!Object.hasOwn(sources, source) || release?.draft || !assetName.test(release?.tag_name || '')) return [];
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const base = 'https://github.com/' + sources[source] + '/releases/download/' + release.tag_name + '/';
  const valid = asset => asset && typeof asset.name === 'string' && assetName.test(asset.name) &&
    typeof asset.browser_download_url === 'string' && asset.browser_download_url.toLowerCase() === (base + asset.name).toLowerCase();
  return assets.filter(asset => valid(asset) && matchesAsset(source, asset.name, arch) &&
    Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= maxBytes).flatMap(asset => {
    const name = asset.name.replace(/\.tar\.(?:xz|gz)$/, '');
    const digest = /^sha256:[a-f0-9]{64}$/i.test(asset.digest) ? asset.digest.slice(7).toLowerCase() : '';
    const checksum = assets.find(item => valid(item) && item.size > 0 && item.size <= 8192 &&
      [name + '.sha512sum', asset.name + '.sha512sum'].includes(item.name));
    if (!digest && !checksum) return [];
    return [{ id: source + ':' + name, name, url: asset.browser_download_url,
      size: asset.size, digest, checksum: checksum?.browser_download_url }];
  });
}

async function getPage(source, page) {
  if (!Object.hasOwn(sources, source) || !Number.isInteger(page) || page < 1 || page > 60) throw new Error(catalogError);
  const key = source + ':' + page;
  const previous = catalog.get(key);
  if (previous && Date.now() < previous.expires) return previous.result;
  const response = await fetch('https://api.github.com/repos/' + sources[source] +
    '/releases?per_page=' + pageSize + '&page=' + page, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(12000)
  }).catch(() => null);
  if (!response?.ok) throw new Error(catalogError);
  const result = await response.json().catch(() => null);
  if (!Array.isArray(result)) throw new Error(catalogError);
  const entries = result.flatMap(release => releasePackages(source, release, process.arch));
  const value = { entries, next: page < 60 && /rel="next"/.test(response.headers.get('link') || '') };
  catalog.set(key, { expires: Date.now() + 300000, result: value });
  return value;
}

async function installed(root, name) {
  const launcher = path.join(root, name, 'proton');
  try {
    if (!(await fs.lstat(launcher)).isFile()) return false;
    await fs.access(launcher, constants.X_OK);
    return true;
  } catch { return false; }
}

async function listReleases(root, source, page) {
  const { entries, next } = await getPage(source, page);
  return { next, entries: await Promise.all(entries.map(async ({ id, name, size }) =>
    ({ id, name, size, installed: await installed(root, name) }))) };
}

async function checksumFor(entry) {
  if (entry.digest) return { kind: 'sha256', expected: entry.digest };
  const response = await fetch(entry.checksum, { signal: AbortSignal.timeout(12000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 8192) throw new Error(installError);
  const body = await response.text();
  const expected = body.length <= 8192 && /^([a-f0-9]{128})(?:\s|$)/i.exec(body.trim())?.[1];
  if (!expected) throw new Error(installError);
  return { kind: 'sha512', expected: expected.toLowerCase() };
}

async function downloadBundle(entry, archive, progress) {
  const { kind, expected } = await checksumFor(entry);
  const controller = AbortSignal.timeout(1800000);
  const response = await fetch(entry.url, { signal: controller });
  if (!response.ok || !response.body) throw new Error(installError);
  const hash = createHash(kind);
  let received = 0;
  let last = 0;
  const track = new Transform({
    transform(chunk, _, done) {
      received += chunk.length;
      if (received > entry.size) return done(new Error(installError));
      hash.update(chunk);
      if (Date.now() - last > 500) {
        progress('download', received, entry.size);
        last = Date.now();
      }
      done(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), track, createWriteStream(archive, { flags: 'wx', mode: 0o600 }), { signal: controller });
  if (received !== entry.size || hash.digest('hex') !== expected) throw new Error('A verificação do arquivo de Proton falhou.');
}

async function installBundle(root, entry, progress) {
  if (await installed(root, entry.name)) return;
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(root, '.download-'));
  try {
    const archive = path.join(staging, 'tool.tar');
    const unpack = path.join(staging, 'files');
    await fs.mkdir(unpack);
    await downloadBundle(entry, archive, progress);
    progress('extract', entry.size, entry.size);
    await runHostTool('tar', ['-xf', archive, '-C', unpack, '--no-same-owner', '--no-same-permissions', '--delay-directory-restore'],
      { timeout: 240000 });
    const contents = await fs.readdir(unpack, { withFileTypes: true });
    if (contents.length !== 1 || !contents[0].isDirectory()) throw new Error(installError);
    const source = path.join(unpack, contents[0].name);
    if (!await installed(unpack, contents[0].name)) throw new Error(installError);
    const target = path.join(root, entry.name);
    await fs.rename(source, target);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function installRelease(root, id, progress) {
  const entry = [...catalog.values()].flatMap(page => page.result.entries).find(item => item.id === id);
  if (!entry) throw new Error(catalogError);
  if (downloads.has(id)) throw new Error('Esta versão já está sendo instalada.');
  const pending = installBundle(root, entry, progress);
  downloads.set(id, pending);
  try { await pending; }
  catch (error) {
    throw new Error(error.message === 'A verificação do arquivo de Proton falhou.' ? error.message : installError);
  } finally { downloads.delete(id); }
}

module.exports = { listReleases, installRelease, releasePackages };

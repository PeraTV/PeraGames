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
const latestGEError = 'Não foi possível verificar o GE-Proton.';
const geTag = /^GE-Proton\d+-\d+(?:[.-]\w+)?$/;
const geReleases = 'https://github.com/' + sources.ge + '/releases';

async function request(url, options) {
  try { return await fetch(url, options); }
  catch (error) {
    if (!process.versions.electron || options.signal?.aborted) throw error;
    return require('electron').net.fetch(url, options);
  }
}

async function latestGEFromWebsite() {
  const response = await request(geReleases + '/latest', {
    redirect: 'manual', signal: AbortSignal.timeout(10000)
  });
  const target = new URL(response.headers.get('location') || '', geReleases);
  const tag = target.pathname.split('/').at(-1);
  if (response.status < 300 || response.status >= 400 || !geTag.test(tag) ||
      target.href !== geReleases + '/tag/' + tag) throw new Error(latestGEError);
  return tag;
}

async function latestGERelease() {
  const response = await request('https://api.github.com/repos/' + sources.ge + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(12000)
  }).catch(() => null);
  const release = response?.ok ? await response.json().catch(() => null) : null;
  if (geTag.test(release?.tag_name || '')) return release;
  const tag = await latestGEFromWebsite().catch(() => null);
  if (!tag) throw new Error(latestGEError);
  return { tag_name: tag, websiteOnly: true };
}

async function geWebsitePackage(release, arch) {
  const suffixes = arch === 'arm64' ? ['-aarch64'] : arch === 'x64' ? ['-x86_64', ''] : [];
  for (const suffix of suffixes) {
    const name = release.tag_name + suffix;
    const base = geReleases + '/download/' + release.tag_name + '/' + name;
    const expected = await readChecksum(base + '.sha512sum').catch(() => null);
    if (expected) return { id: 'ge:' + name, name, url: base + '.tar.gz', sha512: expected };
  }
  throw new Error(installError);
}

function officialReleases(source) {
  if (!Object.hasOwn(sources, source)) throw new Error(catalogError);
  return 'https://github.com/' + sources[source] + '/releases';
}

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
  const response = await request('https://api.github.com/repos/' + sources[source] +
    '/releases?per_page=' + pageSize + '&page=' + page, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(12000)
  }).catch(() => null);
  const result = response?.ok ? await response.json().catch(() => null) : null;
  if (!Array.isArray(result)) {
    if (source !== 'ge' || page !== 1) throw new Error(catalogError);
    const entry = await latestGEFromWebsite()
      .then(tag_name => geWebsitePackage({ tag_name }, process.arch)).catch(() => null);
    if (!entry) throw new Error(catalogError);
    const value = { entries: [entry], next: false, websiteOnly: true };
    catalog.set(key, { expires: Date.now() + 60000, result: value });
    return value;
  }
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
    return (await fs.stat(path.join(root, name, 'toolmanifest.vdf'))).isFile();
  } catch { return false; }
}

async function listReleases(root, source, page) {
  const { entries, next, websiteOnly } = await getPage(source, page);
  return { next, websiteOnly, entries: await Promise.all(entries.map(async ({ id, name, size }) =>
    ({ id, name, size, installed: await installed(root, name) }))) };
}

async function readChecksum(url) {
  const response = await request(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 8192) throw new Error(installError);
  const body = await response.text();
  const expected = body.length <= 8192 && /^([a-f0-9]{128})(?:\s|$)/i.exec(body.trim())?.[1];
  if (!expected) throw new Error(installError);
  return expected.toLowerCase();
}

async function checksumFor(entry) {
  if (entry.digest) return { kind: 'sha256', expected: entry.digest };
  return { kind: 'sha512', expected: entry.sha512 || await readChecksum(entry.checksum) };
}

async function downloadBundle(entry, archive, progress) {
  const { kind, expected } = await checksumFor(entry);
  const controller = AbortSignal.timeout(1800000);
  const response = await request(entry.url, { signal: controller });
  if (!response.ok || !response.body) throw new Error(installError);
  const declaredSize = Number(response.headers.get('content-length'));
  const total = entry.size || (declaredSize > 0 && declaredSize <= maxBytes ? declaredSize : 0);
  const hash = createHash(kind);
  let received = 0;
  let last = 0;
  const track = new Transform({
    transform(chunk, _, done) {
      received += chunk.length;
      if (received > (total || maxBytes)) return done(new Error(installError));
      hash.update(chunk);
      if (Date.now() - last > 500) {
        progress('download', received, total);
        last = Date.now();
      }
      done(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), track, createWriteStream(archive, { flags: 'wx', mode: 0o600 }), { signal: controller });
  if ((total && received !== total) || hash.digest('hex') !== expected) throw new Error('A verificação do arquivo de Proton falhou.');
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
  await installEntry(root, entry, progress);
}

async function installEntry(root, entry, progress) {
  const key = path.join(root, entry.name);
  if (!downloads.has(key)) {
    const pending = installBundle(root, entry, progress).catch(error => {
      throw new Error(error.message === 'A verificação do arquivo de Proton falhou.' ? error.message : installError);
    }).finally(() => downloads.delete(key));
    downloads.set(key, pending);
  }
  await downloads.get(key);
}

async function installLatestGE(root, progress = () => {}) {
  const release = await latestGERelease();
  const [entry] = release.websiteOnly ? [await geWebsitePackage(release, process.arch)] : releasePackages('ge', release, process.arch);
  if (!entry) throw new Error(installError);
  await installEntry(root, entry, progress);
  return path.join(root, entry.name);
}

module.exports = { listReleases, installRelease, releasePackages, latestGERelease, installLatestGE, officialReleases };

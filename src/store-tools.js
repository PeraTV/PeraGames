'use strict';

const fs = require('node:fs/promises');
const { constants, createWriteStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const { runHostTool } = require('./system');

const releases = {
  epic: { repo: 'legendary-gl/legendary', tag: '0.21.1', name: 'legendary' },
  gog: { repo: 'Heroic-Games-Launcher/heroic-gogdl', tag: 'v1.4.0', name: 'gogdl' },
  amazon: { repo: 'imLinguin/nile', tag: 'v1.2.0', name: 'nile' }
};
const maxSize = 40 * 1024 * 1024;
const unavailable = 'O componente da loja não está disponível para este sistema.';
const downloadError = 'Não foi possível baixar ou verificar o componente da loja. Tente novamente.';
const invalidTool = 'O arquivo não pôde ser executado como componente desta loja. Confira o sistema e a arquitetura.';
const jobs = new Map();

function releaseAsset(provider, platform = process.platform, arch = process.arch) {
  if (!Object.hasOwn(releases, provider) || !['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) return;
  if (provider === 'amazon' && platform === 'win32' && arch !== 'x64') return;
  const intel = provider === 'epic' ? 'x64' : 'x86_64';
  const system = platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : provider === 'gog' ? 'macos' : 'macOS';
  const release = releases[provider];
  return { ...release, asset: `${release.name}_${system}_${arch === 'x64' ? intel : arch}${platform === 'win32' ? '.exe' : ''}` };
}

const toolPath = (root, provider) => path.join(root, 'stores', provider, 'components',
  releases[provider].name + (process.platform === 'win32' ? '.exe' : ''));

async function findStoreTool(root, provider) {
  const file = toolPath(root, provider);
  return fs.access(file, constants.X_OK).then(() => file, () => undefined);
}

async function downloadTool(release, file) {
  try {
    const signal = AbortSignal.timeout(120000);
    const metadata = await fetch(`https://api.github.com/repos/${release.repo}/releases/tags/${release.tag}`, { signal, redirect: 'error' });
    if (!metadata.ok) throw new Error();
    const data = await metadata.json();
    const asset = data.assets?.find(item => item.name === release.asset);
    const digest = /^sha256:([a-f0-9]{64})$/.exec(asset?.digest || '')?.[1];
    if (!digest || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > maxSize) throw new Error();
    const url = `https://github.com/${release.repo}/releases/download/${release.tag}/${release.asset}`;
    const response = await fetch(url, { signal });
    if (!response.ok || !response.body) throw new Error();
    const hash = createHash('sha256');
    let received = 0;
    const verify = new Transform({ transform(chunk, _, done) {
      received += chunk.length;
      if (received > asset.size) return done(new Error());
      hash.update(chunk);
      done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(file, { flags: 'wx', mode: 0o700 }), { signal });
    if (received !== asset.size || hash.digest('hex') !== digest) throw new Error();
  } catch { throw new Error(downloadError); }
}

function setupStoreTool(root, provider, selected) {
  if (!Object.hasOwn(releases, provider)) throw new Error(unavailable);
  const file = toolPath(root, provider);
  if (jobs.has(file)) return jobs.get(file);
  const job = (async () => {
    const release = releaseAsset(provider);
    if (!selected && !release) throw new Error(unavailable);
    const folder = path.dirname(file);
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const staging = await fs.mkdtemp(path.join(folder, '.install-'));
    try {
      const executable = path.join(staging, path.basename(file));
      if (selected) {
        const stats = await fs.stat(selected).catch(() => null);
        if (!stats?.isFile() || stats.size > maxSize) throw new Error(invalidTool);
        await fs.copyFile(selected, executable);
        await fs.chmod(executable, 0o700);
      } else await downloadTool(release, executable);
      try { await runHostTool(executable, ['--version'], { timeout: 15000, maxBuffer: 65536 }); }
      catch { throw new Error(invalidTool); }
      await fs.rename(executable, file);
      return file;
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  })().finally(() => jobs.delete(file));
  jobs.set(file, job);
  return job;
}

module.exports = { releaseAsset, findStoreTool, setupStoreTool };

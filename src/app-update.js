'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Transform, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const appId = 'io.github.PeraTV.PeraGames';
const releaseVersion = /^v?(\d+)\.(\d+)\.(\d+)$/;

function releaseChanges(body) {
  if (typeof body !== 'string') return [];
  return body.slice(0, 12000).split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^#|^\*\*Full Changelog\*\*|^<!--/i.test(line))
    .slice(0, 25)
    .map(line => line.replace(/^(?:[-*+] |\d+\. )/, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/\*\*|\x60/g, ''));
}

async function publishedChanges(repository, tag, body) {
  const response = await fetch('https://raw.githubusercontent.com/' + repository + '/' +
    tag + '/src/release-notes.json', { redirect: 'error', signal: AbortSignal.timeout(3000) })
    .catch(() => null);
  const notes = response?.ok ? await response.json().catch(() => null) : null;
  if (notes?.version === tag.replace(/^v/, '') && Array.isArray(notes.changes)) {
    const changes = notes.changes.filter(change => typeof change === 'string' && change.trim())
      .slice(0, 25).map(change => change.slice(0, 1000));
    if (changes.length) return changes;
  }
  return releaseChanges(body);
}

async function installFlatpakUpdate(file, execute = run) {
  const command = ['--host', 'flatpak'];
  const userInstall = await execute('flatpak-spawn', [...command, 'info', '--user', appId], { timeout: 8000 })
    .then(() => true, () => false);
  const scope = userInstall ? ['--user', '--noninteractive'] : ['--system'];
  try {
    await execute('flatpak-spawn', [...command, 'install', ...scope, '--assumeyes', '--reinstall', '--bundle', file],
      { timeout: 300000 });
  } catch (error) {
    const denied = /not allowed|not authori[sz]ed|permission denied|polkit|authorization|cancelled|cancelado/i.test(error.stderr || '');
    throw new Error(!userInstall && denied ?
      'O Linux não autorizou a atualização do Flatpak do sistema. Baixe o instalador pela página da versão e abra-o para autorizar.' :
      'Não foi possível instalar a atualização do Flatpak. Abra a página da versão para baixar o instalador.');
  }
}

function isNewerRelease(remote, installed) {
  const parts = tag => releaseVersion.exec(tag)?.slice(1).map(Number);
  const candidate = parts(remote);
  const current = parts(installed);
  if (!candidate || !current) return false;
  const index = candidate.findIndex((part, i) => part !== current[i]);
  return index >= 0 && candidate[index] > current[index];
}

function createUpdater({ app, shell, version, repository }) {
  let pendingRelease;
  let installing = false;
  let macUpdater;

  async function check() {
    pendingRelease = undefined;
    const result = { version };
    const response = await fetch('https://api.github.com/repos/' + repository + '/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PeraGames/' + version },
      redirect: 'error', signal: AbortSignal.timeout(7000)
    });
    if (response.status === 404) return { ...result, status: 'no-release' };
    if (!response.ok) throw new Error('Não foi possível consultar as versões do PeraGames.');
    const release = await response.json();
    if (!isNewerRelease(release.tag_name, version)) return { ...result, status: 'current' };
    const tag = encodeURIComponent(release.tag_name);
    const base = 'https://github.com/' + repository + '/releases/';
    pendingRelease = { page: base + 'tag/' + tag };
    const arch = process.arch;
    const flatpak = process.platform === 'linux' && process.env.FLATPAK_ID === appId;
    const os = process.platform === 'win32' ? 'windows' : flatpak ? 'flatpak' : app.isPackaged && process.platform === 'darwin' ? 'mac' : '';
    const filename = os === 'windows' ? 'PeraGames-Windows-' + arch + '-Setup.exe' : 'PeraGames-Linux-' + arch + '.flatpak';
    const asset = release.assets?.find(item => item.name === filename && /^sha256:[a-f0-9]{64}$/i.test(item.digest));
    if (os === 'mac' && release.assets?.some(item => item.name === 'latest-mac.yml')) {
      pendingRelease.os = os;
    } else if (asset && (os === 'windows' || os === 'flatpak')) {
      Object.assign(pendingRelease, { os, filename, url: base + 'download/' + tag + '/' + filename, sha: asset.digest.slice(7).toLowerCase() });
    }
    return { ...result, status: 'available', latest: release.tag_name, installable: Boolean(pendingRelease.os),
      changes: await publishedChanges(repository, tag, release.body) };
  }

  async function install() {
    const release = pendingRelease;
    if (installing || !release?.os) throw new Error('Verifique se há uma atualização instalável.');
    installing = true;
    let folder;
    let keep = false;
    try {
      if (release.os === 'mac') {
        macUpdater ||= require('electron-updater').autoUpdater;
        macUpdater.autoDownload = false;
        macUpdater.autoInstallOnAppQuit = false;
        const result = await macUpdater.checkForUpdates();
        if (!result?.isUpdateAvailable) throw new Error('Nenhuma atualização assinada está disponível para este Mac.');
        await macUpdater.downloadUpdate();
        setImmediate(() => macUpdater.quitAndInstall());
        return;
      }
      folder = await fs.mkdtemp(path.join(app.getPath('userData'), 'update-'));
      const file = path.join(folder, release.filename);
      const response = await fetch(release.url, { signal: AbortSignal.timeout(300000) });
      if (!response.ok || !response.body) throw new Error('Falha ao baixar a atualização.');
      const hash = createHash('sha256');
      await pipeline(Readable.fromWeb(response.body), new Transform({
        transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); }
      }), require('node:fs').createWriteStream(file, { flags: 'wx' }));
      if (hash.digest('hex') !== release.sha) throw new Error('A integridade do instalador não pôde ser confirmada.');
      if (release.os === 'flatpak') {
        await installFlatpakUpdate(file);
        return { restart: true };
      }
      const error = await shell.openPath(file);
      if (error) throw new Error('Não foi possível abrir o instalador do Windows.');
      keep = true;
      setImmediate(() => app.quit());
    } finally {
      installing = false;
      if (folder && !keep) await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }

  return { check, install, open: () => pendingRelease && shell.openExternal(pendingRelease.page) };
}

module.exports = { createUpdater, isNewerRelease, installFlatpakUpdate, releaseChanges };

'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { findLinuxCommand, runHostTool } = require('./system');

const version = '1.4.4';
const url = `https://github.com/Open-Wine-Components/umu-launcher/releases/download/${version}/umu-launcher-${version}-zipapp.tar`;
const digest = 'eb590691841f7fad3fc3ad8fd5db4ccb87849fe7948e62b28ece7a4ee48cc851';
const installSize = 430080;
const installations = new Map();
const managedRunner = root => path.join(root, version, 'umu-run');

async function installedUmu(root) {
  const file = managedRunner(root);
  try {
    if (!(await fs.lstat(file)).isFile()) return;
    await fs.access(file, constants.X_OK);
    return file;
  } catch { return undefined; }
}

async function findUmu(root) {
  return await installedUmu(root) || findLinuxCommand('umu-run', process.env);
}

function supportedUmuVersion(output) {
  const installed = /\bumu-launcher version (\d+)\.(\d+)\.(\d+)/i.exec(output)?.slice(1).map(Number);
  if (!installed) return false;
  const minimum = version.split('.').map(Number);
  const firstDifference = minimum.findIndex((part, index) => part !== installed[index]);
  return firstDifference < 0 || installed[firstDifference] > minimum[firstDifference];
}

async function installUmu(root) {
  const python = await findLinuxCommand('python3', process.env);
  if (!python || !await runHostTool(python, ['-c', 'import sys; sys.exit(sys.version_info < (3, 10))'], { timeout: 5000 })
    .then(() => true, () => false)) {
    throw new Error('O umu-launcher precisa de Python 3.10 ou mais recente no Linux.');
  }

  const signal = AbortSignal.timeout(30000);
  const response = await fetch(url, { signal }).catch(() => null);
  if (!response?.ok || !response.body) throw new Error('Não foi possível baixar o umu-launcher. Tente novamente.');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > installSize) throw new Error('Arquivo maior que o esperado.');
      chunks.push(chunk);
    }
  } catch {
    throw new Error('Não foi possível baixar o umu-launcher. Tente novamente.');
  }
  const archive = Buffer.concat(chunks, size);
  if (size !== installSize || createHash('sha256').update(archive).digest('hex') !== digest) {
    throw new Error('A verificação do arquivo do umu-launcher falhou.');
  }

  const file = managedRunner(root);
  const folder = path.dirname(file);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(folder, '.download-'));
  try {
    const tar = path.join(staging, 'umu.tar');
    const executable = path.join(staging, 'umu-run');
    await fs.writeFile(tar, archive, { mode: 0o600 });
    const { stdout } = await runHostTool('tar', ['-xOf', tar, 'umu/umu-run'], {
      encoding: 'buffer', maxBuffer: installSize, timeout: 8000
    });
    await fs.writeFile(executable, stdout, { mode: 0o700, flag: 'wx' });
    await runHostTool(executable, ['--version'], { timeout: 8000 });
    await fs.rename(executable, file);
    return file;
  } catch {
    throw new Error('Não foi possível preparar o umu-launcher no Linux.');
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureUmu(root) {
  const existing = await installedUmu(root);
  if (existing) return existing;
  if (!installations.has(root)) {
    const select = async () => {
      const system = await findLinuxCommand('umu-run', process.env);
      if (system) {
        const output = await runHostTool(system, ['--version'], { timeout: 5000 })
          .then(({ stdout, stderr }) => `${stdout}\n${stderr}`, () => '');
        if (supportedUmuVersion(output)) return system;
      }
      return installUmu(root);
    };
    installations.set(root, select().finally(() => installations.delete(root)));
  }
  return installations.get(root);
}

module.exports = { findUmu, ensureUmu };

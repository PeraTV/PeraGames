'use strict';

const path = require('node:path');
const os = require('node:os');
const { runHostTool, findLinuxCommand } = require('./system');
const { hostPath, hostExists } = require('./host-paths');

const row = (key, status) => ({ key, status });
const options = { timeout: 5000, maxBuffer: 256 * 1024 };
const labels = Object.freeze({
  paths: 'Pasta do jogo', executable: 'Executável do jogo', cwd: 'Diretório de trabalho',
  prefix: 'Prefixo do jogo', backup: 'Backup do prefixo', proton: 'Proton ou Wine selecionado', umu: 'UMU',
  runtime: 'Steam Linux Runtime', flatpak: 'Acesso ao host pelo Flatpak', vulkan: 'Vulkan no host',
  libraries32: 'Vulkan e OpenGL de 32 bits', d3dcompiler_43: 'Winetricks d3dcompiler_43',
  d3dx9_43: 'Winetricks d3dx9_43', authentication: 'Autenticação da loja', dependency: 'Dependência',
  game: 'Processo do jogo'
});
const statuses = Object.freeze({ ok: 'Disponível', missing: 'Ausente ou inacessível', unknown: 'Não verificado',
  pending: 'Ainda não criado', na: 'Não se aplica', detected: 'Detectado, sem teste de execução', failed: 'Falhou' });

async function readHost(tool, args) {
  return runHostTool(tool, args, options).then(result => result.stdout, () => undefined);
}

async function pathStatus(value, kind) {
  if (!value) return 'unknown';
  return await hostPath(value).then(file => hostExists(file, kind), () => false) ? 'ok' : 'missing';
}

async function diagnoseGame({ resolvePaths, prefix, backup, runner, umu, protonUsing, knownDependencies = [], lastStage,
  flatpak = Boolean(process.env.FLATPAK_ID), home = os.homedir() }) {
  const [paths, prefixFolder] = await Promise.all([
    Promise.resolve().then(resolvePaths).catch(() => null),
    Promise.resolve().then(prefix).catch(() => null)
  ]);
  const libraryCheck = readHost('ldconfig', ['-p']).then(output =>
    output === undefined ? readHost('/sbin/ldconfig', ['-p']) : output);
  const graphicsCheck = findLinuxCommand('vulkaninfo', process.env).then(async tool =>
    !tool ? 'unknown' : await readHost(tool, ['--summary']) === undefined ? 'failed' : 'ok');
  const runtimeCheck = protonUsing && (async () => {
    const xdg = (await readHost('printenv', ['XDG_DATA_HOME']))?.trim();
    const base = path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(home, '.local', 'share'), 'umu');
    const checks = await Promise.all(['steamrt4', 'steamrt3', 'steamrt2', 'sniper', 'soldier'].map(name =>
      pathStatus(path.join(base, name, '_v2-entry-point'), '-x')));
    return checks.includes('ok') ? 'detected' : 'unknown';
  })();
  const [directory, executable, cwd, prefixCheck, backupCheck, runnerCheck, umuCheck, access, vulkan, libraries, runtime] = await Promise.all([
    paths ? pathStatus(paths.directory, '-d') : 'missing',
    paths ? pathStatus(paths.executable, '-f') : 'unknown',
    paths ? pathStatus(paths.cwd, '-d') : 'unknown',
    prefixFolder ? pathStatus(prefixFolder, '-d') : 'missing',
    backup ? pathStatus(backup, '-d') : 'na',
    runner ? Promise.all((protonUsing ? [
      [path.join(runner, 'proton'), '-x'], [path.join(runner, 'toolmanifest.vdf'), '-f'],
      [path.join(runner, 'files/share/wine'), '-d']
    ] : [[runner, '-x']]).map(([file, flag]) => pathStatus(file, flag)))
      .then(checks => checks.every(check => check === 'ok') ? 'ok' : 'missing') : 'unknown',
    protonUsing ? (umu ? pathStatus(umu, '-x') : 'missing') : 'na',
    flatpak ? readHost('true', []).then(output => output === undefined ? 'failed' : 'ok') : 'na',
    graphicsCheck, libraryCheck, runtimeCheck || 'na'
  ]);
  let libraries32 = 'na';
  if (process.arch === 'x64') {
    const found = libraries?.split('\n').filter(line => /\/lib32\/|\/i386-linux-gnu\/|\(libc6\)/.test(line)) || [];
    libraries32 = ['libvulkan.so.1', 'libGL.so.1'].every(name => found.some(line => line.trimStart().startsWith(name + ' ')))
      ? 'detected' : 'unknown';
  }
  const checks = [row('paths', directory), row('executable', executable), row('cwd', cwd),
    row('prefix', prefixCheck === 'missing' && prefixFolder && !backup ? 'pending' : prefixCheck), row('backup', backupCheck),
    row('proton', runnerCheck), row('umu', umuCheck), row('runtime', runtime), row('flatpak', access),
    row('vulkan', vulkan), row('libraries32', libraries32)];
  if (knownDependencies.length) {
    const logs = prefixFolder ? await Promise.all(['', 'pfx'].map(folder =>
      readHost('cat', ['--', path.join(prefixFolder, folder, 'winetricks.log')]))) : [];
    const installed = new Set(logs.filter(Boolean).flatMap(log => log.split(/\r?\n/).map(line => line.trim())));
    for (const verb of knownDependencies) {
      if (Object.hasOwn(labels, verb)) checks.push(row(verb, installed.has(verb) ? 'detected' : 'unknown'));
    }
  }
  return { checks, lastStage: Object.hasOwn(labels, lastStage) ? lastStage : undefined };
}

function diagnosticReport(report, translate = value => value) {
  const lines = [translate('Diagnóstico do PeraGames')];
  for (const { key, status } of report.checks) {
    if (Object.hasOwn(labels, key) && Object.hasOwn(statuses, status)) {
      lines.push(translate(labels[key]) + ' — ' + translate(statuses[status]));
    }
  }
  if (Object.hasOwn(labels, report.lastStage)) lines.push(translate('Última etapa com falha') + ' — ' + translate(labels[report.lastStage]));
  return lines.join('\n');
}

module.exports = { diagnoseGame, diagnosticReport, diagnosticLabels: labels };

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readLibraryFolders, runHostTool } = require('./system');

const defaultTool = 'steam-default';
const readText = file => fs.readFile(file, 'utf8').catch(error => {
  if (['ENOENT', 'ENOTDIR'].includes(error.code)) return '';
  throw error;
});
const configError = 'Não foi possível ler ou alterar a configuração de compatibilidade da Steam.';
const toolId = /^[A-Za-z0-9][A-Za-z0-9_. +-]{0,120}$/;
const valveProton = [
  ['proton_experimental', 'Proton Experimental', '1493710'],
  ['proton_hotfix', 'Proton Hotfix', '2180100'],
  ['proton_11', 'Proton 11.0', '4628710'],
  ['proton_10', 'Proton 10.0', '3658110'],
  ['proton_9', 'Proton 9.0', '2805730'],
  ['proton_8', 'Proton 8.0', '2348590'],
  ['proton_7', 'Proton 7.0', '1887720'],
  ['proton_63', 'Proton 6.3', '1580130'],
  ['proton_513', 'Proton 5.13', '1420170'],
  ['proton_5', 'Proton 5.0', '1245040'],
  ['proton_411', 'Proton 4.11', '1113280'],
  ['proton_42', 'Proton 4.2', '1054830'],
  ['proton_316', 'Proton 3.16', '961940'],
  ['proton_37', 'Proton 3.7', '858280']
].map(([id, name, appId]) => ({ id, name, appId }));

function parseKeyValues(text) {
  const scanner = /\s+|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}]/gy;
  const tokens = [];
  let position = 0;
  while (position < text.length) {
    scanner.lastIndex = position;
    const match = scanner.exec(text);
    if (!match) throw new Error(configError);
    position = scanner.lastIndex;
    if (!/^\s|^\/\//.test(match[0])) tokens.push({ raw: match[0], start: match.index, end: position });
  }
  let index = 0;
  const valueOf = token => token.raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
  function readEntries(nested, depth) {
    if (depth > 64) throw new Error(configError);
    const entries = [];
    while (index < tokens.length) {
      const key = tokens[index++];
      if (nested && key.raw === '}') return { entries, close: key.start, end: key.end };
      const value = tokens[index++];
      if (!key.raw.startsWith('"') || !value) throw new Error(configError);
      if (value.raw === '{') entries.push({ key: valueOf(key), start: key.start, ...readEntries(true, depth + 1) });
      else if (value.raw.startsWith('"')) entries.push({ key: valueOf(key), value: valueOf(value), start: key.start, valueStart: value.start, end: value.end });
      else throw new Error(configError);
    }
    if (nested) throw new Error(configError);
    return { entries };
  }
  return readEntries(false, 0);
}

function child(node, key) {
  const values = node?.entries?.filter(item => item.key.toLowerCase() === key.toLowerCase()) || [];
  if (values.length > 1) throw new Error(configError);
  return values[0];
}

function steamNode(text) {
  const steam = ['InstallConfigStore', 'Software', 'Valve', 'Steam'].reduce(child, parseKeyValues(text));
  if (!steam?.entries) throw new Error(configError);
  return steam;
}

function readSteamChoice(text, appId) {
  const mapping = child(steamNode(text), 'CompatToolMapping');
  return child(child(mapping, appId), 'name')?.value || defaultTool;
}

function writeSteamChoice(text, appId, choice) {
  if (!/^\d+$/.test(appId) || !toolId.test(choice)) throw new Error(configError);
  const steam = steamNode(text);
  const mapping = child(steam, 'CompatToolMapping');
  if (mapping && !mapping.entries) throw new Error(configError);
  const entry = child(mapping, appId);
  const name = child(entry, 'name');
  if (entry && !entry.entries || name && name.value === undefined) throw new Error(configError);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  if (choice === defaultTool) return entry ? text.slice(0, entry.start) + text.slice(entry.end) : text;
  if (name) return text.slice(0, name.valueStart) + JSON.stringify(choice) + text.slice(name.end);
  const block = ['"' + appId + '"', '{', '\t"name" ' + JSON.stringify(choice), '\t"config" ""', '\t"priority" "250"', '}'].join(newline + '\t\t\t\t\t');
  const addition = mapping ? block : ['"CompatToolMapping"', '{', '\t' + block, '}'].join(newline + '\t\t\t\t');
  const at = entry?.close ?? mapping?.close ?? steam.close;
  const body = entry ? '"name" ' + JSON.stringify(choice) : addition;
  return text.slice(0, at) + newline + '\t\t\t\t' + body + newline + '\t\t\t' + text.slice(at);
}

function parseSteamTool(text) {
  try {
    const tools = child(child(parseKeyValues(text), 'compatibilitytools'), 'compat_tools');
    const options = tools?.entries?.filter(entry =>
      toolId.test(entry.key) && /proton/i.test(entry.key) &&
      ['.', './'].includes(child(entry, 'install_path')?.value));
    const entry = options?.[0];
    if (entry) return { id: entry.key, name: child(entry, 'display_name')?.value || entry.key };
  } catch {}
}

async function findSteamConfig(roots, preferFlatpak) {
  const matching = roots.filter(root => root.includes('com.valvesoftware.Steam') === preferFlatpak);
  for (const root of matching.length ? matching : roots) {
    const file = path.join(root, 'config', 'config.vdf');
    const text = await readText(file);
    if (text) return { root, file, text };
  }
  throw new Error('A configuração da Steam não foi encontrada. Abra a Steam uma vez para criá-la.');
}

async function steamLibraryRoots(root) {
  const files = ['steamapps/libraryfolders.vdf', 'config/libraryfolders.vdf'];
  const folders = (await Promise.all(files.map(file => readText(path.join(root, file)).catch(() => ''))))
    .flatMap(readLibraryFolders);
  return [...new Set([root, ...folders.filter(folder => path.isAbsolute(folder))])];
}

async function listSteamTools(root, localVersions = []) {
  const roots = [path.join(root, 'compatibilitytools.d'), ...(await steamLibraryRoots(root))
    .map(folder => path.join(folder, 'steamapps', 'common'))];
  const found = await Promise.all([...new Set(roots)].map(async folder => {
    const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
    return Promise.all(entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(async entry => {
      const runnerFile = path.join(folder, entry.name, 'compatibilitytool.vdf');
      return parseSteamTool(await readText(runnerFile).catch(() => ''));
    }));
  }));
  const tools = new Map();
  for (const option of found.flat().filter(Boolean)) tools.set(option.id, { ...option, installed: true });
  for (const official of valveProton) {
    tools.set(official.id, { ...official, installed: false, ...tools.get(official.id) });
  }
  const shared = await Promise.all(localVersions.filter(version => path.isAbsolute(version.path)).map(async version => {
    const tool = parseSteamTool(await readText(path.join(version.path, 'compatibilitytool.vdf')).catch(() => ''));
    return tool && { ...tool, folder: version.path };
  }));
  for (const tool of shared.filter(Boolean)) {
    if (!tools.has(tool.id)) tools.set(tool.id, tool);
  }
  return [...tools.values()].sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
}

const ensureSteamClosed = `if pgrep -u "$(id -u)" -x steam >/dev/null 2>&1; then
  exit 71
else
  [ "$?" -eq 1 ] || exit 72
fi`;

async function steamHostWrite(script, args, options) {
  try {
    return await runHostTool('sh', ['-c', ensureSteamClosed + '\nset -eu\n' + script, 'peragames', ...args], options);
  } catch (error) {
    if (error.code === 71) throw new Error('Feche a Steam completamente para salvar a versão do Proton.');
    if (error.code === 73) throw new Error('A configuração da Steam mudou. Reabra a ficha e tente novamente.');
    throw new Error(configError);
  }
}

async function saveSteamChoice(config, appId, choice) {
  const updated = writeSteamChoice(config.text, appId, choice);
  if (updated === config.text) return;
  const digest = createHash('sha256').update(config.text).digest('hex');
  const script = `file=$1
[ -f "$file" ] && [ ! -L "$file" ]
previous=$(sha256sum < "$file" | cut -d' ' -f1)
[ "$previous" = "$2" ] || exit 73
temp=$(mktemp -- "$file.peragames.XXXXXX")
trap 'rm -f -- "$temp"' EXIT
chmod --reference="$file" -- "$temp"
cat > "$temp"
[ -s "$temp" ]
` + ensureSteamClosed + `
current=$(sha256sum < "$file" | cut -d' ' -f1)
[ "$current" = "$previous" ] || exit 73
if [ ! -e "$file.peragames.bak" ]; then cp -p -- "$file" "$file.peragames.bak"; fi
mv -fT -- "$temp" "$file"
`;
  await steamHostWrite(script, [config.file, digest], { input: updated, timeout: 15000 });
}

async function addSteamTool(root, folder) {
  const tool = parseSteamTool(await readText(path.join(folder, 'compatibilitytool.vdf')));
  if (!tool) throw new Error('Escolha uma pasta de Proton com compatibilitytool.vdf.');
  const destination = path.join(root, 'compatibilitytools.d', path.basename(folder));
  const existing = parseSteamTool(await readText(path.join(destination, 'compatibilitytool.vdf')));
  if (existing?.id === tool.id) return tool.id;
  if (existing) throw new Error('Já existe outra versão nessa pasta de compatibilidade da Steam.');
  await steamHostWrite(`parent=$(dirname -- "$2")
mkdir -p -- "$parent"
[ ! -e "$2" ]
temp=$(mktemp -d -- "$parent/.peragames-proton.XXXXXX")
trap 'rm -rf -- "$temp"' EXIT
cp -a -- "$1/." "$temp/"
mv -nT -- "$temp" "$2"
[ ! -d "$temp" ]
`, [folder, destination], { timeout: 300000 });
  return tool.id;
}

module.exports = { defaultTool, valveProton, steamLibraryRoots, readSteamChoice, writeSteamChoice, parseSteamTool,
  findSteamConfig, listSteamTools, saveSteamChoice, addSteamTool };

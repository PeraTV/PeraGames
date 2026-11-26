'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const loginFlag = '--peragames-tv-login';

function loginCommand() {
  const args = process.defaultApp ? [path.join(__dirname, '..')] : [];
  args.push(loginFlag);
  return { exe: process.env.APPIMAGE || process.execPath, args };
}

function escapeDesktopExec(value) {
  return '"' + value.replace(/%/g, '%%').replace(/["`$\\]/g, '\\\\$&') + '"';
}

async function setTvLogin(app, platform, openAtLogin) {
  const { exe, args } = loginCommand();
  if (platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin, path: exe, args });
    return;
  }
  if (platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin });
    return;
  }
  if (process.env.FLATPAK_ID) throw new Error('No Flatpak, configure a inicialização com a sessão no seu ambiente gráfico.');
  if (platform !== 'linux') throw new Error('Inicialização automática indisponível neste sistema.');
  const root = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const folder = path.join(root, 'autostart');
  const file = path.join(folder, 'peragames-tv.desktop');
  if (!openAtLogin) {
    await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    return;
  }
  const command = [exe, ...args].map(escapeDesktopExec).join(' ');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(file + '.tmp', '[Desktop Entry]\nType=Application\nName=PeraGames · Modo TV\nExec=' + command + '\nTerminal=false\n', 'utf8');
  await fs.rename(file + '.tmp', file);
}

module.exports = { loginFlag, setTvLogin, escapeDesktopExec };

'use strict';

const stores = [
  {
    id: 'afterburner', name: 'MSI Afterburner', category: 'Ferramentas',
    description: 'Monitore o uso da GPU, temperaturas e desempenho no Windows.',
    website: 'https://www.msi.com/Landing/afterburner', windowsUrl: 'https://www.msi.com/Landing/afterburner',
    windowsPaths: ['MSI Afterburner/MSIAfterburner.exe']
  },
  {
    id: 'steam', name: 'Steam', category: 'Lojas', icon: 'steam', color: '#78c6ed',
    description: 'Sua biblioteca Steam e a loja da Valve.', website: 'https://store.steampowered.com/',
    windowsUrl: 'https://store.steampowered.com/about/',
    linuxUrl: 'https://flathub.org/apps/com.valvesoftware.Steam',
    linuxCommands: ['steam'], flatpaks: ['com.valvesoftware.Steam']
  },
  {
    id: 'epic', name: 'Epic Games', category: 'Lojas', icon: 'epic',
    description: 'Acesse sua biblioteca da Epic. O launcher oficial tem uma versão prévia para Linux.',
    website: 'https://store.epicgames.com/',
    windowsUrl: 'https://store.epicgames.com/download',
    linuxUrl: 'https://launcher.epicgames.com/',
    linuxCommands: ['EpicGamesLauncher', 'epic-games-launcher', 'epicgameslauncher'],
    windowsPaths: ['Epic Games/Launcher/Portal/Binaries/Win64/EpicGamesLauncher.exe']
  },
  {
    id: 'gog', name: 'GOG', category: 'Lojas', icon: 'gog',
    description: 'Conecte sua conta GOG ou configure o GOG GALAXY para acessar sua biblioteca.',
    website: 'https://www.gog.com/', windowsUrl: 'https://www.gog.com/galaxy',
    windowsPaths: ['GOG Galaxy/GalaxyClient.exe']
  },
  {
    id: 'amazon', name: 'Amazon Games', category: 'Lojas', icon: 'amazon',
    description: 'Conecte sua conta Amazon para acessar os jogos resgatados na sua biblioteca.',
    website: 'https://www.amazongames.com/', windowsUrl: 'https://www.amazongames.com/en-us/support/prime-gaming/articles/download-and-install-the-amazon-games-app',
    windowsPaths: ['Amazon Games/App/Amazon Games.exe']
  },
  {
    id: 'xbox', name: 'Xbox para PC', category: 'Lojas',
    description: 'Acesse sua biblioteca Xbox no PC e o Game Pass.',
    website: 'https://www.xbox.com/pt-BR/apps/xbox-app-for-pc', windowsUrl: 'https://www.xbox.com/pt-BR/apps/xbox-app-for-pc'
  },
  {
    id: 'battle', name: 'Battle.net', category: 'Lojas',
    description: 'Abra o launcher da Blizzard e gerencie seus jogos.',
    website: 'https://battle.net/', windowsUrl: 'https://download.battle.net/en-us/desktop',
    windowsPaths: ['Battle.net/Battle.net Launcher.exe', 'Battle.net/Battle.net.exe']
  },
  {
    id: 'ea', name: 'EA app', category: 'Lojas',
    description: 'Gerencie sua biblioteca de jogos da Electronic Arts.',
    website: 'https://www.ea.com/', windowsUrl: 'https://www.ea.com/ea-app',
    windowsPaths: ['Electronic Arts/EA Desktop/EA Desktop/EADesktop.exe']
  },
  {
    id: 'ubisoft', name: 'Ubisoft Connect', category: 'Lojas',
    description: 'Acesse a biblioteca e os serviços da Ubisoft.',
    website: 'https://www.ubisoft.com/en-us/ubisoft-connect', windowsUrl: 'https://www.ubisoft.com/en-us/ubisoft-connect',
    windowsPaths: ['Ubisoft/Ubisoft Game Launcher/UbisoftConnect.exe', 'Ubisoft/Ubisoft Game Launcher/upc.exe']
  },
  {
    id: 'wine', name: 'Wine', category: 'Ferramentas', icon: 'wine',
    description: 'Execute instaladores e aplicativos do Windows no Linux. Use o Wine do sistema nos atalhos .exe.',
    website: 'https://www.winehq.org/', linuxUrl: 'https://www.winehq.org/download',
    linuxCommands: ['winecfg']
  },
  {
    id: 'goverlay', name: 'GOverlay', category: 'Ferramentas', icon: 'monitor',
    description: 'Configure o MangoHud para acompanhar FPS, temperatura e uso de CPU e GPU.',
    website: 'https://github.com/benjamimgois/goverlay', linuxUrl: 'https://flathub.org/apps/io.github.benjamimgois.goverlay',
    linuxCommands: ['goverlay'], flatpaks: ['io.github.benjamimgois.goverlay']
  },
  {
    id: 'protonup', name: 'ProtonUp-Qt', category: 'Ferramentas', icon: 'orbit',
    description: 'Gerencie versões do Proton e do Wine para seus jogos.',
    website: 'https://davidotek.github.io/protonup-qt/', linuxUrl: 'https://flathub.org/apps/net.davidotek.pupgui2',
    linuxCommands: ['protonup-qt'], flatpaks: ['net.davidotek.pupgui2']
  },
  {
    id: 'corectrl', name: 'CoreCtrl', category: 'Ferramentas', icon: 'gauge',
    description: 'Gerencie perfis de hardware em sistemas Linux compatíveis.',
    website: 'https://gitlab.com/corectrl/corectrl', linuxUrl: 'https://gitlab.com/corectrl/corectrl',
    linuxCommands: ['corectrl']
  },
  {
    id: 'openrgb', name: 'OpenRGB', category: 'Ferramentas', icon: 'rgb',
    description: 'Controle a iluminação dos seus dispositivos RGB.',
    website: 'https://openrgb.org/', windowsUrl: 'https://openrgb.org/releases.html',
    linuxUrl: 'https://flathub.org/apps/org.openrgb.OpenRGB',
    windowsPaths: ['OpenRGB/OpenRGB.exe'], linuxCommands: ['openrgb'], flatpaks: ['org.openrgb.OpenRGB']
  },
  {
    id: 'discord', name: 'Discord', category: 'Ferramentas',
    description: 'Converse por voz e texto com amigos e comunidades.',
    website: 'https://discord.com/', windowsUrl: 'https://discord.com/download',
    linuxUrl: 'https://flathub.org/apps/com.discordapp.Discord',
    linuxCommands: ['discord', 'Discord'], flatpaks: ['com.discordapp.Discord']
  },
  {
    id: 'obs', name: 'OBS Studio', category: 'Ferramentas',
    description: 'Grave partidas e transmita suas lives.',
    website: 'https://obsproject.com/', windowsUrl: 'https://obsproject.com/download',
    linuxUrl: 'https://flathub.org/apps/com.obsproject.Studio',
    windowsPaths: ['obs-studio/bin/64bit/obs64.exe'], linuxCommands: ['obs'], flatpaks: ['com.obsproject.Studio']
  },
  {
    id: 'msi-player', name: 'MSI App Player', category: 'Emuladores', icon: 'controller',
    description: 'Emulador Android para Windows. Importe os atalhos dos jogos na biblioteca de Android.',
    website: 'https://www.msi.com/Landing/appplayer', windowsUrl: 'https://www.msi.com/Landing/appplayer',
    systems: 'Android'
  },
  {
    id: 'retroarch', name: 'RetroArch', category: 'Emuladores', icon: 'retro',
    description: 'Central de emulação com núcleos para vários consoles.',
    website: 'https://retroarch.com/', systems: 'Vários consoles',
    windowsUrl: 'https://retroarch.com/platforms.html', linuxUrl: 'https://flathub.org/apps/org.libretro.RetroArch',
    windowsPaths: ['RetroArch/retroarch.exe'], linuxCommands: ['retroarch'], flatpaks: ['org.libretro.RetroArch']
  },
  {
    id: 'dolphin', name: 'Dolphin', category: 'Emuladores', icon: 'dolphin',
    description: 'Emulador de GameCube e Wii.', website: 'https://dolphin-emu.org/', systems: 'GameCube e Wii',
    windowsUrl: 'https://dolphin-emu.org/download/',
    linuxUrl: 'https://flathub.org/apps/org.DolphinEmu.dolphin-emu',
    linuxCommands: ['dolphin-emu'], flatpaks: ['org.DolphinEmu.dolphin-emu', 'org.DolphinEmu.dolphin']
  },
  {
    id: 'pcsx2', name: 'PCSX2', category: 'Emuladores', icon: 'pcsx',
    description: 'Emulador de PlayStation 2.', website: 'https://pcsx2.net/', systems: 'PlayStation 2',
    windowsUrl: 'https://pcsx2.net/downloads/', linuxUrl: 'https://flathub.org/apps/net.pcsx2.PCSX2',
    windowsPaths: ['PCSX2/pcsx2-qt.exe'], linuxCommands: ['pcsx2-qt', 'pcsx2'], flatpaks: ['net.pcsx2.PCSX2']
  },
  {
    id: 'ppsspp', name: 'PPSSPP', category: 'Emuladores', icon: 'psp',
    description: 'Emulador de PlayStation Portable.', website: 'https://www.ppsspp.org/', systems: 'PSP',
    windowsUrl: 'https://www.ppsspp.org/download/', linuxUrl: 'https://flathub.org/apps/org.ppsspp.PPSSPP',
    windowsPaths: ['PPSSPP/PPSSPPWindows64.exe'], linuxCommands: ['ppsspp', 'PPSSPPSDL'], flatpaks: ['org.ppsspp.PPSSPP']
  },
  {
    id: 'rpcs3', name: 'RPCS3', category: 'Emuladores', systems: 'PlayStation 3', icon: 'controller',
    description: 'Emulador de PlayStation 3.', website: 'https://rpcs3.net/download',
    windowsUrl: 'https://rpcs3.net/download', linuxUrl: 'https://rpcs3.net/download',
    windowsPaths: ['RPCS3/rpcs3.exe'], linuxCommands: ['rpcs3']
  },
  {
    id: 'shadps4', name: 'shadPS4', category: 'Emuladores', systems: 'PlayStation 4', icon: 'controller',
    description: 'Emulador de PlayStation 4. Vincule o executável do emulador para abrir arquivos de jogos.',
    website: 'https://shadps4.net/downloads/', windowsUrl: 'https://shadps4.net/downloads/', linuxUrl: 'https://shadps4.net/downloads/',
    windowsPaths: ['shadPS4/shadPS4.exe'], linuxCommands: ['shadPS4', 'shadps4']
  },
  {
    id: 'xemu', name: 'xemu', category: 'Emuladores', systems: 'Xbox', icon: 'controller',
    description: 'Emulador do Xbox original.', website: 'https://xemu.app/docs/download/',
    windowsUrl: 'https://xemu.app/docs/download/', linuxUrl: 'https://xemu.app/docs/download/',
    windowsPaths: ['xemu/xemu.exe'], linuxCommands: ['xemu'], flatpaks: ['app.xemu.xemu']
  },
  {
    id: 'xenia', name: 'Xenia', category: 'Emuladores', systems: 'Xbox 360', icon: 'controller',
    description: 'Emulador de Xbox 360 para Windows.', website: 'https://xenia.jp/download/',
    windowsUrl: 'https://xenia.jp/download/', windowsPaths: ['Xenia/xenia.exe', 'Xenia/xenia_canary.exe']
  }
];

const romFormats = {
  android: ['lnk'],
  dolphin: ['iso', 'gcm', 'rvz', 'wia', 'wbfs', 'ciso', 'gcz', 'wad', 'm3u'],
  pcsx2: ['iso', 'bin', 'cue', 'chd', 'cso', 'zso', 'gz', 'm3u'],
  ppsspp: ['iso', 'cso', 'chd', 'pbp', 'elf', 'prx'],
  rpcs3: ['bin', 'elf', 'self'], shadps4: ['bin', 'elf'], xemu: ['iso'], xenia: ['iso', 'xex'],
  retroarch: ['nes', 'sfc', 'smc', 'gb', 'gbc', 'gba', 'n64', 'z64', 'v64', 'nds', 'md', 'gen',
    'sms', 'gg', 'pce', 'a26', 'ngp', 'ws', 'cue', 'chd', 'iso', 'bin', 'm3u', 'zip', '7z']
};

function romArguments(game, { system, passthrough } = {}) {
  if (game.emulator === 'dolphin') {
    const args = ['-e', game.file];
    if (system !== 'gamecube' && !passthrough) args.push('-C', 'Main.BluetoothPassthrough.Enabled=False');
    return args;
  }
  const args = {
    pcsx2: ['-batch', '--', game.file],
    ppsspp: [game.file],
    rpcs3: [game.file], shadps4: [game.file], xemu: ['-dvd_path', game.file], xenia: [game.file],
    retroarch: ['-L', game.core, game.file]
  };
  return args[game.emulator];
}

module.exports = { stores, romFormats, romArguments };

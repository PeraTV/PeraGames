# PeraGames

[Read in English](README.en.md) · [Instaladores no GitHub](https://github.com/PeraTV/PeraGames/releases)

O PeraGames reúne jogos de PC, emuladores e atalhos de lojas em uma biblioteca. Use a interface de desktop ou o Modo TV com teclado, mouse ou controle.

![Tela inicial do PeraGames](docs/screenshots/home.jpg)

## Instalação e atualizações

Na página de versões, escolha o instalador do seu sistema. Depois da instalação, abra o ícone de download no cabeçalho do PeraGames para **Verificar atualizações do app**. O botão **Atualizar**, na Biblioteca, relê o catálogo de jogos.

| Sistema | Primeira instalação | Atualizações |
| --- | --- | --- |
| Windows x64 | Execute o instalador .exe da versão publicada. | O app baixa e abre o instalador da nova versão. |
| Linux x64 ou ARM64 | Com Flatpak instalado, abra o pacote .flatpak correspondente à arquitetura. O runtime vem do Flathub. | O app baixa o novo pacote e solicita ao Flatpak que o instale. |
| macOS Intel ou Apple Silicon | Abra o .dmg universal e arraste o PeraGames para Aplicativos. | A instalação pelo app fica disponível nas versões assinadas para distribuição. |

A interface segue o idioma do sistema. Em sistemas em português, o PeraGames abre em português. Nos demais, abre em inglês.

### Linux via terminal

O mesmo pacote funciona no BigGnome, no Manjaro e em outras distribuições com Flatpak. KDE Plasma e GNOME são ambientes gráficos. Para instalar o Flatpak, use o comando da distribuição em que seu ambiente roda.

| Distribuição | Se o comando `flatpak` estiver ausente |
| --- | --- |
| BigGnome ou Manjaro | `sudo pacman -S flatpak` |
| KDE neon, Kubuntu, Ubuntu ou Debian | `sudo apt update && sudo apt install flatpak` |
| Fedora, incluindo Fedora KDE Plasma | `sudo dnf install flatpak` |

Baixe o arquivo `.flatpak` da [versão mais recente](https://github.com/PeraTV/PeraGames/releases/latest) e execute:

```sh
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user ~/Downloads/PeraGames-Linux-x64.flatpak
flatpak run io.github.PeraTV.PeraGames
```

Use o pacote x64 se `uname -m` mostrar `x86_64`. Se mostrar `aarch64`, troque o nome do arquivo por `PeraGames-Linux-arm64.flatpak`. Ajuste `~/Downloads` se você salvou o arquivo em outra pasta. Em um ambiente com suporte a Flatpak configurado, também é possível abrir o arquivo pelo gerenciador de software. [Instruções por distribuição](https://flathub.org/pt/setup).

### Proton, Epic Games e GOG no Linux

- Instale o [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher#installation) no sistema Linux. Em **Biblioteca → Adicionar jogo**, selecione o `.exe` do jogo. Na ficha, abra **Compatibilidade com Proton** para escolher uma versão detectada, adicionar a pasta de um Proton próprio ou reutilizar um prefixo Wine. **GE-Proton mais recente (automático)** deixa o UMU obter a versão atual ao jogar. **Verificar GE-Proton** mostra a versão publicada.
- Em **Lojas → Epic Games/GOG → Biblioteca da loja**, conecte a conta pelo navegador e cole o código ou URL de retorno na janela do PeraGames. No Linux, a Epic usa o [Legendary](https://github.com/legendary-gl/legendary) e a GOG usa o [gogdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl). Instale os componentes no sistema e deixe os comandos `legendary`, `gogdl` e `umu-run` disponíveis no PATH. A biblioteca da loja oferece instalação e atualização dos jogos compatíveis. Os jogos instalados aparecem na Biblioteca do PeraGames com configuração individual de Proton.
- Para jogos da Steam, abra a ficha e clique em **Proton**. Feche a Steam pelo menu **Steam → Sair** antes de escolher a versão ou de importar uma pasta de Proton. A seleção vale para aquele jogo na próxima abertura da Steam.
- Em **Lojas**, o botão **Instalar no Linux** instala os aplicativos do Flathub pelo Flatpak do sistema. Quando o aplicativo usa outro distribuidor, o PeraGames abre a página de instalação e oferece **Copiar link**.

## Biblioteca e personalização

| | |
| --- | --- |
| **Biblioteca de PC**<br>![Biblioteca de PC](docs/screenshots/library.jpg) | **Lojas e ferramentas**<br>![Lojas e ferramentas](docs/screenshots/stores.jpg) |
| **Central de emulação**<br>![Central de emulação](docs/screenshots/emulators.jpg) | **Sinopse e favoritos**<br>![Ficha de jogo](docs/screenshots/game-details.jpg) |
| **Destaque personalizado**<br>![Personalização do destaque](docs/screenshots/spotlight.jpg) | **Paletas de cores**<br>![Paletas de cores](docs/screenshots/palettes.jpg) |

Na Biblioteca, use **Adicionar jogo** para cadastrar um executável ou atalho. A importação de ROMs e o acesso aos sistemas ficam em **Emuladores**. A disponibilidade de lojas e emuladores depende do sistema operacional.

## Modo TV

Escolha **Cinema Âmbar**, **Painel Âmbar** ou **Galeria Âmbar** em **Aparência**. Use **A/Enter** para selecionar, **B/Esc** para voltar e **Y** para abrir a ficha do jogo e acessar os favoritos. No controle, **LB/RB** alternam entre as páginas.

![Seletor de aparência do Modo TV](docs/screenshots/tv-appearance.jpg)

### Cinema Âmbar

![Cinema Âmbar](docs/screenshots/tv-cinema.jpg)

### Painel Âmbar

![Painel Âmbar](docs/screenshots/tv-panel.jpg)

### Galeria Âmbar

![Galeria Âmbar](docs/screenshots/tv-gallery.jpg)

## Desenvolvimento

Execute `npm install`, `npm test` e `npm start` na pasta do projeto. Os dados da biblioteca e os favoritos ficam no perfil local do PeraGames.

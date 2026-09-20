# Userscripts

Small browser add-ons that make the Plex web app more useful: quick links to film databases, one-click playback in your own video player, awards shown on each film's page, release NFOs shown right in Plex, a random-pick wheel and a custom look.

> ⚠️ These scripts are experimental and vibe-coded: use them at your own risk!

## Installation

1. Install the [Violentmonkey](https://violentmonkey.github.io/) browser extension.
2. Click **Install** next to the script you want, then confirm.

Scripts update automatically once installed.

| Script | Description | |
|---|---|---|
| **Plex Sidekick 🔗▶️** | Links to 20+ film sites (TMDB, IMDb, Letterboxd…) and one-click playback in IINA, Infuse, mpv, VLC or PotPlayer | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-sidekick.user.js) |
| **Plex Pyro Custom UI 🔥** | A custom look for the Plex web interface | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-pyro-custom-ui.user.js) |
| **Plex Awards 🏆** | Shows a film's awards directly in Plex | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-awards.user.js) |
| **Plex NFO Viewer 📄** | Shows the `.nfo` of a film, series, season or episode in Plex, like Jellyfin does. Needs a small companion server, see below | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js) |
| **Plex Wheel 🎡** | Spins a wheel to pick a random title from any library, collection or watchlist (filters included) | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-wheel.user.js) |

## Plex NFO Viewer 📄

Plex Web can't read files sitting next to your videos, so this script comes with a small companion server, [`plex-nfo-server.py`](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-server.py). It runs on the machine that runs Plex, needs only Python 3 and nothing else to install.

### Setup

1. Download `plex-nfo-server.py` to the Plex machine and start it:
   ```bash
   python3 plex-nfo-server.py
   ```
   It listens on port `8764` and finds your Plex token by itself on macOS. On other systems, start it with `PLEX_TOKEN=your-token python3 plex-nfo-server.py`.
2. Install the userscript.
3. Open a film, series, season or episode: an **NFO** button appears next to Plex's **⋯** button.

| Button | Meaning |
|---|---|
| 🟢 **NFO** | An NFO was found: click it or press **N** |
| **NFO** (plain) | No matching NFO for this item |
| 🔴 **NFO ⚠** | The server can't be reached: click it for details and settings |

### Which NFO goes where

Matching is strict and uses Plex's own season and episode numbers:

| Page | NFOs shown |
|---|---|
| **Film** | `<video name>.nfo` and `movie.nfo`, or any NFO if the film is alone in its folder |
| **Episode** | `<video name>.nfo`, or an NFO in the same folder tagged with the same `S01E02` / `1x02` |
| **Season** | `season.nfo`, or an NFO named for that season (`S01`, `Season 1`, `Saison 1`) in the season folder or in a season-pack folder above the episodes |
| **Series** | `tvshow.nfo`, plus each season's NFO in its own tab |

Scene NFOs (CP437 box art) and Kodi XML NFOs are both supported. If a film or episode has several versions (1080p, 2160p…), each version's NFO gets its own tab.

### Away from home

At home the server is found automatically from your Plex connection. Away from home it isn't reachable through Plex's public address, and it shouldn't be opened to the internet. Use [Tailscale](https://tailscale.com/) instead:

1. Run Tailscale on both the Plex machine and your computer.
2. In the NFO window, click **⚙ Server** and enter `http://<Plex machine's Tailscale IP>:8764`. You can get that IP with `tailscale ip -4`.

The address is saved in your browser only. The script contains no IP, hostname or other personal settings.

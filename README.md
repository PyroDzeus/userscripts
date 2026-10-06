# Userscripts

Small browser add-ons that make the Plex web app more useful: quick links to film databases, one-click playback in your own video player, awards shown on each film's page, release NFOs read and generated right in Plex, a random-pick wheel and a custom look.

> ⚠️ These scripts are experimental and vibe-coded: use them at your own risk!

## Installation

1. Install the [Violentmonkey](https://violentmonkey.github.io/) browser extension.
2. Click **Install** next to the script you want, then confirm.

Scripts update automatically once installed.

| Script | Description | |
|---|---|---|
| **Plex Sidekick 🔗▶️** | Links to 20+ film sites (TMDB, IMDb, Letterboxd…) and one-click playback in IINA, Infuse, mpv, VLC or PotPlayer. With IINA, an on/off switch lets Plex record what you watch ([see below](#iina-plex-sync-)) | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-sidekick.user.js) |
| **Plex Pyro Custom UI 🔥** | A custom look for the Plex web interface | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-pyro-custom-ui.user.js) |
| **Plex Awards 🏆** | Shows a film's awards directly in Plex | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-awards.user.js) |
| **Plex NFO Viewer 📄** | Reads the `.nfo` of a film, series, season or episode in Plex, like Jellyfin does, and generates one from mediainfo with your own ASCII-art header. Needs a small companion server: [setup guide](plex-nfo-viewer.md) | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js) |
| **Plex Wheel 🎡** | Spins a wheel to pick a random title from any library, collection or watchlist (filters included) | [Install](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-wheel.user.js) |

## IINA Plex Sync 👁️

A plugin for [IINA](https://iina.io) (macOS) that goes with Plex Sidekick. When you open something in IINA from Plex, Plex keeps track of it as if you'd watched it in Plex: progress, resume point, "Continue Watching", and marked as watched at the end.

The eye on Sidekick's IINA button turns it on or off:
- **Orange eye:** Plex records what IINA plays.
- **Crossed-out eye:** IINA plays without telling Plex anything (handy to test a file).

Other files you open in IINA are never sent to Plex.

**Install:** [download `iina-plex-sync.iinaplgz`](https://github.com/PyroDzeus/userscripts/raw/main/iina-plex-sync.iinaplgz), double-click it, and allow it in IINA. Options (resume, on-screen messages, "watched" threshold) are in IINA › Settings › Plugins › Plex Sync.

## License

[MIT](LICENSE): free to use, modify and share.

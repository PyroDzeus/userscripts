# Plex NFO Viewer 📄

Shows the `.nfo` of a film, series, season or episode directly in Plex Web, like Jellyfin does, and **builds one from mediainfo**, with your own ASCII-art header, when there is none. A generated NFO is only a preview: nothing is written to disk unless you click **Create** and confirm.

> ⚠️ Experimental and vibe-coded: use at your own risk!

Plex Web can't read files sitting next to your videos, so the script works with a small companion server, [`plex-nfo-server.py`](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-server.py). It runs on the machine that runs Plex and needs Python 3, plus [MediaInfo](https://mediaarea.net/en/MediaInfo) for generating NFOs (`brew install media-info` on macOS, `apt install mediainfo` on Debian/Ubuntu).

## Setup

1. Download `plex-nfo-server.py` to the Plex machine and start it:
   ```bash
   python3 plex-nfo-server.py
   ```
   It listens on port `8764` and finds your Plex token by itself on macOS. On other systems, start it with `PLEX_TOKEN=your-token python3 plex-nfo-server.py`.
2. [Install the userscript](https://raw.githubusercontent.com/PyroDzeus/userscripts/main/plex-nfo-viewer.user.js) with [Violentmonkey](https://violentmonkey.github.io/).
3. Open a film, series, season or episode: an **NFO** button appears next to Plex's **⋯** button.

| Button | Meaning |
|---|---|
| 🟢 **NFO** | An NFO was found: click it or press **N** |
| 🟡 **NFO** | No NFO yet: click it to see one generated from mediainfo (nothing is written) |
| **NFO** (plain) | Nothing to show or generate (e.g. a season with no NFO) |
| 🔴 **NFO ⚠** | The server can't be reached: click it for details and settings |

## Generating an NFO

For films and episodes, the **✨ Generate** tab shows a classic 81-column release NFO. The server runs `mediainfo` on the video file and the script lays out the result: size, source (WEB-DL, Blu-ray, Remux… and the streaming service), video (codec, bitrate, resolution, HDR10 / HDR10+ / Dolby Vision profile), every audio track (language, VFF/VFQ, audio description, Atmos, DTS-HD MA…), every subtitle (forced, SDH, line count), and TMDB / TVDB / IMDb links from Plex.

When an NFO already exists, the ✨ tab is still there: mediainfo only runs if you open it.

- **⬇ Download .nfo** saves it to your computer.
- **💾 Create the local .nfo file…** writes `<video name>.nfo` beside the video, **only after you confirm**, and asks again before replacing an existing NFO. Plex checks your token first: only someone who can see the item in Plex can create its NFO.

### Make it yours

In **⚙ Settings → NFO generator**:

| Setting | What it does |
|---|---|
| **ASCII text** | The big header. `{group}` = release group, `{title}` = film or show title, or any text |
| **Font** | 25 [FIGlet](https://patorjk.com/software/taag/) fonts (ANSI Regular, ANSI Shadow, DOS Rebel, Bloody…), or any `.flf` URL. Downloaded once, then cached |
| **Letter spacing** | *Spaced* (as the font draws it) or *Packed* (like `figlet -k`) |
| **Line under it / Greetz / Footer** | The "Presents" line, an optional GREETZ section and the closing banner |
| **Scene-style labels** | `RESOLUTiON`, `AUDiO`… or plain labels |

A live preview shows the header as you type. If the text is too wide for 81 columns it is split over several lines, and if a font can't be downloaded the header falls back to plain text.

## Which NFO goes where

Matching is strict and uses Plex's own season and episode numbers:

| Page | NFOs shown |
|---|---|
| **Film** | `<video name>.nfo` and `movie.nfo`, or any NFO if the film is alone in its folder |
| **Episode** | `<video name>.nfo`, or an NFO in the same folder tagged with the same `S01E02` / `1x02` |
| **Season** | `season.nfo`, or an NFO named for that season (`S01`, `Season 1`, `Saison 1`) in the season folder or in a season-pack folder above the episodes |
| **Series** | `tvshow.nfo`, plus each season's NFO in its own tab |

Scene NFOs (CP437 box art) and Kodi XML NFOs are both supported. If a film or episode has several versions (1080p, 2160p…), each version's NFO gets its own tab.

## Away from home

At home the server is found automatically from your Plex connection. Away from home it isn't reachable through Plex's public address, and it shouldn't be opened to the internet. Use [Tailscale](https://tailscale.com/) instead:

1. Run Tailscale on both the Plex machine and your computer.
2. In the NFO window, click **⚙ Server** and enter `http://<Plex machine's Tailscale IP>:8764`. You can get that IP with `tailscale ip -4`.

The address is saved in your browser only. The script contains no IP, hostname or other personal settings.

[← Back to all scripts](README.md)

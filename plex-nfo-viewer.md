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

For films and episodes, the **✨ Generate** tab shows a release NFO in the layout of your choice. The server runs `mediainfo` on the video file and the script lays out the result: size, source (WEB-DL, Blu-ray, Remux… and the streaming service), video (codec, bitrate, resolution, HDR10 / HDR10+ / Dolby Vision profile), every audio track (language, VFF/VFQ, audio description, Atmos, DTS-HD MA…), every subtitle (forced, SDH, line count), and TMDB / TVDB / IMDb links from Plex.

When an NFO already exists (made by hand or earlier), the tab becomes **✨ Regenerate**: mediainfo only runs if you open it, and **♻ Replace the local .nfo…** overwrites the file only after you confirm. **↻ Re-run mediainfo** reads the video again if it changed.

- **⬇ Download .nfo** saves it to your computer.
- **💾 Create the local .nfo file…** writes `<video name>.nfo` beside the video, **only after you confirm**, and asks again before replacing an existing NFO. Plex checks your token first: only someone who can see the item in Plex can create its NFO.

### Make it yours

In **⚙ Settings → NFO generator**:

| Setting | What it does |
|---|---|
| **Layout** | `1 - Minimalistic` (plain list), `2 - Clean rules` (titles between ═══ rules), `3 - Hash box` (framed with #), `4 - Shaded box` (block frame, fields side by side). Also switchable right above the preview |
| **ASCII text** | The big header: `{title}` = film or show title, `{group}` = release group from the file name, or any text. Leave empty for no header |
| **Font** | 25 [FIGlet](https://patorjk.com/software/taag/) fonts (ANSI Regular, ANSI Shadow, DOS Rebel, Bloody…), or any `.flf` URL. Downloaded once, then cached |
| **Letter spacing** | *Spaced* (as the font draws it) or *Packed* (like `figlet -k`) |
| **Line under it**, **Notes / greetz**, **Footer** | Optional, empty by default |
| **Scene-style labels** | `RESOLUTiON`, `AUDiO`… instead of plain labels |

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

At home the server is found automatically from your Plex connection: leave the address field empty. Away from home, Plex is reached through the internet, but the NFO server isn't (and shouldn't be opened to it). Use [Tailscale](https://tailscale.com/download) instead:

1. Install Tailscale on the Plex machine and on your computer, signed in with the same account.
2. Find the Plex machine's Tailscale address, which starts with `100.`: click the Tailscale icon in its menu bar → *This device*, or run `tailscale ip -4` on it.
3. In the NFO window, click **⚙ Settings**, type that address (just `100.x.y.z` is enough, it becomes `http://100.x.y.z:8764`), click **Test**, then **Save & retry**.

The address is saved in your browser only. The script contains no IP, hostname or other personal settings.

## Troubleshooting

When the button is red (**NFO ⚠**), click it: the settings and a **❓ Setup help** panel open by themselves, with copyable commands and what the script tried.

| Symptom | Fix |
|---|---|
| *NFO server not reachable (tried http://127.0.0.1:8764)* while Plex runs on this computer | The server isn't running: start `python3 plex-nfo-server.py` and keep the window open |
| Works on the Plex machine, not from another computer at home | The Plex machine's firewall blocks it: allow incoming connections for Python (macOS: System Settings › Network › Firewall › Options) |
| Works at home, not away | Set the Tailscale address (see above) |
| Check the server itself | On the Plex machine: `curl http://127.0.0.1:8764/ping` must answer `{"ok": true, …}` |
| Button stays plain on films / episodes without NFO | MediaInfo is missing on the Plex machine: `brew install media-info` (macOS) or `sudo apt install mediainfo` (Linux), then restart the server |

[← Back to all scripts](README.md)

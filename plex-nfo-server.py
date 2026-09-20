#!/usr/bin/env python3
"""
plex-nfo-server — serves the .nfo files that belong to a Plex item, for the
"Plex NFO Viewer" userscript.

Plex Web can't read sidecar files, so this tiny stdlib-only server does it:

    GET  /nfo/<ratingKey>  -> {"title", "type", "files": [{"name", "label", "kind", "text"}]}
    GET  /info/<ratingKey> -> mediainfo of the film/episode's file(s) + Plex details, used by the
                           userscript to BUILD an NFO in the browser (nothing is written)
    POST /nfo/<ratingKey>  {"file": "<video file name>", "text": "...", "overwrite": false}
                           -> writes <video name>.nfo next to that video (film/episode only).
                           Needs the caller's X-Plex-Token: Plex itself must grant it access
                           to the item, so only people who can see it in Plex can write.
    GET  /ping             -> {"ok": true, "write": true}

Matching is strict, based on Plex's own season/episode numbers:
  movie    <video>.nfo, movie.nfo; any other .nfo only if the folder holds a
           single video and the name doesn't look like an episode
  episode  <video>.nfo, or an .nfo in the same folder whose name carries the
           same SxxEyy (or 1x01) — never another episode's, never a season's
  season   season.nfo in a folder holding only that season, or an .nfo named
           for that season (S01, Season 1, Saison 1) without any episode tag
  show     tvshow.nfo in the show folder + every season's NFO (one tab each)

It never takes a path from the browser: paths only come from Plex itself.

Run on the Plex machine:   python3 plex-nfo-server.py
Env overrides:
  PLEX_TOKEN     Plex token (default: read from PMS preferences on macOS)
  PLEX_URL       default http://127.0.0.1:32400
  NFO_HOST       default 0.0.0.0   (LAN + Tailscale)
  NFO_PORT       default 8764
  NFO_PATH_MAP   "plex/prefix=>local/prefix;..." if Plex sees files under
                 another path than this machine
  MEDIAINFO      path to the mediainfo CLI (default: found automatically;
                 macOS: brew install media-info)

Nothing is ever written unless the userscript's "Save" button is clicked.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PLEX_URL = os.environ.get("PLEX_URL", "http://127.0.0.1:32400").rstrip("/")
HOST = os.environ.get("NFO_HOST", "0.0.0.0")
PORT = int(os.environ.get("NFO_PORT", "8764"))
MAX_BYTES = 256 * 1024
VIDEO_EXT = {".mkv", ".mp4", ".m4v", ".avi", ".mov", ".ts", ".m2ts", ".wmv", ".webm"}
PATH_MAP = [
    tuple(p.split("=>", 1))
    for p in os.environ.get("NFO_PATH_MAP", "").split(";")
    if "=>" in p
]


def log(msg):
    print(msg, flush=True)


def plex_token() -> str:
    tok = os.environ.get("PLEX_TOKEN", "").strip()
    if tok:
        return tok
    try:  # macOS PMS keeps it in its preferences
        out = subprocess.run(
            ["defaults", "read", "com.plexapp.plexmediaserver", "PlexOnlineToken"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    sys.exit("No Plex token found — set PLEX_TOKEN=...")


TOKEN = plex_token()


# ------------------------------------------------------------------ Plex


def plex_get(path: str, token: str = None) -> ET.Element:
    req = urllib.request.Request(
        f"{PLEX_URL}{path}",
        headers={"X-Plex-Token": token or TOKEN, "Accept": "application/xml"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return ET.fromstring(r.read())


def first_item(root):
    return root[0] if len(root) else None


def parts_of(el):
    return [p.get("file") for p in el.iter("Part") if p.get("file")]


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def locations(el):
    return [Path(remap(l.get("path"))) for l in el.iter("Location") if l.get("path")]


def remap(path: str) -> str:
    for src, dst in PATH_MAP:
        if path.startswith(src):
            return dst + path[len(src):]
    return path


# ------------------------------------------------------------------ names

EP_RE = re.compile(r"(?i)(?<![a-z0-9])s(\d{1,3})((?:[ ._-]?e\d{1,4})+)(?!\d)")
EP_X_RE = re.compile(r"(?<![0-9a-z])(\d{1,2})x(\d{2,3})(?!\d)", re.I)
SEASON_RE = re.compile(r"(?i)(?<![a-z0-9])s(\d{1,3})(?![ ._-]?e\d)(?!\d)")
SEASON_WORD_RE = re.compile(r"(?i)(?<![a-z])(?:season|saison|staffel|temporada)[ ._-]?(\d{1,3})(?!\d)")


def episode_tags(name: str) -> set:
    """{(season, episode), ...} found in a file name (handles S01E01E02, 1x01)."""
    tags = set()
    for m in EP_RE.finditer(name):
        s = int(m.group(1))
        for e in re.findall(r"\d+", m.group(2)):
            tags.add((s, int(e)))
    for m in EP_X_RE.finditer(name):
        tags.add((int(m.group(1)), int(m.group(2))))
    return tags


def season_tags(name: str) -> set:
    """Season numbers named in a file name that carries NO episode tag."""
    if episode_tags(name):
        return set()
    return {int(x) for x in SEASON_RE.findall(name)} | {int(x) for x in SEASON_WORD_RE.findall(name)}


# ------------------------------------------------------------------ files


def decode(raw: bytes) -> str:
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp437")  # classic scene NFO encoding
    return text.replace("\r\n", "\n").replace("\r", "\n")


class Scan:
    """Per-request folder cache + result collector."""

    def __init__(self):
        self.dirs = {}
        self.out = []
        self.seen = set()

    def listing(self, folder: Path):
        if folder not in self.dirs:
            try:
                entries = [p for p in folder.iterdir() if p.is_file()]
            except OSError as e:
                log(f"  cannot list {folder}: {e}")
                entries = []
            self.dirs[folder] = (
                [p for p in entries if p.suffix.lower() == ".nfo"],
                [p for p in entries if p.suffix.lower() in VIDEO_EXT],
            )
        return self.dirs[folder]

    def add(self, path: Path, label=None, order=0):
        if path in self.seen:
            return
        self.seen.add(path)
        with open(path, "rb") as fh:
            text = decode(fh.read(MAX_BYTES))
        kind = "kodi" if text.lstrip().startswith("<") else "release"
        self.out.append({"name": path.name, "label": label or path.name,
                         "kind": kind, "text": text, "_order": order})

    def result(self):
        # Keep caller order (season by season), release NFOs before Kodi XML.
        self.out.sort(key=lambda f: (f["_order"], f["kind"] != "release"))
        for f in self.out:
            f.pop("_order")
        return self.out


def match_movie(scan: Scan, files):
    for vf in files:
        video = Path(remap(vf))
        nfos, videos = scan.listing(video.parent)
        for n in nfos:
            if n.stem == video.stem or n.name.lower() == "movie.nfo":
                scan.add(n)
        if len(videos) == 1:  # single-film folder: any non-episode NFO is its release NFO
            for n in nfos:
                if not episode_tags(n.name):
                    scan.add(n)


def match_episode(scan: Scan, files, s, e):
    for vf in files:
        video = Path(remap(vf))
        nfos, _ = scan.listing(video.parent)
        for n in nfos:
            if n.stem == video.stem:
                scan.add(n)
            elif s is not None and e is not None and (s, e) in episode_tags(n.name):
                scan.add(n)


def match_season(scan: Scan, s, season_folders, folder_seasons, show_roots, order=0):
    label_prefix = f"S{s:02d} · " if order else ""
    found = len(scan.out)
    for folder in season_folders:
        nfos, _ = scan.listing(folder)
        log(f"  S{s:02d} folder {folder}: {[n.name for n in nfos] or 'no .nfo'}")
        for n in nfos:
            only_this_season = folder_seasons.get(folder) == {s}
            if n.name.lower() == "season.nfo" and only_this_season:
                scan.add(n, label_prefix + n.name, order)
            elif s in season_tags(n.name):
                scan.add(n, label_prefix + n.name, order)
    # Season-pack NFOs often sit ABOVE the episode folders:
    #   Show (2026)/Show.S01.1080p-GRP/Show.S01.1080p-GRP.nfo
    #   Show (2026)/Show.S01.1080p-GRP/Show.S01E01.1080p-GRP/Show.S01E01….mkv
    # so every folder between an episode's folder and the show folder (inclusive)
    # is searched — only for NFOs explicitly named for this season.
    for folder in parent_folders(season_folders, show_roots):
        nfos, _ = scan.listing(folder)
        if nfos:
            log(f"  S{s:02d} parent {folder}: {[n.name for n in nfos]}")
        for n in nfos:
            if s in season_tags(n.name):
                scan.add(n, label_prefix + n.name, order)
    if len(scan.out) > found:
        return
    # Fallback: a folder holding ONLY this season's episodes -> any NFO there that
    # names no episode and no other season is this season's NFO.
    for folder in season_folders:
        if folder_seasons.get(folder) != {s} or folder in show_roots:
            continue
        nfos, _ = scan.listing(folder)
        for n in nfos:
            if n.name.lower() in ("tvshow.nfo", "movie.nfo") or episode_tags(n.name):
                continue
            if season_tags(n.name) - {s}:
                continue
            scan.add(n, label_prefix + n.name, order)


def parent_folders(folders, show_roots):
    """Folders above the given ones, up to and including the show folder.
    Without a known show folder, only the direct parent is used (never the library root)."""
    roots = set(show_roots)
    out = []
    for f in folders:
        cur = f.parent
        for depth in range(4):
            inside = any(cur == r or r in cur.parents for r in roots) if roots else depth == 0
            if not inside:
                break
            if cur not in out and cur not in folders:
                out.append(cur)
            if cur in roots:
                break
            cur = cur.parent
    for r in show_roots:
        if r not in out and r not in folders:
            out.append(r)
    return out


def episodes_by_folder(episodes, default_season=None):
    """folder -> {season numbers of the episodes Plex has in it}"""
    fs = {}
    for ep in episodes:
        s = to_int(ep.get("parentIndex"))
        if s is None:
            s = default_season
        for f in parts_of(ep):
            fs.setdefault(Path(remap(f)).parent, set()).add(s)
    return fs


def show_roots_for(show_key):
    if not show_key:
        return []
    try:
        show = first_item(plex_get(show_key if show_key.startswith("/") else f"/library/metadata/{show_key}"))
        return locations(show) if show is not None else []
    except Exception:
        return []


def find_nfos(key: str):
    item = first_item(plex_get(f"/library/metadata/{key}"))
    if item is None:
        return None, None, []
    typ, title = item.get("type"), item.get("title")
    scan = Scan()

    if typ == "movie":
        match_movie(scan, parts_of(item))

    elif typ == "episode":
        match_episode(scan, parts_of(item), to_int(item.get("parentIndex")), to_int(item.get("index")))

    elif typ == "season":
        s = to_int(item.get("index"))
        eps = list(plex_get(f"/library/metadata/{key}/children").iter("Video"))
        fs = episodes_by_folder(eps, default_season=s)
        if s is not None:
            match_season(scan, s, list(fs), fs, show_roots_for(item.get("parentKey")))

    elif typ == "show":
        roots = locations(item)
        for r in roots:
            nfos, _ = scan.listing(r)
            for n in nfos:
                if n.name.lower() == "tvshow.nfo":
                    scan.add(n, "tvshow.nfo", 0)
        eps = list(plex_get(f"/library/metadata/{key}/allLeaves").iter("Video"))
        fs = episodes_by_folder(eps)
        if any(None in v for v in fs.values()):  # listing lacks season numbers: ask each season
            fs = {}
            for season in plex_get(f"/library/metadata/{key}/children").iter("Directory"):
                sn, sk = to_int(season.get("index")), season.get("ratingKey")
                if sn is None or not sk:
                    continue
                for f, v in episodes_by_folder(plex_get(f"/library/metadata/{sk}/children").iter("Video"), sn).items():
                    fs.setdefault(f, set()).update(v)
        for s in sorted({x for v in fs.values() for x in v if x is not None}):
            folders = [f for f, ss in fs.items() if s in ss]
            match_season(scan, s, folders, fs, roots, order=s + 1)

    return title, typ, scan.result()


# ------------------------------------------------------------------ HTTP


MAX_WRITE = 128 * 1024


# ------------------------------------------------------------------ mediainfo (for generated NFOs)


def mediainfo_bin():
    for c in (os.environ.get("MEDIAINFO"), shutil.which("mediainfo"),
              "/opt/homebrew/bin/mediainfo", "/usr/local/bin/mediainfo", "/usr/bin/mediainfo"):
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def num(v, cast=float):
    try:
        return cast(str(v).split(" / ")[0])
    except (TypeError, ValueError):
        return None


def yes(v):
    return str(v).strip().lower() in ("yes", "1", "true")


def video_codec(t):
    fmt = t.get("Format", "")
    prof = (t.get("Format_Profile") or "").split("@")[0]
    name = {"MPEG Video": "MPEG-2"}.get(fmt, fmt)
    return f"{name} {prof}".strip()


def hdr_format(t):
    """'Dolby Vision Profile 8.1 (HDR10 compatible) / HDR10+' — built from mediainfo's HDR_* fields."""
    fmts = [x.strip() for x in (t.get("HDR_Format") or "").split(" / ")]
    profs = [x.strip() for x in (t.get("HDR_Format_Profile") or "").split(" / ")]
    compats = [x.strip() for x in (t.get("HDR_Format_Compatibility") or "").split(" / ")]
    out = []
    for i, f in enumerate(fmts):
        if not f:
            continue
        prof = profs[i] if i < len(profs) else ""
        compat = compats[i] if i < len(compats) else ""
        if f.startswith("Dolby Vision"):
            m = re.search(r"\.(\d+)", prof)
            p = str(int(m.group(1))) if m else "?"
            sub = {"HDR10": ".1", "SDR": ".2", "HLG": ".4", "Blu-ray": ".6"}.get(compat.split(" ")[0], "")
            if sub and p in ("7", "8"):
                p += sub
            out.append(f"Dolby Vision Profile {p}" + (f" ({compat} compatible)" if compat else ""))
        elif "2094" in f:
            out.append("HDR10+")
        elif "2086" in f:
            out.append("HDR10")
        else:
            out.append(f)
    trc = t.get("transfer_characteristics", "")
    if not any(x in ("HDR10", "HDR10+") or "HDR10 compatible" in x for x in out):
        if trc == "PQ":
            out.append("HDR10")
        elif trc == "HLG":
            out.append("HLG")
    return " / ".join(dict.fromkeys(out)) or "SDR"


def audio_codec(t):
    fmt, com = t.get("Format", ""), t.get("Format_Commercial_IfAny", "") or ""
    feat = t.get("Format_AdditionalFeatures", "") or ""
    atmos = "Atmos" in com or "JOC" in feat or "16-ch" in feat
    if fmt == "E-AC-3":
        return "E-AC-3 JOC" if atmos else "E-AC-3"
    if fmt in ("MLP FAT", "TrueHD") or "TrueHD" in com:
        return "TrueHD Atmos" if atmos else "TrueHD"
    if fmt == "DTS":
        if "XLL X" in feat or "DTS:X" in com:
            return "DTS:X"
        if "XLL" in feat or "Master Audio" in com:
            return "DTS-HD MA"
        if "XBR" in feat or "High Resolution" in com:
            return "DTS-HD HRA"
        return "DTS"
    if fmt == "PCM":
        return "LPCM"
    return fmt


def channels(t):
    n = num(t.get("Channels"), int)
    return {1: "1.0", 2: "2.0", 3: "2.1", 6: "5.1", 7: "6.1", 8: "7.1"}.get(n, f"{n}ch" if n else "")


def sub_format(t):
    f = t.get("Format", "")
    return {"UTF-8": "SRT", "ASCII": "SRT", "PGS": "PGS", "VobSub": "VobSub", "ASS": "ASS", "SSA": "SSA",
            "Timed Text": "TX3G", "WebVTT": "WebVTT"}.get(f, f)


_mi_cache = {}


def mediainfo(path: Path, fresh=False):
    """Normalised mediainfo of one file (cached per path + size + mtime)."""
    st = path.stat()
    ck = (str(path), st.st_size, st.st_mtime)
    if ck in _mi_cache and not fresh:
        return _mi_cache[ck]
    exe = mediainfo_bin()
    if not exe:
        raise RuntimeError("mediainfo isn't installed on the Plex machine (macOS: brew install media-info)")
    out = subprocess.run([exe, "--Output=JSON", str(path)], capture_output=True, text=True, timeout=120)
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError(f"mediainfo failed on {path.name}")
    tracks = json.loads(out.stdout).get("media", {}).get("track", [])
    by = lambda kind: [t for t in tracks if t.get("@type") == kind]
    g = (by("General") or [{}])[0]
    v = (by("Video") or [{}])[0]
    info = {
        "file": path.name,
        "release": path.stem,
        "size": num(g.get("FileSize"), int) or st.st_size,
        "duration": num(g.get("Duration")),
        "container": g.get("Format"),
        "video": {
            "codec": video_codec(v) if v else None,
            "bitrate": num(v.get("BitRate")) or num(v.get("BitRate_Nominal")),
            "width": num(v.get("Width"), int), "height": num(v.get("Height"), int),
            "aspect": num(v.get("DisplayAspectRatio")),
            "fps": num(v.get("FrameRate")),
            "bitDepth": num(v.get("BitDepth"), int),
            "primaries": v.get("colour_primaries"),
            "hdr": hdr_format(v) if v else None,
            "encoder": (v.get("Encoded_Library_Name") or "") or None,
        },
        "audio": [{
            "codec": audio_codec(t), "channels": channels(t), "bitrate": num(t.get("BitRate")),
            "lang": t.get("Language"), "title": t.get("Title"),
            "default": yes(t.get("Default")), "forced": yes(t.get("Forced")),
            "ad": t.get("ServiceKind") == "VI",
        } for t in by("Audio")],
        "subs": [{
            "format": sub_format(t), "lang": t.get("Language"), "title": t.get("Title"),
            "forced": yes(t.get("Forced")), "default": yes(t.get("Default")),
            "lines": num(t.get("ElementCount"), int),
        } for t in by("Text")],
    }
    _mi_cache[ck] = info
    return info


def guid_links(el, kind):
    ids = [g.get("id", "") for g in el.iter("Guid")] if el is not None else []
    out = []
    for i in ids:
        if i.startswith("tmdb://"):
            out.append(["TMDB", f"https://www.themoviedb.org/{'tv' if kind == 'show' else 'movie'}/{i[7:]}"])
        elif i.startswith("tvdb://"):
            out.append(["TVDB", f"https://www.thetvdb.com/dereferrer/{'series' if kind == 'show' else 'movie'}/{i[7:]}"])
        elif i.startswith("imdb://"):
            out.append(["IMDB", f"https://www.imdb.com/title/{i[7:]}"])
    return out


def item_info(key: str, fresh=False):
    """Everything the userscript needs to build an NFO for a film or an episode."""
    item = first_item(plex_get(f"/library/metadata/{key}"))
    if item is None:
        return 404, {"error": "not found"}
    typ = item.get("type")
    if typ not in ("movie", "episode"):
        return 400, {"error": "NFOs are generated for films and episodes", "type": typ}
    out = {"type": typ, "title": item.get("title"), "year": to_int(item.get("year")),
           "airDate": item.get("originallyAvailableAt"), "links": []}
    if typ == "episode":
        out.update(show=item.get("grandparentTitle"), season=to_int(item.get("parentIndex")),
                   episode=to_int(item.get("index")))
        show = None
        if item.get("grandparentKey"):
            try:
                show = first_item(plex_get(item.get("grandparentKey")))
            except Exception:
                pass
        out["links"] = guid_links(show, "show")
        ep_imdb = [l for l in guid_links(item, "episode") if l[0] == "IMDB"]
        out["links"] += [["IMDB EPISODE", l[1]] for l in ep_imdb]
    else:
        out["links"] = guid_links(item, "movie")
    versions, errors = [], []
    for media in item.iter("Media"):
        res = media.get("videoResolution") or ""
        for part in media.iter("Part"):
            if not part.get("file"):
                continue
            path = Path(remap(part.get("file")))
            try:
                info = dict(mediainfo(path, fresh))
                info["label"] = f"{res}p" if res.isdigit() else res.upper()
                versions.append(info)
            except Exception as e:
                errors.append(f"{path.name}: {e}")
    if not versions:
        return 422, {"error": "; ".join(errors) or "Plex has no file for this item"}
    out["versions"] = versions
    log(f"{key} [{typ}] info: {[v['file'] for v in versions]}")
    return 200, out


def write_nfo(key: str, caller_token: str, body: dict):
    """Write <video>.nfo next to one of the item's videos. Returns (status, payload)."""
    if not caller_token:
        return 401, {"error": "missing X-Plex-Token"}
    text, fname = body.get("text"), body.get("file")
    if not isinstance(text, str) or not text.strip() or not isinstance(fname, str):
        return 400, {"error": "expected {file, text}"}
    if len(text.encode("utf-8")) > MAX_WRITE:
        return 413, {"error": "NFO too large"}
    try:  # the caller's own token: Plex decides whether they may see this item
        item = first_item(plex_get(f"/library/metadata/{key}", caller_token))
    except urllib.error.HTTPError as e:
        return (403 if e.code in (401, 403) else 404), {"error": f"Plex refused this token ({e.code})"}
    if item is None or item.get("type") not in ("movie", "episode"):
        return 400, {"error": "only films and episodes can get a generated NFO"}
    videos = [Path(remap(f)) for f in parts_of(item)]
    video = next((v for v in videos if v.name == fname), None)
    if video is None:
        return 400, {"error": "that file doesn't belong to this item"}
    target = video.with_suffix(".nfo")
    if target.exists() and not body.get("overwrite"):
        return 409, {"error": f"{target.name} already exists", "name": target.name}
    tmp = target.with_name(f".{target.name}.tmp")
    try:
        data = text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, target)
    except OSError as e:
        try:
            tmp.unlink()
        except OSError:
            pass
        return 500, {"error": f"cannot write {target.name}: {e.strerror or e}"}
    log(f"{key}: wrote {target}")
    return 200, {"ok": True, "name": target.name}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        m = re.fullmatch(r"/nfo/(\d+)", self.path.split("?", 1)[0])
        if not m:
            return self.reply(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if not 0 < length <= MAX_WRITE * 2:
            return self.reply(413, {"error": "bad request size"})
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {"error": "invalid JSON"})
        code, payload = write_nfo(m.group(1), (self.headers.get("X-Plex-Token") or "").strip(), body)
        self.reply(code, payload)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/ping":
            return self.reply(200, {"ok": True, "write": True, "info": True, "mediainfo": bool(mediainfo_bin())})
        m = re.fullmatch(r"/info/(\d+)", path)
        if m:
            try:
                code, payload = item_info(m.group(1), fresh="fresh=1" in self.path)
            except urllib.error.HTTPError as e:
                code, payload = (404 if e.code == 404 else 502), {"error": f"plex {e.code}"}
            except Exception as e:
                code, payload = 500, {"error": str(e)}
            return self.reply(code, payload)
        m = re.fullmatch(r"/nfo/(\d+)", path)
        if not m:
            return self.reply(404, {"error": "not found"})
        key = m.group(1)
        try:
            title, typ, nfos = find_nfos(key)
        except urllib.error.HTTPError as e:
            msg = "Plex rejected the token (set PLEX_TOKEN)" if e.code == 401 else f"plex {e.code}"
            log(f"{key}: {msg}")
            return self.reply(404 if e.code == 404 else 502, {"error": msg})
        except Exception as e:
            log(f"{key}: error: {e}")
            return self.reply(502, {"error": f"cannot reach Plex: {e}"})
        log(f"{key} [{typ}] {title!r}: {[n['label'] for n in nfos] or 'no NFO'}")
        self.reply(200 if nfos else 404, {"title": title, "type": typ, "files": nfos,
                                          "error": None if nfos else "no matching .nfo"})

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"plex-nfo-server on http://{HOST}:{PORT}  (Plex: {PLEX_URL})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

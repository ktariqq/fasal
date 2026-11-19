"""Site-grid cache: 03 streams each granule once and stores it here; 04 and 05 read it back offline."""
import hashlib
import json
import numpy as np
from common import *


def meta(n, row):
    # track, direction, frame and release code from the file name, with the granule CSV as fallback
    p = n.split("_")
    ok = len(p) > 9 and p[5].isdigit()
    d = {"A": "ASCENDING", "D": "DESCENDING"}.get(p[6], "") if ok else ""
    return {"track": str(int(p[5])) if ok else str(row.get("path_number", "")), "dir": d or str(row.get("flight_direction", "")).upper(), "frame": p[7] if ok else "", "rel": p[-5] if ok else ""}


def keep(m, a):
    return ((not a.direction or m["dir"] == a.direction.upper()) and (not a.path or m["track"] == str(a.path).lstrip("0"))
            and (not a.frame or m["frame"] == str(a.frame).zfill(3)) and (not a.release or m["rel"].upper().startswith(a.release.upper())))


def add_filters(ap, cover=False):
    for k, h in (("direction", "flight direction (ASCENDING or DESCENDING)"), ("path", "track number, for example 135"), ("frame", "frame number, for example 72"), ("release", "release: the letter before the five digits near the end of the file name (X or P)")):
        ap.add_argument(f"--{k}", help=f"keep one {h}")
    if cover:
        ap.add_argument("--min-cover", type=float, default=0.5, help="drop dates where less than this fraction of the site box has radar data")


def cache_key(site, hc, size):
    return hashlib.md5(json.dumps([site["bbox"], hc, size], sort_keys=True, default=str).encode()).hexdigest()[:10]


def info_of(p):
    # the cached info of a granule, or None when missing or unreadable
    try:
        return json.loads(str(np.load(p, allow_pickle=False)["info"]))
    except Exception:
        return None


def load(site, cfg, a):
    # (dates, {pol: [T, S, S] dB}, coverage of the first polarization, file names), or None when nothing is usable
    sid, fc = site["id"], cfg.get("frames", {})
    S = fc.get("size", 768)
    key = cache_key(site, cfg["h5"], S)
    rec, files, tracks, rels = {}, [], set(), set()
    for p in sorted((OUT / "cube" / sid).glob("*.npz")):
        z = np.load(p, allow_pickle=False)
        i = json.loads(str(z["info"]))
        if i.get("key") != key or not i["n"] or not keep(i["meta"], a):
            continue
        slot = rec.setdefault(dt.date.fromisoformat(i["date"]), {})
        for pol in z.files:
            if pol != "info":  # granules of the same date fill each other's gaps
                slot[pol] = z[pol] if pol not in slot else np.where(np.isfinite(slot[pol]), slot[pol], z[pol])
        files.append(i["file"])
        tracks.add((i["meta"]["track"], i["meta"]["dir"]))
        rels.add(i["meta"]["rel"])
    if not rec:
        log.error("%s: nothing in the cache. Run 03_build_cube.py first and check --path/--direction/--frame/--release and the h5 paths in config.yaml.", sid)
        return None
    if len(tracks) > 1:
        log.error("%s: granules from different tracks or directions (%s) cannot share one series; pass --path and --direction", sid, sorted(tracks))
        return None
    if len({r[:1] for r in rels}) > 1:
        log.warning("%s: more than one release code in the series (%s); pass --release to keep one", sid, sorted(rels))
    pols = sorted(sorted({q for s in rec.values() for q in s}), key=lambda q: q != fc.get("pol", "HH"))
    nan = np.full((S, S), np.nan, "float32")
    dates = sorted(rec)
    cube = {q: np.stack([rec[d].get(q, nan) for d in dates]) for q in pols}
    cover = np.isfinite(cube[pols[0]]).mean((1, 2))
    use = np.flatnonzero(cover >= a.min_cover)
    if not use.size:
        log.error("%s: no date has %.0f%% radar coverage of the site box; lower --min-cover or check the site box", sid, a.min_cover * 100)
        return None
    log.info("%s: %d of %d dates kept (coverage at least %.0f%%)", sid, use.size, len(dates), a.min_cover * 100)
    return [dates[k] for k in use], {q: v[use] for q, v in cube.items()}, cover[use], files
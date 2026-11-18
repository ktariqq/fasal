#!/usr/bin/env python3
"""Crop each granule to the site box and write grayscale (science) and purple PNG frames plus frames.json.
Each granule's crop is cached once in out/framecache/<site>/, so big files can be streamed or deleted."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from tqdm import tqdm
from common import *
from h5util import *


def meta(n, row):
    # track, direction, frame and release code from the file name, with the granule CSV as fallback
    p = n.split("_")
    ok = len(p) > 9 and p[5].isdigit()
    d = {"A": "ASCENDING", "D": "DESCENDING"}.get(p[6], "") if ok else ""
    return {"track": str(int(p[5])) if ok else str(row.get("path_number", "")), "dir": d or str(row.get("flight_direction", "")).upper(), "frame": p[7] if ok else "", "rel": p[-5] if ok else ""}


def keep(m, a):
    return ((not a.direction or m["dir"] == a.direction.upper()) and (not a.path or m["track"] == str(a.path).lstrip("0"))
            and (not a.frame or m["frame"] == str(a.frame).zfill(3)) and (not a.release or m["rel"].upper().startswith(a.release.upper())))


def sources(sid, a):
    # (file name, local Path or https URL, csv row); URLs come from the granule CSV and are used only with --stream
    rows, loc = granule_rows(sid), {f.name: f for f, _ in list_granules(sid)}
    names = set(loc) | (set(rows) if a.stream else set())
    return [(n, loc.get(n) or rows[n].get("url"), rows.get(n, {})) for n in sorted(names)]


def info_of(p, key):
    # the cached info of a granule, or None when missing, unreadable or made with other settings
    try:
        i = json.loads(str(np.load(p, allow_pickle=False)["info"]))
        return i if i.get("key") == key else None
    except Exception:
        return None


def main():
    setup_logging()
    cfg = load_config()
    fc = cfg.get("frames", {})
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--pol", default=fc.get("pol", "HH"), help="keep equal to the first polarization in series.json")
    ap.add_argument("--size", type=int, default=fc.get("size", 768))
    ap.add_argument("--levels", type=int, default=64, help="gray levels kept; fewer levels give smaller files")
    ap.add_argument("--direction")
    ap.add_argument("--path")
    ap.add_argument("--frame")
    ap.add_argument("--release")
    ap.add_argument("--stream", action="store_true", help="read granules that are not on disk straight from ASF (crop only, no download)")
    ap.add_argument("--limit", type=int, default=0, help="process at most N new granules per run")
    a = ap.parse_args()
    hc, S, step = cfg["h5"], a.size, 256 // a.levels
    for site in load_sites(a.sites):
        sid = site["id"]
        key = hashlib.md5(json.dumps([site["bbox"], hc, a.pol], sort_keys=True, default=str).encode()).hexdigest()[:10]
        cd = OUT / "framecache" / sid
        cd.mkdir(parents=True, exist_ok=True)
        todo = [(n, s, r, meta(n, r)) for n, s, r in sources(sid, a) if s]
        todo = [t for t in todo if keep(t[3], a) and info_of(cd / (t[0] + ".npz"), key) is None]
        if a.limit:
            todo = todo[:a.limit]
        for n, s, r, m in tqdm(todo, desc=sid):
            try:
                d, arr = granule_date(Path(n), r), None
                with open_h5(s) as h:
                    w = window(h, hc, site["bbox"])
                    if w is not None:
                        pols = find_pols(h, hc)
                        if a.pol not in pols:
                            log.warning("%s has no %s; using %s", n, a.pol, next(iter(pols)))
                        arr = read_lin(h, hc, pols.get(a.pol) or next(iter(pols.values())), w)
                db = np.zeros((0, 0), "float32") if arr is None else (10 * np.log10(arr)).astype("float32")
                cnt = 0 if arr is None else int(np.isfinite(arr).sum())
                np.savez_compressed(cd / (n + ".npz"), db=db, info=json.dumps({"key": key, "file": n, "date": d.isoformat(), "n": cnt, "meta": m}))
            except Exception as e:
                log.error("%s: %s", n, e)
        best, groups = {}, set()
        sp = PUB / sid / "series.json"
        ok = set(json.loads(sp.read_text())["dates"]) if sp.exists() else None
        if ok is None:
            log.warning("%s: no series.json yet; run 04 first so frames and series use the same dates", sid)
        for p in sorted(cd.glob("*.npz")):
            i = info_of(p, key)
            if not i or not i["n"] or not keep(i["meta"], a) or (ok is not None and i["date"] not in ok):
                continue
            groups.add((i["meta"]["track"], i["meta"]["dir"]))
            d = dt.date.fromisoformat(i["date"])
            if i["n"] > best.get(d, (0, None))[0]:  # same date, several granules: keep the one with the most valid pixels
                best[d] = (i["n"], p)
        if len(groups) > 1:
            log.error("%s: granules from different tracks or directions (%s); pass --path and --direction", sid, sorted(groups))
            continue
        if not best:
            log.error("%s: no frames could be made (check h5 paths, the filters, and that the granules cover the site box)", sid)
            continue

        def square(db):
            x = np.where(np.isfinite(db), db, np.nanpercentile(db, 1)).astype("float32")
            return np.asarray(Image.fromarray(x).resize((S, S), Image.Resampling.BILINEAR))

        dates = sorted(best)
        imgs = [square(np.load(best[d][1])["db"]) for d in dates]
        lo, hi = np.percentile(np.stack(imgs), [fc.get("p_low", 2), fc.get("p_high", 98)])  # one stretch per site keeps frames comparable
        d0, fr = PUB / sid, []
        for fp in (d0 / "frames").glob("*.png"):
            fp.unlink()
        for d, im in zip(dates, imgs):
            g = np.clip(np.round(stretch(im, lo, hi) * 255 / step) * step, 0, 255).astype(np.uint8)
            save_frame(g, d0 / "frames" / f"{d}_color.png", d0 / "frames" / f"{d}.png")
            fr.append({"date": d.isoformat(), "file_color": f"frames/{d}_color.png", "file_gray": f"frames/{d}.png"})
        write_json(d0 / "frames.json", fr)
        log.info("%s: %d frames at %dx%d, stretch %.1f to %.1f dB (percentiles %s)", sid, len(fr), S, S, lo, hi, (fc.get("p_low", 2), fc.get("p_high", 98)))
        if a.limit and len(todo) == a.limit:
            log.info("%s: --limit reached; run the same command again to continue", sid)


if __name__ == "__main__":
    main()
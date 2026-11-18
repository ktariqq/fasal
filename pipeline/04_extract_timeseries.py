#!/usr/bin/env python3
"""Per-field backscatter time series from NISAR HDF5 files (local or streamed) -> public/data/<site>/series.json.
Each granule is processed once and its small result is cached in out/cache/<site>/, so big files can be deleted."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
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


def load(p, key):
    # a cached result, or None when missing, unreadable or made with other polygons or settings
    try:
        e = json.loads(p.read_text())
        return e if e.get("key") == key else None
    except Exception:
        return None


def sources(sid, a):
    # (file name, local Path or https URL, csv row); URLs come from the granule CSV and are used only with --stream
    rows, loc = granule_rows(sid), {f.name: f for f, _ in list_granules(sid)}
    names = set(loc) | (set(rows) if a.stream else set())
    return [(n, loc.get(n) or rows[n].get("url"), rows.get(n, {})) for n in sorted(names)]


def extract(site, cfg, hc, a):
    sid, fields = site["id"], get_fields(site)
    key = hashlib.md5(json.dumps([site["bbox"], [[f["id"], f["ring"]] for f in fields], hc, a.min_pixels], sort_keys=True, default=str).encode()).hexdigest()[:10]
    cd = OUT / "cache" / sid
    cd.mkdir(parents=True, exist_ok=True)
    todo = [(n, s, r, meta(n, r)) for n, s, r in sources(sid, a) if s]
    todo = [t for t in todo if keep(t[3], a) and load(cd / (t[0] + ".json"), key) is None]
    if a.limit:
        todo = todo[:a.limit]
    for n, s, r, m in tqdm(todo, desc=sid):
        try:
            d, vals = granule_date(Path(n), r), {}
            with open_h5(s) as h:
                w = window(h, hc, site["bbox"])
                if w is None:
                    log.warning("%s: the site box is outside this granule; cached as empty", n)
                else:
                    for pol, nm in find_pols(h, hc).items():
                        arr = read_lin(h, hc, nm, w)
                        vals[pol] = {fl["id"]: field_db(arr, poly_mask(fl["ring"], w), a.min_pixels) for fl in fields}
            (cd / (n + ".json")).write_text(json.dumps({"key": key, "file": n, "date": d.isoformat(), "meta": m, "vals": vals}))
        except Exception as e:
            log.error("%s: %s", n, e)
    allc = [load(p, key) for p in sorted(cd.glob("*.json"))]
    if allc.count(None):
        log.info("%s: %d cached results ignored (made with other polygons or settings)", sid, allc.count(None))
    ents = [e for e in allc if e and e["vals"] and keep(e["meta"], a)]
    if not ents:
        log.error("%s: no usable granules. Run 01 first, then use --stream, or put .h5 files in pipeline/out/data/%s. Check --path/--direction/--frame/--release and the h5 paths in config.yaml.", sid, sid)
        return
    groups = {(e["meta"]["track"], e["meta"]["dir"]) for e in ents}
    if len(groups) > 1:
        log.error("%s: granules from different tracks or directions (%s) cannot share one series; pass --path and --direction", sid, sorted(groups))
        return
    if len({e["meta"]["rel"][:1] for e in ents}) > 1:
        log.warning("%s: more than one release code in the series (%s); pass --release to keep one", sid, sorted({e["meta"]["rel"] for e in ents}))
    rec, used = {}, []
    for e in sorted(ents, key=lambda e: (e["date"], e["file"])):
        d = dt.date.fromisoformat(e["date"])
        used.append(e["file"])
        for pol, fv in e["vals"].items():
            slot = rec.setdefault(d, {}).setdefault(pol, {})
            for i, v in fv.items():
                if slot.get(i) is None:
                    slot[i] = v
    first = cfg.get("frames", {}).get("pol", "HH")
    pols = sorted({p for v in rec.values() for p in v}, key=lambda p: p != first)  # frame polarization listed first
    dates = [d for d in sorted(rec) if all(any(v is not None for v in rec[d].get(p, {}).values()) for p in pols)]
    if not dates:
        log.error("%s: no valid polygon values. Likely causes: wrong h5 paths or EPSG in config.yaml, polygons outside the granules, polygons smaller than --min-pixels (%d).", sid, a.min_pixels)
        return
    ids = [f["id"] for f in fields]
    M = {p: np.array([[np.nan if rec[d][p].get(i) is None else rec[d][p][i] for i in ids] for d in dates], float).T for p in pols}  # fields x dates

    def stat(X):
        return {"median": np.nanmedian(X, 0).round(2).tolist(), "q25": np.nanpercentile(X, 25, 0).round(2).tolist(), "q75": np.nanpercentile(X, 75, 0).round(2).tolist()}

    ser = {"site_id": sid, "data_mode": "real", "source": f"NASA-ISRO NISAR {cfg.get('search', {}).get('processing_level', 'GCOV')} via ASF DAAC; extracted by pipeline/04_extract_timeseries.py",
           "sensor": f"NISAR L-band {cfg.get('search', {}).get('processing_level', 'GCOV')}", "polarizations": pols, "unit": "dB", "dates": [d.isoformat() for d in dates],
           "series": {p: stat(M[p]) for p in pols},
           "per_field": [{"id": i, **{p: [None if np.isnan(v) else round(float(v), 2) for v in M[p][k]] for p in pols}} for k, i in enumerate(ids)],
           "n_acquisitions": len(dates), "granules": used}
    d0 = PUB / sid
    for n in ("events.json", "analysis.json", "frames.json"):
        (d0 / n).unlink(missing_ok=True)
    for fp in (d0 / "frames").glob("*.png"):
        fp.unlink()
    log.info("%s: removed old events, analysis and frames; run 05 and 06 next", sid)
    write_json(d0 / "series.json", ser)
    write_json(d0 / "fields.geojson", fields_geojson(site))
    span = (dates[-1] - dates[0]).days
    log.info("%s: %d acquisitions, %s to %s (%d days), polarizations %s", sid, len(dates), dates[0], dates[-1], span, pols)
    if a.limit and len(todo) == a.limit:
        log.info("%s: --limit reached; run the same command again to continue", sid)
    if len(dates) < 20 or span < 365:
        log.warning("%s: too few dates or too short a span; the app will say so and will not estimate cropping intensity", sid)
    if len(fields) < 3:
        log.warning("%s: fewer than 3 polygons; the interquartile band is not meaningful", sid)


def main():
    setup_logging()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--direction", help="keep one flight direction (ASCENDING or DESCENDING)")
    ap.add_argument("--path", help="keep one track number, for example 135")
    ap.add_argument("--frame", help="keep one frame number, for example 72")
    ap.add_argument("--release", help="keep one release: the letter before the five digits near the end of the file name (X or P)")
    ap.add_argument("--min-pixels", type=int, default=20, help="minimum valid pixels inside a polygon")
    ap.add_argument("--stream", action="store_true", help="read granules that are not on disk straight from ASF (crop only, no download)")
    ap.add_argument("--limit", type=int, default=0, help="process at most N new granules per run")
    a = ap.parse_args()
    cfg = load_config()
    if not cfg.get("h5"):
        raise SystemExit("config.yaml has no h5 section; run 03_inspect_h5.py and edit it")
    for site in load_sites(a.sites):
        extract(site, cfg, cfg["h5"], a)


if __name__ == "__main__":
    main()
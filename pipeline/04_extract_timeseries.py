#!/usr/bin/env python3
"""Per-field backscatter time series from downloaded NISAR HDF5 files -> public/data/<site>/series.json."""
import argparse
import h5py
import numpy as np
from tqdm import tqdm
from common import *
from h5util import *


def extract(site, cfg, hc, a):
    sid, fields = site["id"], get_fields(site)
    gr = list_granules(sid, a.direction, a.path)
    if not gr:
        log.error("%s: no .h5 files in pipeline/out/data/%s (run 01 and 02, or copy files there)", sid, sid)
        return
    rec, used = {}, []
    for f, row in tqdm(gr, desc=sid):
        try:
            d = granule_date(f, row)
            with h5py.File(f, "r") as h:
                w = window(h, hc, site["bbox"])
                if w is None:
                    log.warning("%s: the site box is outside this granule; skipped", f.name)
                    continue
                for pol, name in find_pols(h, hc).items():
                    arr = read_lin(h, hc, name, w)
                    slot = rec.setdefault(d, {}).setdefault(pol, {})
                    for fl in fields:
                        if slot.get(fl["id"]) is None:
                            slot[fl["id"]] = field_db(arr, poly_mask(fl["ring"], w), a.min_pixels)
            used.append(f.name)
        except Exception as e:
            log.error("%s: %s", f.name, e)
    first = cfg.get("frames", {}).get("pol", "HH")
    pols = sorted({p for v in rec.values() for p in v}, key=lambda p: p != first)  # frame polarization listed first
    dates = [d for d in sorted(rec) if all(any(v is not None for v in rec[d].get(p, {}).values()) for p in pols)]
    if not dates:
        log.error("%s: no valid polygon values. Likely causes: wrong h5 paths or EPSG in config.yaml, polygons outside the granules, polygons smaller than --min-pixels (%d). See Part D troubleshooting.", sid, a.min_pixels)
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
    if len(dates) < 20 or span < 365:
        log.warning("%s: too few dates or too short a span; the app will say so and will not estimate cropping intensity", sid)
    if len(fields) < 3:
        log.warning("%s: fewer than 3 polygons; the interquartile band is not meaningful", sid)


def main():
    setup_logging()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--direction", help="keep one flight direction (ASCENDING or DESCENDING) from the granule CSV")
    ap.add_argument("--path", help="keep one track / path number from the granule CSV")
    ap.add_argument("--min-pixels", type=int, default=20, help="minimum valid pixels inside a polygon")
    a = ap.parse_args()
    cfg = load_config()
    if not cfg.get("h5"):
        raise SystemExit("config.yaml has no h5 section; run 03_inspect_h5.py and edit it")
    for site in load_sites(a.sites):
        extract(site, cfg, cfg["h5"], a)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Per-field series, comparable frames (transparent where there is no radar data) and fields.geojson from the site cube -> public/data/<site>/."""
import argparse
import numpy as np
from common import *
from cube import *


def field_db(X, min_px):
    # X: [dates, pixels] dB of one polygon; mean in linear power, then dB; NaN where too few valid pixels
    lin = 10 ** (X / 10)
    ok = np.isfinite(lin)
    n = ok.sum(1)
    with np.errstate(all="ignore"):
        return np.where(n >= min_px, 10 * np.log10(np.where(ok, lin, 0).sum(1) / np.maximum(n, 1)), np.nan)


def stat(X):
    return {"median": np.nanmedian(X, 0).round(2).tolist(), "q25": np.nanpercentile(X, 25, 0).round(2).tolist(), "q75": np.nanpercentile(X, 75, 0).round(2).tolist()}


def main():
    setup_logging()
    cfg = load_config()
    fc, S = cfg.get("frames", {}), cfg.get("frames", {}).get("size", 768)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--min-pixels", type=int, default=20, help="minimum valid pixels inside a polygon")
    ap.add_argument("--levels", type=int, default=64, help="gray levels kept; fewer levels give smaller files")
    add_filters(ap, True)
    a = ap.parse_args()
    step = 256 // a.levels
    for site in load_sites(a.sites):
        sid, d0 = site["id"], PUB / site["id"]
        c = load(site, cfg, a)
        if c is None:
            continue
        dates, cube, _, files = c
        pols = list(cube)
        fields = get_fields(site)
        masks = [polygon_mask(f["ring"], site["bbox"], S, S) for f in fields]
        M = {p: np.stack([field_db(cube[p][:, m], a.min_pixels) for m in masks]) for p in pols}  # [fields, dates]
        use = [k for k in range(len(dates)) if all(np.isfinite(M[p][:, k]).any() for p in pols)]
        if not use:
            log.error("%s: no polygon has enough valid pixels on any date. Check out/fields_%s.png or lower --min-pixels.", sid, sid)
            continue
        dates, M = [dates[k] for k in use], {p: M[p][:, use] for p in pols}
        imgs = cube[pols[0]][use]
        level = cfg.get("search", {}).get("processing_level", "GCOV")
        ser = {"site_id": sid, "data_mode": "real", "source": f"NASA-ISRO NISAR {level} via ASF DAAC.", "sensor": f"NISAR L-band {level}", "polarizations": pols, "unit": "dB",
               "dates": [d.isoformat() for d in dates], "series": {p: stat(M[p]) for p in pols},
               "per_field": [{"id": f["id"], **{p: [None if np.isnan(v) else round(float(v), 2) for v in M[p][k]] for p in pols}} for k, f in enumerate(fields)],
               "n_acquisitions": len(dates), "granules": files}
        for n in ("events.json", "analysis.json", "frames.json"):
            (d0 / n).unlink(missing_ok=True)
        for fp in (d0 / "frames").glob("*.png"):
            fp.unlink()
        lo, hi = np.nanpercentile(imgs, [fc.get("p_low", 2), fc.get("p_high", 98)])  # one stretch per site keeps frames comparable
        fr = []
        for d, im in zip(dates, imgs):
            v = np.isfinite(im)
            g = np.clip(np.round(stretch(np.nan_to_num(im, nan=lo), lo, hi) * 255 / step) * step, 0, 255).astype(np.uint8)
            save_frame(g, d0 / "frames" / f"{d}_color.png", d0 / "frames" / f"{d}.png", v)
            fr.append({"date": d.isoformat(), "file_color": f"frames/{d}_color.png", "file_gray": f"frames/{d}.png", "coverage": round(float(v.mean()), 3)})
        write_json(d0 / "series.json", ser)
        write_json(d0 / "frames.json", fr)
        write_json(d0 / "fields.geojson", fields_geojson(site))
        span, an = (dates[-1] - dates[0]).days, cfg.get("analysis", {})
        log.info("%s: %d acquisitions, %s to %s (%d days), polarizations %s, %d polygons, stretch %.1f to %.1f dB", sid, len(dates), dates[0], dates[-1], span, pols, len(fields), lo, hi)
        if len(dates) < an.get("min_dates", 20) or span < an.get("min_span", 365):
            log.warning("%s: too few dates or too short a span; the app will say so and will not estimate cropping intensity", sid)
        if len(fields) < 3:
            log.warning("%s: fewer than 3 polygons; the interquartile band is not meaningful", sid)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Generate SYNTHETIC series, frames and events so the app always runs. Nothing here is NISAR data."""
import argparse
import datetime as dt
import numpy as np
from scipy.spatial import cKDTree
from common import *

# invented (day-of-year, HH dB) control points, periodic over 366 days: plausible shapes only, not measurements
CURVES = {
    "punjab": [(1, -15.5), (45, -14.0), (75, -11.5), (95, -10.5), (115, -12.0), (135, -17.5), (160, -18.0), (175, -21.5), (200, -22.0), (225, -18.5), (255, -12.5), (285, -11.5), (305, -16.5), (320, -17.0), (345, -16.0)],
    "larkana": [(1, -16.5), (60, -16.0), (90, -14.9), (112, -16.8), (140, -18.0), (165, -18.0), (180, -21.5), (205, -22.0), (230, -18.5), (260, -13.0), (290, -11.8), (310, -15.5), (340, -16.5)],
    "thar": [(1, -20.0), (150, -20.5), (195, -20.0), (220, -17.5), (245, -14.5), (265, -14.0), (290, -17.0), (310, -19.5), (340, -20.0)],
}


def stat(M):
    return {"median": np.median(M, 0).round(2).tolist(), "q25": np.percentile(M, 25, 0).round(2).tolist(), "q75": np.percentile(M, 75, 0).round(2).tolist()}


def make_site(site, a):
    sid, d = site["id"], PUB / site["id"]
    if (d / "series.json").exists() and read_json(d / "series.json").get("data_mode") != "demo" and not a.force:
        log.warning("%s holds real or mixed data; skipping (use --force to overwrite)", sid)
        return
    rng = np.random.default_rng(a.seed + sum(map(ord, sid)))
    s, npar = a.size, 70
    start = dt.date.fromisoformat(a.start)
    dates = [start + dt.timedelta(days=a.step * k) for k in range(a.n)]
    yy, xx = np.mgrid[0:s, 0:s]
    fields = get_fields(site)
    nf = len(fields)
    lab = cKDTree(rng.uniform(0, s, (npar, 2))).query(np.c_[xx.ravel(), yy.ravel()])[1].reshape(s, s)
    masks = [polygon_mask(f["ring"], site["bbox"], s, s) for f in fields]
    for i, m in enumerate(masks):
        lab[m] = npar + i
    shift = np.r_[rng.uniform(-10, 10, npar), rng.uniform(-5, 5, nf)]
    off = np.r_[rng.normal(0, 0.8, npar), rng.normal(0, 0.5, nf)]
    xs, ys = zip(*CURVES[sid])
    water = {"larkana": lambda: np.abs(yy - (0.5 * s + 0.08 * s * np.sin(xx / s * 2 * np.pi * 1.3))) < 0.03 * s,
             "punjab": lambda: np.abs(xx - (0.15 * s + 0.5 * yy)) < 0.012 * s}.get(sid)
    wm = water() if water else None
    hh_f, hv_f, imgs = [], [], []
    for dte in dates:
        v = np.interp(dte.timetuple().tm_yday + shift, xs, ys, period=366) + off + rng.normal(0, 0.4, npar + nf) + rng.normal(0, 0.3)
        lin = []
        for base, wdb in ((v, -24.0), (0.7 * v - 9, -30.0)):
            m = base[lab].copy()
            if wm is not None:
                m[wm] = wdb
            lin.append(10 ** (m / 10) * rng.gamma(6, 1 / 6, m.shape))  # 6-look speckle
        hh_f.append([10 * np.log10(lin[0][mk].mean()) for mk in masks])  # polygon mean in linear power, then dB
        hv_f.append([10 * np.log10(lin[1][mk].mean()) for mk in masks])
        imgs.append(10 * np.log10(lin[0]))
    for f in (d / "frames").glob("*.png"):
        f.unlink()
    lo, hi = np.percentile(np.stack(imgs), [2, 98])  # one stretch for the whole site so frames are comparable
    fr = []
    for dte, im in zip(dates, imgs):
        g = np.clip(np.round(stamp_demo(stretch(im, lo, hi) * 255) / 4) * 4, 0, 255).astype(np.uint8)
        save_frame(g, d / "frames" / f"{dte}_color.png", d / "frames" / f"{dte}.png")
        fr.append({"date": dte.isoformat(), "file_color": f"frames/{dte}_color.png", "file_gray": f"frames/{dte}.png"})
    H, V = np.array(hh_f).T, np.array(hv_f).T
    ser = {"site_id": sid, "data_mode": "demo", "source": "SYNTHETIC: pipeline/07_make_demo_data.py (illustrative; not NISAR observations)", "sensor": "SYNTHETIC (illustrative demo)",
           "polarizations": ["HH", "HV"], "unit": "dB", "dates": [x.isoformat() for x in dates], "series": {"HH": stat(H), "HV": stat(V)},
           "per_field": [{"id": f["id"], "HH": np.round(H[i], 2).tolist(), "HV": np.round(V[i], 2).tolist()} for i, f in enumerate(fields)], "n_acquisitions": len(dates)}
    evs, an = build_events(site, dates, {k: v["median"] for k, v in ser["series"].items()}, cfg=load_config().get("analysis"))
    write_json(d / "series.json", ser)
    write_json(d / "frames.json", fr)
    write_json(d / "events.json", evs)
    write_json(d / "analysis.json", an)
    write_json(d / "fields.geojson", fields_geojson(site))
    log.info("%s: %d demo frames, %d events, cropping-intensity estimate=%s", sid, len(fr), len(evs), an["cropping_intensity"]["estimate"])


def main():
    setup_logging()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*", help="site ids (default: all)")
    ap.add_argument("--start", default="2025-07-01")
    ap.add_argument("--step", type=int, default=12, help="days between acquisitions")
    ap.add_argument("--n", type=int, default=36)
    ap.add_argument("--size", type=int, default=320)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--force", action="store_true", help="overwrite sites that hold real or mixed data")
    a = ap.parse_args()
    for s in load_sites(a.sites):
        make_site(s, a)


if __name__ == "__main__":
    main()
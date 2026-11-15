#!/usr/bin/env python3
"""Crop each granule to the site box and write grayscale (science) and purple PNG frames plus frames.json."""
import argparse
import h5py
import numpy as np
from PIL import Image
from tqdm import tqdm
from common import *
from h5util import *


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
    a = ap.parse_args()
    hc, S, step = cfg["h5"], a.size, 256 // a.levels
    for site in load_sites(a.sites):
        sid, best = site["id"], {}
        for f, row in tqdm(list_granules(sid, a.direction, a.path), desc=sid):
            try:
                with h5py.File(f, "r") as h:
                    w = window(h, hc, site["bbox"])
                    if w is None:
                        continue
                    pols = find_pols(h, hc)
                    if a.pol not in pols:
                        log.warning("%s has no %s; using %s", f.name, a.pol, next(iter(pols)))
                    arr = read_lin(h, hc, pols.get(a.pol) or next(iter(pols.values())), w)
                n, d = int(np.isfinite(arr).sum()), granule_date(f, row)
                if n and n > best.get(d, (0, None))[0]:  # same date, several granules: keep the one with the most valid pixels
                    best[d] = (n, 10 * np.log10(arr))
            except Exception as e:
                log.error("%s: %s", f.name, e)
        if not best:
            log.error("%s: no frames could be made (check h5 paths and that the granules cover the site box)", sid)
            continue

        def square(db):
            x = np.where(np.isfinite(db), db, np.nanpercentile(db, 1)).astype("float32")
            return np.asarray(Image.fromarray(x).resize((S, S), Image.Resampling.BILINEAR))

        dates = sorted(best)
        imgs = [square(best[d][1]) for d in dates]
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


if __name__ == "__main__":
    main()
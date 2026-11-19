#!/usr/bin/env python3
"""Find field-like patches in the radar itself: segment the per-pixel time series of the site cube into compact, homogeneous regions -> pipeline/fields/<site>.geojson (check them in out/fields_<site>.png)."""
import argparse
import math
import warnings
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, gaussian_filter
from skimage.measure import approximate_polygon, find_contours, regionprops
from skimage.segmentation import slic
from common import *
from cube import *

warnings.filterwarnings("ignore", category=RuntimeWarning)


def blur(x, s):
    # gaussian blur of every date that ignores NaN (speckle reduction)
    ok = np.isfinite(x)
    num, den = gaussian_filter(np.where(ok, x, 0), (0, s, s)), gaussian_filter(ok.astype("float32"), (0, s, s))
    return np.where(den > 0.3, num / np.maximum(den, 1e-6), np.nan)


def norm(x):
    # per-date z-score over space, so scene-wide changes (soil moisture, incidence angle) do not dominate
    return (x - np.nanmedian(x, (1, 2), keepdims=True)) / np.maximum(np.nanstd(x, (1, 2), keepdims=True), 1e-3)


def main():
    setup_logging()
    cfg = load_config()
    S = cfg.get("frames", {}).get("size", 768)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--n", type=int, default=8, help="polygons to keep")
    ap.add_argument("--target-ha", type=float, default=3, help="typical region size handed to the segmenter")
    ap.add_argument("--min-ha", type=float, default=1.5)
    ap.add_argument("--max-ha", type=float, default=12)
    ap.add_argument("--smooth", type=float, default=1.5, help="speckle blur in pixels")
    ap.add_argument("--compact", type=float, default=1.0, help="higher gives more regular shapes, lower follows the radar more closely")
    ap.add_argument("--min-valid", type=float, default=0.85, help="a pixel needs data on at least this fraction of the dates")
    ap.add_argument("--dyn", type=float, default=0.8, help="minimum seasonal swing (std, dB) of the region mean; drops villages and water")
    ap.add_argument("--solidity", type=float, default=0.85, help="minimum area / convex-hull area")
    add_filters(ap, True)
    a = ap.parse_args()
    for site in load_sites(a.sites):
        sid, bbox = site["id"], site["bbox"]
        c = load(site, cfg, a)
        if c is None:
            continue
        dates, cube, _, _ = c
        pols = list(cube)
        W, Sb, E, N = bbox
        px_ha = (E - W) * 111320 * math.cos(math.radians((Sb + N) / 2)) / S * ((N - Sb) * 110574 / S) / 1e4
        if len(dates) < 6:
            log.warning("%s: only %d dates; regions will be unreliable", sid, len(dates))
        B = [blur(cube[p], a.smooth) for p in pols]
        X = np.concatenate([norm(b) for b in B])  # [dates * pols, S, S]
        ok = np.isfinite(X).mean(0) >= a.min_valid
        if ok.mean() < 0.1:
            log.error("%s: too little valid data (%.0f%% of the box); lower --min-valid or raise coverage", sid, ok.mean() * 100)
            continue
        fin = np.isfinite(X)
        X = np.where(fin, X, np.where(fin, X, 0).sum(0) / np.maximum(fin.sum(0), 1))  # a missing date takes the pixel's own mean
        Z = X[:, ok].T
        Z = Z - Z.mean(0)
        k = min(6, Z.shape[1])
        P = np.zeros((S, S, k), "float32")
        P[ok] = Z @ np.linalg.eigh(np.cov(Z.T))[1][:, -k:]  # top principal components of the time series
        P /= P[ok][:, -1].std()
        seg = slic(P, n_segments=max(4, int(ok.sum() * px_ha / a.target_ha)), compactness=a.compact, sigma=0, channel_axis=-1, convert2lab=False, start_label=1, mask=ok)
        cand = []
        for r in regionprops(seg):
            ha = r.area * px_ha
            if not a.min_ha <= ha <= a.max_ha or r.solidity < a.solidity:
                continue
            ts = np.nanmean(B[0][(slice(None), *r.slice)][:, r.image], 1)
            if np.nanstd(ts) < a.dyn:
                continue
            cand.append({"id": r.label, "r": r, "ha": ha, "score": float(P[r.slice][r.image].std(0).mean()), "c": r.centroid})
        log.info("%s: %d regions, %d pass the size, shape and seasonality filters", sid, seg.max(), len(cand))
        if not cand:
            log.warning("%s: none passed; lower --dyn or --solidity, change --target-ha, or widen --min-ha/--max-ha", sid)
            continue
        pool = sorted(cand, key=lambda q: q["score"])[:a.n * 6]  # most homogeneous first
        pick = [pool[0]]
        while len(pick) < min(a.n, len(pool)):
            used = {q["id"] for q in pick}
            pick.append(max((q for q in pool if q["id"] not in used), key=lambda q: min(math.dist(q["c"], p["c"]) for p in pick)))  # spread them out
        feats, rings = [], []
        for q in sorted(pick, key=lambda q: q["c"]):
            r = q["r"]
            m = binary_erosion(np.pad(r.image, 2), iterations=1)  # stay inside the patch, away from mixed edge pixels
            if not m.any():
                continue
            ring = approximate_polygon(max(find_contours(m.astype(float), 0.5), key=len), 1.0)
            if len(ring) < 4:
                continue
            rc = [(r.bbox[0] + y - 2, r.bbox[1] + x - 2) for y, x in ring]
            pts = [[round(W + (x + 0.5) / S * (E - W), 6), round(N - (y + 0.5) / S * (N - Sb), 6)] for y, x in rc]
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            fid = f"{sid[0].upper()}{len(feats) + 1}"
            feats.append({"type": "Feature", "properties": {"id": fid, "area_ha": round(q["ha"], 1), "source": "NISAR time-series segmentation"}, "geometry": {"type": "Polygon", "coordinates": [pts]}})
            rings.append((fid, rc))
        write_json(HERE / "fields" / f"{sid}.geojson", {"type": "FeatureCollection", "features": feats})
        im0 = np.nanmean(cube[pols[0]], 0)
        lo, hi = np.nanpercentile(im0, [2, 98])
        img = Image.fromarray((stretch(np.nan_to_num(im0, nan=lo), lo, hi) * 255).astype("uint8")).convert("RGB")
        dr = ImageDraw.Draw(img)
        for fid, rc in rings:
            dr.line([(x, y) for y, x in rc], fill=(255, 215, 0), width=2)
            dr.text((rc[0][1] + 4, rc[0][0] + 4), fid, fill=(255, 255, 255))
        OUT.mkdir(parents=True, exist_ok=True)
        img.save(OUT / f"fields_{sid}.png")
        log.info("%s: wrote %d polygons to pipeline/fields/%s.geojson; inspect pipeline/out/fields_%s.png", sid, len(feats), sid, sid)


if __name__ == "__main__":
    main()
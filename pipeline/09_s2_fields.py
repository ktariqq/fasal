#!/usr/bin/env python3
"""Segment Sentinel-2 NDVI (windowed reads from public COGs, nothing large is downloaded) into field-like polygons -> pipeline/fields/<site>.geojson."""
import argparse
import json
import math
import urllib.request
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from pyproj import Transformer
from scipy.ndimage import binary_erosion
from skimage.measure import approximate_polygon, find_contours, regionprops
from skimage.segmentation import felzenszwalb
from common import *

STAC = "https://earth-search.aws.element84.com/v1/search"


def href(it, name):
    return it["assets"][name]["href"].replace("s3://sentinel-cogs/", "https://sentinel-cogs.s3.us-west-2.amazonaws.com/")


def search(bbox, start, end, cloud, n):
    body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z", "limit": 200, "query": {"eo:cloud_cover": {"lt": cloud}}}
    req = urllib.request.Request(STAC, json.dumps(body).encode(), {"Content-Type": "application/json", "User-Agent": "fasal-pipeline"})
    items = sorted(json.load(urllib.request.urlopen(req, timeout=90))["features"], key=lambda i: i["properties"]["datetime"])
    return [items[j] for j in sorted(set(np.linspace(0, len(items) - 1, min(n, len(items))).round().astype(int)))] if items else []


def ndvi(it, bounds, shape, crs):
    try:
        bands = []
        for b in ("red", "nir"):
            with rasterio.open(href(it, b)) as s:
                if s.crs != crs:
                    return None
                bands.append(s.read(1, window=from_bounds(*bounds, transform=s.transform), out_shape=shape, boundless=True, fill_value=0, resampling=Resampling.bilinear).astype("float32"))
    except Exception as e:
        log.warning("%s skipped: %s", it["id"], e)
        return None
    r, n = bands
    return None if (r > 0).mean() < 0.95 else np.where(r + n > 0, (n - r) / (r + n + 1e-6), 0)


def main():
    setup_logging()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--start", default="2025-10-01")
    ap.add_argument("--end", default="2026-11-14")
    ap.add_argument("--cloud", type=float, default=10, help="max scene cloud cover, percent")
    ap.add_argument("--dates", type=int, default=12, help="scenes spread over the date range")
    ap.add_argument("--n", type=int, default=8, help="polygons to keep")
    ap.add_argument("--min-ha", type=float, default=2)
    ap.add_argument("--max-ha", type=float, default=10)
    ap.add_argument("--scale", type=float, default=8, help="segmentation scale: higher gives bigger regions")
    ap.add_argument("--min-px", type=int, default=60, help="smallest region in 10 m pixels")
    ap.add_argument("--dyn", type=float, default=0.12, help="minimum seasonal NDVI swing, drops villages, water and bare ground")
    a = ap.parse_args()
    for site in load_sites(a.sites):
        sid, bbox = site["id"], site["bbox"]
        W, S, E, N = bbox
        items = search(bbox, a.start, a.end, a.cloud, a.dates)
        log.info("%s: %d scenes selected", sid, len(items))
        if len(items) < 3:
            log.warning("%s: too few scenes; raise --cloud or widen --start/--end", sid)
            continue
        with rasterio.open(href(items[0], "red")) as s:
            crs = s.crs
        xs, ys = zip(*[Transformer.from_crs(4326, crs, always_xy=True).transform(x, y) for x, y in ((W, S), (E, S), (E, N), (W, N))])
        bounds = (min(xs), min(ys), max(xs), max(ys))
        shape = (round((bounds[3] - bounds[1]) / 10), round((bounds[2] - bounds[0]) / 10))
        cube = [v for v in (ndvi(i, bounds, shape, crs) for i in items) if v is not None]
        log.info("%s: %d usable dates, image %dx%d pixels", sid, len(cube), shape[1], shape[0])
        if len(cube) < 3:
            continue
        X = np.stack(cube, -1)
        Z = X.reshape(-1, X.shape[-1])
        Z = Z - Z.mean(0)
        P = (Z @ np.linalg.eigh(np.cov(Z.T))[1][:, -3:]).reshape(shape + (3,))  # top 3 principal components
        P = (P - P.min((0, 1))) / (np.ptp(P, axis=(0, 1)) + 1e-9)
        seg = felzenszwalb(P, scale=a.scale, sigma=1.0, min_size=a.min_px)
        cand = []
        for r in regionprops(seg + 1):
            ha = r.area / 100
            if not a.min_ha <= ha <= a.max_ha or r.solidity < 0.85:
                continue
            v = X[r.slice][r.image]
            if v.mean(0).std() >= a.dyn:
                cand.append({"i": len(cand), "r": r, "ha": ha, "score": float(v.std(0).mean()), "c": r.centroid})
        log.info("%s: %d regions pass the size, shape and seasonality filters", sid, len(cand))
        if not cand:
            log.warning("%s: none passed; lower --dyn, change --scale (try 4 or 15) or widen --min-ha/--max-ha", sid)
            continue
        pool = sorted(cand, key=lambda c: c["score"])[:a.n * 6]  # most uniform first
        pick = [pool[0]]
        while len(pick) < min(a.n, len(pool)):
            used = {p["i"] for p in pick}
            pick.append(max((c for c in pool if c["i"] not in used), key=lambda c: min(math.dist(c["c"], p["c"]) for p in pick)))
        back = Transformer.from_crs(crs, 4326, always_xy=True)
        feats = []
        for c in pick:
            r = c["r"]
            m = binary_erosion(np.pad(r.image, 2), iterations=1)
            if not m.any():
                continue
            ring = approximate_polygon(max(find_contours(m.astype(float), 0.5), key=len), 1.0)
            if len(ring) < 4:
                continue
            pts = [[round(v, 6) for v in back.transform(bounds[0] + (r.bbox[1] + x - 2 + 0.5) / shape[1] * (bounds[2] - bounds[0]), bounds[3] - (r.bbox[0] + y - 2 + 0.5) / shape[0] * (bounds[3] - bounds[1]))] for y, x in ring]
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            feats.append({"type": "Feature", "properties": {"id": f'{sid[0].upper()}{len(feats) + 1}', "area_ha": round(c["ha"], 1), "source": "Sentinel-2 NDVI segmentation (pipeline/10_s2_fields.py)"}, "geometry": {"type": "Polygon", "coordinates": [pts]}})
        write_json(HERE / "fields" / f"{sid}.geojson", {"type": "FeatureCollection", "features": feats})
        log.info("%s: wrote %d polygons to pipeline/fields/%s.geojson", sid, len(feats), sid)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Stitch a static basemap per site from XYZ tiles, resampled onto the same lon/lat grid as the radar frames -> public/data/<site>/basemap.jpg and basemap.json."""
import argparse
import io
import math
import urllib.error
import urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from common import *

TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"
ATTR = "Basemap: Sentinel-2 cloudless 2020 by EOX IT Services GmbH, contains modified Copernicus Sentinel data (CC BY-NC-SA 4.0)"


def mer(lon, lat, z):
    # web-mercator pixel coordinates at zoom z
    n = 256 * 2 ** z
    return (np.asarray(lon) + 180) / 360 * n, (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n


def stitch(url, bbox, size, z):
    W, S, E, N = bbox
    x0, y0 = mer(W, N, z)
    x1, y1 = mer(E, S, z)
    tx0, tx1, ty0, ty1 = int(x0 // 256), int(x1 // 256), int(y0 // 256), int(y1 // 256)
    mosaic = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            req = urllib.request.Request(url.format(z=z, x=tx, y=ty), headers={"User-Agent": "fasal-pipeline"})
            mosaic.paste(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256))
    arr = np.asarray(mosaic, "float32")
    px = mer(W + (np.arange(size) + 0.5) / size * (E - W), 0, z)[0] - tx0 * 256 - 0.5
    py = mer(0, N - (np.arange(size) + 0.5) / size * (N - S), z)[1] - ty0 * 256 - 0.5
    rc = np.meshgrid(py, px, indexing="ij")  # same north-up lon/lat grid as the radar frames
    return np.stack([map_coordinates(arr[..., c], rc, order=1, mode="nearest") for c in range(3)], -1).clip(0, 255).astype("uint8")


def main():
    setup_logging()
    S = load_config().get("frames", {}).get("size", 768)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--zoom", type=int, default=14, help="highest zoom to try; lower zooms are tried if tiles are missing")
    ap.add_argument("--tiles", default=TILES, help="XYZ tile URL template with {z} {x} {y}")
    ap.add_argument("--attribution", default=ATTR, help="credit line shown in the app; verify the licence of your tile source")
    a = ap.parse_args()
    for site in load_sites(a.sites):
        for z in range(a.zoom, 10, -1):
            try:
                img = stitch(a.tiles, site["bbox"], S, z)
                break
            except urllib.error.URLError as e:
                log.warning("%s: zoom %d failed (%s)", site["id"], z, e)
        else:
            log.error("%s: no tiles could be fetched; check --tiles and your connection", site["id"])
            continue
        d = PUB / site["id"]
        d.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img).save(d / "basemap.jpg", quality=82, optimize=True)
        write_json(d / "basemap.json", {"attribution": a.attribution, "tiles": a.tiles, "zoom": z})
        log.info("%s: basemap written at zoom %d", site["id"], z)


if __name__ == "__main__":
    main()
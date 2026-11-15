"""HDF5 helpers shared by 04 and 05. Every path comes from config.yaml (h5 section); nothing is hard-wired."""
import math
import re
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw
from pyproj import Transformer
from common import *


def granule_rows(site_id):
    f = OUT / f"granules_{site_id}.csv"
    return {r["file_name"]: r for r in pd.read_csv(f, dtype=str).fillna("").to_dict("records")} if f.exists() else {}


def list_granules(site_id, direction=None, path=None):
    # returns [(file, csv_row)] for downloaded files, optionally limited to one flight direction or track
    rows, out = granule_rows(site_id), []
    for f in sorted((OUT / "data" / site_id).glob("*.h5")):
        r = rows.get(f.name, {})
        if direction and r.get("flight_direction", "").upper() != direction.upper():
            continue
        if path and r.get("path_number", "") != str(path):
            continue
        out.append((f, r))
    return out


def granule_date(f, row):
    if row.get("date"):
        return dt.date.fromisoformat(row["date"])
    m = re.search(r"(20\d{2})(\d{2})(\d{2})T", f.name) or re.search(r"(20\d{2})(\d{2})(\d{2})", f.name)
    if not m:
        raise ValueError("no acquisition date: add this file to out/granules_<site>.csv (columns date,file_name)")
    return dt.date(int(m[1]), int(m[2]), int(m[3]))


def read_epsg(h, hc):
    if hc.get("epsg_override"):
        return int(hc["epsg_override"])
    g = h[hc["grid_group"]]
    if hc["epsg"] not in g:
        raise KeyError(f"'{hc['epsg']}' not in {hc['grid_group']}; run 03_inspect_h5.py, fix h5.epsg, or set h5.epsg_override")
    node = g[hc["epsg"]]
    vals = ([node[()]] if node.shape == () else []) + [node.attrs.get(k) for k in ("epsg", "EPSG", "epsg_code")]
    for v in vals:
        if v is None:
            continue
        m = re.search(r"(\d{4,6})", v.decode(errors="ignore") if isinstance(v, bytes) else str(v))
        if m:
            return int(m.group(1))
    raise ValueError("could not read an EPSG code; set h5.epsg_override in config.yaml")


def find_pols(h, hc):
    if hc["grid_group"] not in h:
        raise KeyError(f"group {hc['grid_group']} not in file; run 03_inspect_h5.py and edit config.yaml")
    g = h[hc["grid_group"]]
    found = {p: n for p, n in hc["datasets"].items() if n in g}
    if not found:
        raise KeyError(f"none of {hc['datasets']} found in {hc['grid_group']}; fix h5.datasets in config.yaml")
    if len(found) < len(hc["datasets"]):
        log.warning("datasets missing in this file: %s", [p for p in hc["datasets"] if p not in found])
    return found


def window(h, hc, bbox, pad=2):
    # pixel window of the site box in the granule grid (projected pixel-centre coordinates); None if outside
    g = h[hc["grid_group"]]
    x, y = g[hc["x_coords"]][:], g[hc["y_coords"]][:]
    if len(x) < 2 or len(y) < 2:
        raise ValueError("coordinate vectors are too short")
    epsg = read_epsg(h, hc)
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    W, S, E, N = bbox
    px, py = zip(*[tr.transform(lo, la) for lo, la in ((W, S), (E, S), (E, N), (W, N))])
    x0, y0, dx, dy = float(x[0]), float(y[0]), float(x[1] - x[0]), float(y[1] - y[0])
    cs = sorted([(min(px) - x0) / dx, (max(px) - x0) / dx])
    rs = sorted([(min(py) - y0) / dy, (max(py) - y0) / dy])
    c0, c1, r0, r1 = math.floor(cs[0]) - pad, math.ceil(cs[1]) + pad, math.floor(rs[0]) - pad, math.ceil(rs[1]) + pad
    if c1 <= 0 or r1 <= 0 or c0 >= len(x) or r0 >= len(y):
        return None
    return {"c0": max(c0, 0), "c1": min(c1, len(x)), "r0": max(r0, 0), "r1": min(r1, len(y)), "x0": x0, "y0": y0, "dx": dx, "dy": dy, "tr": tr, "epsg": epsg}


def read_lin(h, hc, name, w):
    # linear power in the window; invalid (nodata, NaN, <= 0) becomes NaN
    ds = h[hc["grid_group"]][name]
    if ds.dtype.names or np.issubdtype(ds.dtype, np.complexfloating):
        raise TypeError(f"{name} is complex or compound; choose a real-valued power dataset in config h5.datasets")
    a = ds[w["r0"]:w["r1"], w["c0"]:w["c1"]].astype("float64") * float(hc.get("scale") or 1)
    if hc.get("nodata") is not None:
        a[a == hc["nodata"]] = np.nan
    a[~np.isfinite(a) | (a <= 0)] = np.nan
    return a


def poly_mask(ring, w):
    X, Y = w["tr"].transform([p[0] for p in ring], [p[1] for p in ring])
    pts = [((x - w["x0"]) / w["dx"] - w["c0"], (y - w["y0"]) / w["dy"] - w["r0"]) for x, y in zip(X, Y)]
    m = Image.new("L", (w["c1"] - w["c0"], w["r1"] - w["r0"]), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.array(m) > 0


def field_db(a, mask, min_px):
    # mean in linear power inside the polygon, then dB; None when too few valid pixels
    v = a[mask]
    v = v[np.isfinite(v)]
    return None if v.size < min_px else float(10 * np.log10(v.mean()))
"""HDF5 helpers: open a granule (streamed or local) and resample it onto the site grid. Every path comes from config.yaml (h5 section)."""
import contextlib
import functools
import math
import re
from pathlib import Path
import h5py
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from common import *


@functools.lru_cache(maxsize=1)
def _fs():
    import earthaccess
    earthaccess.login()  # environment variables, then netrc, then a terminal prompt
    return earthaccess.get_fsspec_https_session()


@contextlib.contextmanager
def open_h5(src):
    # src is a local Path or an https URL; a URL is streamed and only the bytes that are read are fetched
    if isinstance(src, Path):
        with h5py.File(src, "r") as h:
            yield h
        return
    with _fs().open(src, "rb", block_size=4 << 20, cache_type="blockcache") as fh, h5py.File(fh, "r") as h:
        yield h


def granule_rows(site_id):
    f = OUT / f"granules_{site_id}.csv"
    return {r["file_name"]: r for r in pd.read_csv(f, dtype=str).fillna("").to_dict("records")} if f.exists() else {}


def granule_date(f, row):
    if row.get("date"):
        return dt.date.fromisoformat(row["date"])
    m = re.search(r"(20\d{2})(\d{2})(\d{2})T", f.name) or re.search(r"(20\d{2})(\d{2})(\d{2})", f.name)
    if not m:
        raise ValueError("no acquisition date: add this file to out/granules_<site>.csv (columns date,file_name,url)")
    return dt.date(int(m[1]), int(m[2]), int(m[3]))


def read_epsg(h, hc):
    if hc.get("epsg_override"):
        return int(hc["epsg_override"])
    g = h[hc["grid_group"]]
    if hc["epsg"] not in g:
        raise KeyError(f"'{hc['epsg']}' not in {hc['grid_group']}; run 02_inspect_h5.py, fix h5.epsg, or set h5.epsg_override")
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
        raise KeyError(f"group {hc['grid_group']} not in file; run 02_inspect_h5.py and edit config.yaml")
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


def to_grid(h, hc, bbox, size):
    # every polarization as dB on a fixed size x size lon/lat grid over bbox (north up); NaN wherever the granule has no data
    w = window(h, hc, bbox)
    if w is None:
        return None
    W, S, E, N = bbox
    lon, lat = np.meshgrid(W + (np.arange(size) + 0.5) / size * (E - W), N - (np.arange(size) + 0.5) / size * (N - S))
    X, Y = w["tr"].transform(lon.ravel(), lat.ravel())
    rc = [((np.asarray(Y) - w["y0"]) / w["dy"] - w["r0"]).reshape(size, size), ((np.asarray(X) - w["x0"]) / w["dx"] - w["c0"]).reshape(size, size)]
    out = {}
    for pol, nm in find_pols(h, hc).items():
        with np.errstate(all="ignore"):
            out[pol] = (10 * np.log10(map_coordinates(read_lin(h, hc, nm, w), rc, order=1, mode="constant", cval=np.nan))).astype("float32")
    return out
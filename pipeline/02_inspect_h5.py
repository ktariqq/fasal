#!/usr/bin/env python3
"""Print the HDF5 tree of a NISAR file (local path or streamed https URL), then candidate rasters and a SUGGESTED config.yaml h5 section."""
import argparse
import re
from pathlib import Path
import h5py
import numpy as np
from h5util import open_h5

COV = re.compile(r"^(HH|HV|VH|VV)\1$")


def short(v):
    if isinstance(v, bytes):
        return v.decode(errors="replace")[:70]
    if isinstance(v, np.ndarray):
        return str(v.tolist()) if v.size <= 6 else f"array{v.shape}"
    return str(v)[:70]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", help="local .h5 path, or an https URL from the url column of out/granules_<site>.csv (needs Earthdata login)")
    ap.add_argument("--max-attrs", type=int, default=6, help="attributes shown per item (0 hides them)")
    ap.add_argument("--depth", type=int, default=None, help="deepest tree level to print")
    a = ap.parse_args()
    rasters, coords, proj = [], [], []
    with open_h5(a.source if a.source.startswith("http") else Path(a.source)) as h:
        def visit(name, o):
            leaf, depth = name.split("/")[-1], name.count("/")
            if isinstance(o, h5py.Dataset):
                if o.ndim == 2 and min(o.shape) >= 256 and (o.dtype.kind in "fc" or o.dtype.names):
                    rasters.append((f"/{name}", o.shape, o.dtype))
                if o.ndim == 1 and re.search(r"coord|^[xy]$", leaf, re.I):
                    coords.append((f"/{name}", o.shape, o.dtype))
                if re.search(r"proj|epsg", leaf, re.I):
                    proj.append((f"/{name}", o[()] if o.shape == () else f"shape {o.shape}"))
            if a.depth is not None and depth > a.depth:
                return
            kind = f"dataset shape={o.shape} dtype={o.dtype}" if isinstance(o, h5py.Dataset) else "group"
            print(f"{'  ' * depth}{leaf}{'' if isinstance(o, h5py.Dataset) else '/'}  [{kind}]")
            for k, v in list(o.attrs.items())[:a.max_attrs]:
                print(f"{'  ' * depth}    @{k} = {short(v)}")
        h.visititems(visit)
        print("\n== candidate 2-D rasters (at least 256 x 256) ==")
        for p, shp, d in rasters:
            print(f"{p}  shape={shp}  dtype={d}")
        print("\n== coordinate-like 1-D datasets ==")
        for p, shp, d in coords:
            print(f"{p}  shape={shp}  dtype={d}")
        print("\n== projection-like items ==")
        for p, v in proj:
            print(f"{p} = {short(v)}")
        groups = {}
        for p, _, _ in rasters:
            g, n = p.rsplit("/", 1)
            if COV.match(n):
                groups.setdefault(g, {})[n[:2]] = n
        print("\n== suggested config.yaml h5 section (a heuristic: VERIFY against the tree above) ==")
        if not groups:
            print("No datasets named like HHHH / HVHV were found. Choose a real-valued backscatter raster from the list above by hand.")
            return
        g = max(groups, key=lambda k: len(groups[k]))
        keys = list(h[g].keys())
        pick = lambda rx: next((k for k in keys if re.search(rx, k, re.I)), "SET_MANUALLY")
        print(f"h5:\n  grid_group: {g}\n  datasets: {{{', '.join(f'{p}: {n}' for p, n in groups[g].items())}}}")
        print(f"  x_coords: {pick(r'^x.*coord')}\n  y_coords: {pick(r'^y.*coord')}\n  epsg: {pick(r'proj|epsg')}\n  nodata: null")
        print("\nIf epsg shows SET_MANUALLY, look for the projection item above or set h5.epsg_override to the EPSG number.")


if __name__ == "__main__":
    main()
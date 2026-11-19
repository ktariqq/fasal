#!/usr/bin/env python3
"""Stream each granule listed in out/granules_<site>.csv once and cache it on the site grid in out/cube/<site>/. Only small cache files reach the disk."""
import argparse
import json
from pathlib import Path
import numpy as np
from tqdm import tqdm
from common import *
from cube import *
from h5util import *


def main():
    setup_logging()
    cfg = load_config()
    hc, S = cfg["h5"], cfg.get("frames", {}).get("size", 768)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--limit", type=int, default=0, help="process at most N new granules per run")
    add_filters(ap)
    a = ap.parse_args()
    for site in load_sites(a.sites):
        sid, key = site["id"], cache_key(site, hc, S)
        rows = granule_rows(sid)
        if not rows:
            log.error("%s: out/granules_%s.csv not found; run 01_search_nisar.py first", sid, sid)
            continue
        cd = OUT / "cube" / sid
        cd.mkdir(parents=True, exist_ok=True)
        todo = [(n, r, meta(n, r)) for n, r in sorted(rows.items()) if r.get("url")]
        todo = [t for t in todo if keep(t[2], a) and (info_of(cd / (t[0] + ".npz")) or {}).get("key") != key]
        if a.limit:
            todo = todo[:a.limit]
        for n, r, m in tqdm(todo, desc=sid):
            try:
                with open_h5(r["url"]) as h:
                    g = to_grid(h, hc, site["bbox"], S)
                if g is None:
                    log.warning("%s: the site box is outside this granule; cached as empty", n)
                g = g or {}
                nv = int(np.isfinite(next(iter(g.values()))).sum()) if g else 0
                info = {"key": key, "file": n, "date": granule_date(Path(n), r).isoformat(), "meta": m, "n": nv}
                np.savez_compressed(cd / (n + ".npz"), info=json.dumps(info), **g)
            except Exception as e:
                log.error("%s: %s", n, e)
        if a.limit and len(todo) == a.limit:
            log.info("%s: --limit reached; run the same command again to continue", sid)


if __name__ == "__main__":
    main()
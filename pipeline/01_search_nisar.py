#!/usr/bin/env python3
"""Search ASF for NISAR granules intersecting each site's 10 km box; write pipeline/out/granules_<site>.csv."""
import argparse
import json
import sys
from collections import Counter
from importlib.metadata import version
import pandas as pd
from common import *

MANUAL = """
Manual fallback (ASF Vertex):
 1. Open https://search.asf.alaska.edu and sign in with your Earthdata Login.
 2. Set the dataset to NISAR; under Filters set the product type / processing level to GCOV.
 3. Draw the site box on the map or paste its WKT: {wkt}
 4. Set a date range, press Search, and read the acquisition dates in the results.
 5. Add scenes to the Downloads queue and save the files into pipeline/out/data/<site>/.
 6. Create pipeline/out/granules_<site>.csv with columns date (YYYY-MM-DD) and file_name (exact file name).
Filter and button labels may differ slightly between Vertex versions."""


def val(p, *keys):
    for k in keys:
        if p.get(k) not in (None, ""):
            return p[k]
    return ""


def size_mb(p):
    try:
        if val(p, "sizeMB") != "":
            return round(float(p["sizeMB"]), 1)
        return round(float(val(p, "bytes", "fileSize")) / 1e6, 1)
    except (TypeError, ValueError):
        return ""


def main():
    setup_logging()
    try:
        import asf_search as asf
    except ImportError:
        sys.exit("asf_search is not installed. Run: pip install -r pipeline/requirements.txt")
    sc = load_config().get("search", {})
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--level", default=sc.get("processing_level", "GCOV"), help="NISAR product level, for example GCOV or GSLC")
    ap.add_argument("--maturity", default=sc.get("data_maturity"), help="PROVISIONAL or BETA (default: all)")
    ap.add_argument("--start", help="YYYY-MM-DD")
    ap.add_argument("--end", help="YYYY-MM-DD")
    ap.add_argument("--max-results", type=int, default=500)
    a = ap.parse_args()
    log.info("asf_search %s", version("asf_search"))
    sites, empty = load_sites(a.sites), 0
    for site in sites:
        sid, (W, S, E, N) = site["id"], site["bbox"]
        wkt = f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))"
        kw = {"dataset": "NISAR", "processingLevel": a.level, "intersectsWith": wkt, "maxResults": a.max_results}
        for k, v in (("start", a.start), ("end", a.end), ("dataMaturity", a.maturity)):
            if v:
                kw[k] = v
        try:
            res = asf.search(**kw)
        except Exception as e:
            sys.exit(f"ASF search failed for {sid}: {e}\nTry: pip install --upgrade asf_search (NISAR support is evolving), check your connection and the arguments.\n{MANUAL.format(wkt=wkt)}")
        if not len(res):
            empty += 1
            log.warning("%s: 0 granules for level=%s%s over %s. Try without --maturity/--start/--end, or another --level (GSLC).", sid, a.level, f", maturity={a.maturity}" if a.maturity else "", wkt)
            continue
        write_json(OUT / f"sample_properties_{sid}.json", json.loads(json.dumps(dict(res[0].properties), default=str)))
        rows = []
        for r in res:
            p = r.properties
            rows.append({"date": str(val(p, "startTime"))[:10], "start_time": val(p, "startTime"), "product_type": val(p, "processingLevel"), "size_mb": size_mb(p),
                         "file_name": val(p, "fileName") or str(val(p, "url")).rsplit("/", 1)[-1], "scene_name": val(p, "sceneName", "fileID"),
                         "flight_direction": val(p, "flightDirection"), "path_number": val(p, "pathNumber"), "frame_number": val(p, "frameNumber"),
                         "data_maturity": val(p, "dataMaturity"), "url": val(p, "url")})
        df = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
        (OUT).mkdir(parents=True, exist_ok=True)
        df.to_csv(OUT / f"granules_{sid}.csv", index=False)
        print(f"\n== {site['name']} ({sid}) ==")
        print(df[["date", "product_type", "size_mb", "flight_direction", "path_number", "file_name"]].head(40).to_string(index=False))
        nd = df["date"].nunique()
        print(f"\n{len(df)} granules on {nd} distinct dates, {df['date'].iloc[0]} to {df['date'].iloc[-1]}.")
        print("product types:", dict(Counter(df["product_type"])), "| maturity:", dict(Counter(df["data_maturity"])))
        print(f"Wrote {OUT / f'granules_{sid}.csv'} (raw fields of the first result: out/sample_properties_{sid}.json)")
        if nd < 20:
            print(f"NOTE: only {nd} distinct dates. The app will report this honestly and will not estimate cropping intensity.")
    if empty == len(sites):
        sys.exit("No granules found for any site.\n" + MANUAL.format(wkt="see the site box in pipeline/sites.json"))


if __name__ == "__main__":
    main()
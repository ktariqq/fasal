#!/usr/bin/env python3
"""Download granules from out/granules_<site>.csv with a size prompt, resume support and a total-GB cap."""
import argparse
import os
import sys
import numpy as np
import pandas as pd
from tqdm import tqdm
from common import *


def make_session():
    import asf_search as asf
    s = asf.ASFSession()
    tok, u, p = os.environ.get("EARTHDATA_TOKEN"), os.environ.get("EARTHDATA_USER"), os.environ.get("EARTHDATA_PASS")
    if tok:
        s.auth_with_token(tok)
    elif u and p:
        s.auth_with_creds(u, p)
    else:
        log.info("no token or credentials in the environment; relying on ~/.netrc")
    return s


def pick(df, limit):
    df = df.drop_duplicates("file_name").sort_values("date")
    if limit and len(df) > limit:
        df = df.iloc[sorted(set(np.linspace(0, len(df) - 1, limit).round().astype(int)))]
    return df


def fetch(s, url, dest, cap_left):
    # resumable: bytes already in <file>.part are kept and requested again with a Range header
    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    r = s.get(url, stream=True, timeout=60, headers={"Range": f"bytes={have}-"} if have else {})
    if r.status_code == 416:
        part.replace(dest)
        return 0
    if r.status_code in (401, 403):
        raise PermissionError("authentication failed (401/403): check EARTHDATA_TOKEN, and that the ASF application is approved in your Earthdata profile")
    r.raise_for_status()
    resumed = r.status_code == 206
    total = int(r.headers.get("Content-Length", 0)) + (have if resumed else 0)
    got = 0
    with open(part, "ab" if resumed else "wb") as fh, tqdm(total=total or None, initial=have if resumed else 0, unit="B", unit_scale=True, desc=dest.name[:36]) as bar:
        for chunk in r.iter_content(1 << 20):
            fh.write(chunk)
            got += len(chunk)
            bar.update(len(chunk))
            if got > cap_left:
                raise RuntimeError("total-GB cap reached; the partial file is kept so a later run can resume it")
    part.replace(dest)
    return got


def main():
    setup_logging()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--limit", type=int, default=10, help="download N granules spread evenly over time")
    ap.add_argument("--all", action="store_true", help="ignore --limit")
    ap.add_argument("--direction", help="ASCENDING or DESCENDING (from the CSV)")
    ap.add_argument("--path", help="one track / path number (from the CSV)")
    ap.add_argument("--max-gb", type=float, default=load_config().get("download", {}).get("max_total_gb", 20))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    ap.add_argument("--use-asf", action="store_true", help="use asf_search's own downloader (no resume) if the built-in one fails")
    a = ap.parse_args()
    left = a.max_gb * 1e9
    s = None
    for site in load_sites(a.sites):
        sid, csv = site["id"], OUT / f"granules_{site['id']}.csv"
        if not csv.exists():
            log.error("%s: %s not found; run 01_search_nisar.py first", sid, csv)
            continue
        df = pd.read_csv(csv, dtype=str).fillna("")
        if a.direction:
            df = df[df["flight_direction"].str.upper() == a.direction.upper()]
        if a.path:
            df = df[df["path_number"] == str(a.path)]
        df = pick(df, None if a.all else a.limit)
        sizes = pd.to_numeric(df["size_mb"], errors="coerce")
        known = sizes.sum() / 1000
        print(f"\n{sid}: {len(df)} files | {known:.2f} GB of known size | {int(sizes.isna().sum())} files of unknown size | cap {a.max_gb:g} GB")
        print(df[["date", "file_name", "size_mb"]].to_string(index=False))
        if a.dry_run:
            continue
        if known * 1e9 > left:
            sys.exit(f"Known size {known:.2f} GB exceeds the remaining cap. Lower --limit or raise --max-gb.")
        if not a.yes and input("Download these files? [y/N] ").strip().lower() != "y":
            continue
        s = s or make_session()
        dest_dir = OUT / "data" / sid
        dest_dir.mkdir(parents=True, exist_ok=True)
        todo = [(r.url, dest_dir / r.file_name) for r in df.itertuples() if not (dest_dir / r.file_name).exists()]
        if a.use_asf:
            import asf_search as asf
            asf.download_urls(urls=[u for u, _ in todo], path=str(dest_dir), session=s, processes=2)
            continue
        for url, dest in todo:
            try:
                left -= fetch(s, url, dest, left)
            except Exception as e:
                log.error("%s: %s", dest.name, e)
                if isinstance(e, (PermissionError, RuntimeError)):
                    sys.exit(1)
    log.info("done; downloaded files are in %s", OUT / "data")


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Rule-based phenology hints, gap metrics and the (gated) cropping-intensity estimate -> events.json and analysis.json."""
import argparse
from common import *


def main():
    setup_logging()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--pol", help="polarization to analyse (default HH, else the first available)")
    a = ap.parse_args()
    cfg = load_config().get("analysis")
    for site in load_sites(a.sites):
        d = PUB / site["id"]
        if not (d / "series.json").exists():
            log.error("%s: series.json missing; run 05_extract.py (real) or 07_make_demo_data.py (demo) first", site["id"])
            continue
        se = read_json(d / "series.json")
        dates = [dt.date.fromisoformat(x) for x in se["dates"]]
        evs, an = build_events(site, dates, {k: v["median"] for k, v in se["series"].items()}, pol=a.pol, cfg=cfg)
        write_json(d / "events.json", evs)
        write_json(d / "analysis.json", an)
        ci = an["cropping_intensity"]
        log.info("%s [%s]: %d acquisitions, %d events | %s", site["id"], se["data_mode"].upper(), len(dates), len(evs), ci["message"] + (" " + ci["reason"] if ci["reason"] else ""))
        if se["data_mode"] != "real":
            log.warning("%s: this series is %s, not real NISAR", site["id"], se["data_mode"])


if __name__ == "__main__":
    main()
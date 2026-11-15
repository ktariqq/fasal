#!/usr/bin/env python3
"""Validate per-site JSON and write public/data/manifest.json; reports which sites are real, demo or mixed."""
import sys
from common import *

MODES = {"real", "demo", "mixed"}
SERIES = {"site_id": str, "data_mode": str, "source": str, "sensor": str, "polarizations": list, "unit": str, "dates": list, "series": dict, "per_field": list, "n_acquisitions": int}
EVENT = {"id": str, "date": str, "type": str, "label": str, "label_ur": str, "description": str, "source": str, "confidence": str, "citation_needed": bool}
FRAME = {"date": str, "file_color": str, "file_gray": str}
STORY = {"id": str, "site_id": str, "title": str, "author": str, "year": str, "paraphrase": str, "landscape_link": str, "source": str}


def check(o, spec, where, errs):
    for k, t in spec.items():
        if k not in o:
            errs.append(f"{where}: missing '{k}'")
        elif not isinstance(o[k], t):
            errs.append(f"{where}: '{k}' must be {t.__name__}")


def main():
    setup_logging()
    errs, rows = [], []
    stories = read_json(PUB / "stories.json") if (PUB / "stories.json").exists() else []
    if not stories:
        errs.append("public/data/stories.json missing or empty")
    for st in stories:
        check(st, STORY, f"stories.json {st.get('id')}", errs)
    if not (HERE.parent / "public" / "maps" / "maps.json").exists():
        errs.append("public/maps/maps.json missing")
    for s in load_sites():
        d = PUB / s["id"]
        names = ("series.json", "events.json", "frames.json", "analysis.json")
        miss = [n for n in names if not (d / n).exists()]
        if miss:
            errs.append(f"{s['id']}: missing {miss}; run 07_make_demo_data.py or the real pipeline")
            continue
        se, evs, frs = (read_json(d / n) for n in names[:3])
        w = s["id"]
        check(se, SERIES, f"{w}/series.json", errs)
        n = len(se.get("dates", []))
        if n == 0:
            errs.append(f"{w}: series has no dates")
            continue
        if se.get("data_mode") not in MODES:
            errs.append(f"{w}: data_mode must be one of {sorted(MODES)}")
        if se.get("n_acquisitions") != n:
            errs.append(f"{w}: n_acquisitions != len(dates)")
        for pol, v in se.get("series", {}).items():
            for k in ("median", "q25", "q75"):
                if len(v.get(k, [])) != n:
                    errs.append(f"{w}: series.{pol}.{k} length != dates")
        for e in evs:
            check(e, EVENT, f"{w}/events.json {e.get('id')}", errs)
        for f in frs:
            check(f, FRAME, f"{w}/frames.json", errs)
            for k in ("file_color", "file_gray"):
                if not (d / f.get(k, "?")).exists():
                    errs.append(f"{w}: frame file missing: {f.get(k)}")
        if s["story_id"] not in {x["id"] for x in stories}:
            errs.append(f"{w}: story_id '{s['story_id']}' not in stories.json")
        rows.append({"id": w, "name": s["name"], "name_ur": s["name_ur"], "bbox": s["bbox"], "center": s["center"], "story_id": s["story_id"],
                     "cultural_event_ids": [e["id"] for e in evs if e["type"] == "cultural"], "data_mode": se["data_mode"], "sensor": se["sensor"],
                     "n_acquisitions": n, "date_range": [se["dates"][0], se["dates"][-1]]})
    if errs:
        log.error("validation failed:\n  " + "\n  ".join(errs))
        sys.exit(1)
    modes = {r["data_mode"] for r in rows}
    top = next(iter(modes)) if len(modes) == 1 else "mixed"
    write_json(PUB / "manifest.json", {"project": "FASAL", "data_mode": top, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "sites": rows})
    for r in rows:
        log.info("%-8s %-6s %3d acquisitions  %s .. %s  sensor=%s", r["id"], r["data_mode"].upper(), r["n_acquisitions"], r["date_range"][0], r["date_range"][1], r["sensor"])
    log.info("manifest written; overall data_mode=%s", top)


if __name__ == "__main__":
    main()
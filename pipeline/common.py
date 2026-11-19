"""Shared helpers for the FASAL pipeline: IO, masks, frames, and rule-based phenology hints."""
import datetime as dt
import json
import logging
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.signal import find_peaks, medfilt, savgol_filter

HERE = Path(__file__).resolve().parent
PUB = HERE.parent / "public" / "data"
OUT = HERE / "out"
log = logging.getLogger("fasal")
DEFAULTS = {"prom": 2.0, "min_dates": 20, "min_span": 365, "abrupt": 3.0, "onset": 1.0, "low_q": 0.25}
STOPS = [(0, (11, 5, 20)), (96, (61, 31, 92)), (170, (102, 51, 153)), (230, (200, 178, 232)), (255, (233, 222, 250))]


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def write_json(p, o):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(o, ensure_ascii=False, indent=1), encoding="utf-8")


def load_config():
    f = HERE / "config.yaml"
    if not f.exists():
        return {}
    import yaml
    return yaml.safe_load(f.read_text(encoding="utf-8")) or {}


def load_sites(only=None):
    return [s for s in read_json(HERE / "sites.json") if not only or s["id"] in only]


def get_fields(site):
    # prefers a hand-edited pipeline/fields/<site>.geojson over the starter rings in sites.json
    f = HERE / "fields" / f'{site["id"]}.geojson'
    if not f.exists():
        return site["fields"]
    feats = read_json(f)["features"]
    return [{"id": ft["properties"].get("id", f'{site["id"][0].upper()}{i + 1}'), "ring": ft["geometry"]["coordinates"][0]} for i, ft in enumerate(feats)]


def fields_geojson(site):
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": f["id"], "site_id": site["id"]}, "geometry": {"type": "Polygon", "coordinates": [f["ring"]]}} for f in get_fields(site)]}


def polygon_mask(ring, bbox, w, h):
    # rasterise a lon/lat ring onto a w x h grid covering bbox [W, S, E, N]
    W, S, E, N = bbox
    pts = [((x - W) / (E - W) * w, (N - y) / (N - S) * h) for x, y in ring]
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.array(m) > 0


def purple_palette():
    xs = [s[0] for s in STOPS]
    i = np.arange(256)
    return np.stack([np.interp(i, xs, [s[1][c] for s in STOPS]) for c in range(3)], 1).astype(np.uint8).ravel().tolist()


def stretch(db, lo, hi):
    return np.clip((db - lo) / (hi - lo), 0, 1)


def save_frame(u8, color_path, gray_path):
    # gray = science view; color = dark-violet-to-lavender ramp stored as a palette PNG (small files)
    for p in (color_path, gray_path):
        Path(p).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(u8).save(gray_path, optimize=True)
    im = Image.frombytes("P", (u8.shape[1], u8.shape[0]), u8.tobytes())
    im.putpalette(purple_palette())
    im.save(color_path, optimize=True)


def stamp_demo(arr, text="ILLUSTRATIVE DEMO DATA"):
    # blends a diagonal text stamp into a float 0-255 array
    h, w = arr.shape
    try:
        font = ImageFont.load_default(size=48)
    except TypeError:
        font = ImageFont.load_default()
    box = font.getbbox(text)
    t = Image.new("L", (box[2] + 4, box[3] + 4), 0)
    ImageDraw.Draw(t).text((0, 0), text, fill=255, font=font)
    t = t.crop(t.getbbox())
    tw = int(w * 0.9)
    t = t.resize((tw, max(1, int(t.height * tw / t.width))), Image.Resampling.LANCZOS)
    layer = Image.new("L", (w * 2, h * 2), 0)
    layer.paste(t, ((w * 2 - tw) // 2, (h * 2 - t.height) // 2))
    layer = layer.rotate(35, resample=Image.Resampling.BICUBIC).crop((w // 2, h // 2, w // 2 + w, h // 2 + h))
    m = np.asarray(layer, float) / 255 * 0.55
    return arr * (1 - m) + 255 * m


def first_sunday(y, m):
    d = dt.date(y, m, 1)
    return d + dt.timedelta(days=(6 - d.weekday()) % 7)


def cultural_events(site, d0, d1):
    out = []
    for c in site["cultural"]:
        for y in range(d0.year, d1.year + 1):
            d = dt.date(y, c["month"], c["day"]) if c["rule"] == "fixed" else first_sunday(y, c["month"])
            if d0 <= d <= d1:
                out.append({"id": f'{c["id"]}-{y}', "date": d.isoformat(), "type": "cultural", "label": c["label"], "label_ur": c["label_ur"], "description": c["description"], "source": c["source"], "confidence": "n/a", "citation_needed": c["source"].startswith("CITATION_NEEDED")})
    return out


def smooth(x):
    # 3-point moving median (edges fixed) then Savitzky-Golay (window 5, order 2)
    x = np.asarray(x, float)
    y = medfilt(x, 3)
    y[0], y[-1] = x[:2].mean(), x[-2:].mean()
    return savgol_filter(y, 5, 2) if len(x) >= 5 else y


def build_events(site, dates, med, pol=None, cfg=None):
    """Rule-based hints, always worded as hypotheses.
    low run   : lowest quarter of the series range for 2+ acquisitions in Jun-Sep -> consistent with standing water or smooth bare ground
    rise      : climbs `onset` dB above the preceding minimum and stays up       -> consistent with canopy growth
    peak      : prominent local maximum (`prom` dB)                              -> consistent with a developed canopy
    fall      : drop of `abrupt` dB within two acquisitions after a peak         -> consistent with harvest or clearing
    gap       : days from a fall to the next rise                                -> harvest-to-sowing hypothesis
    cropping-intensity: prominent peaks in the first 365 days, only if enough dates span a full year."""
    p = {**DEFAULTS, **(cfg or {})}
    n = len(dates)
    span = (dates[-1] - dates[0]).days if n > 1 else 0
    pol = pol or ("HH" if "HH" in med else next(iter(med)))
    ok = n >= p["min_dates"] and span >= p["min_span"]
    ci = {"allowed": ok, "estimate": None, "polarization": pol, "n_acquisitions": n, "span_days": span, "peaks_in_window": [], "message": "Insufficient dates for cropping-intensity estimate.",
          "reason": f"{n} acquisitions spanning {span} days; the rule needs at least {p['min_dates']} acquisitions covering at least {p['min_span']} days."}
    sig, gaps = [], []

    def ev(kind, i, label, desc, conf, cit=False):
        return {"id": f"sig-{kind}-{dates[i].isoformat()}", "date": dates[i].isoformat(), "type": "signal", "label": label, "label_ur": "", "description": desc,
                "source": f"FASAL rule-based hint on {pol} median; a hypothesis, not ground truth", "confidence": conf, "citation_needed": cit}

    if n >= 5:
        sm = smooth(med[pol])
        lo, hi = sm.min(), sm.max()
        thr = lo + p["low_q"] * (hi - lo)
        low = [bool(sm[i] <= thr and 6 <= dates[i].month <= 9) for i in range(n)]
        i = 0
        while i < n:
            j = i
            while low[i] and j + 1 < n and low[j + 1]:
                j += 1
            if low[i] and j > i:
                sig.append(ev("low", i, "Sustained low backscatter", f"{pol} stays in the lowest quarter of its range from {dates[i]} to {dates[j]} ({j - i + 1} acquisitions) in the Jun-Sep window. Consistent with standing water or a smooth bare surface; not confirmed.", "low"))
            i = j + 1
        pk, _ = find_peaks(sm, prominence=p["prom"], distance=3)
        ons, fal = {}, {}
        for k, a in enumerate(pk):
            prev = pk[k - 1] if k else 0
            nxt = pk[k + 1] if k + 1 < len(pk) else n - 1
            t = prev + int(np.argmin(sm[prev:a + 1]))
            amp = sm[a] - sm[t]
            conf = "medium" if n >= p["min_dates"] and amp >= 2 * p["prom"] else "low"
            o = next((i for i in range(t, a + 1) if sm[i] >= sm[t] + p["onset"] and (i == a or sm[i + 1] >= sm[t] + p["onset"])), a)
            ons[k] = o
            sig.append(ev("rise", o, "Backscatter rise", f"{pol} climbs {p['onset']:.1f} dB or more above its preceding minimum ({sm[t]:.1f} dB) and stays up. Consistent with canopy growth or field preparation; not confirmed.", conf))
            sig.append(ev("peak", int(a), "Backscatter maximum", f"Local maximum of {sm[a]:.1f} dB, {amp:.1f} dB above the preceding minimum. Consistent with a canopy near full development; not confirmed.", conf))
            d, i = max((sm[i] - sm[min(i + 2, nxt)], i) for i in range(a, nxt))
            if d >= p["abrupt"]:
                fal[k] = min(i + 1, n - 1)
                sig.append(ev("fall", fal[k], "Abrupt backscatter fall", f"{pol} drops {d:.1f} dB within two acquisitions after a maximum. Consistent with harvest or field clearing; not confirmed.", conf))
        for k in range(len(pk) - 1):
            if k in fal and k + 1 in ons and ons[k + 1] > fal[k]:
                g = (dates[ons[k + 1]] - dates[fal[k]]).days
                gaps.append({"fall_date": dates[fal[k]].isoformat(), "next_rise_date": dates[ons[k + 1]].isoformat(), "days": g, "citation_needed": True})
                sig.append(ev("gap", ons[k + 1], "Fall-to-rise gap (hypothesis)", f"{g} days between a detected abrupt fall ({dates[fal[k]]}) and the next detected rise ({dates[ons[k + 1]]}). May reflect a harvest-to-sowing turnaround; not confirmed.", "low", True))
        end = dates[0] + dt.timedelta(days=365)
        inw = [dates[a].isoformat() for a in pk if dates[a] < end]
        ci["peaks_in_window"] = inw
        if ok:
            ci.update(estimate=len(inw), reason="", message=f"{len(inw)} prominent backscatter peak(s) in the first 365 days; consistent with {len(inw)} crop cycle(s) per year if each peak is a crop canopy. Estimate only: no ground truth, and edge effects are possible.")
    events = sorted(sig + cultural_events(site, dates[0], dates[-1]), key=lambda e: e["date"])
    return events, {"cropping_intensity": ci, "gaps": gaps, "polarization": pol, "parameters": p, "n_acquisitions": n}
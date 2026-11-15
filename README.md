# FASAL (فصل)

*The Indus, as radar hears it.*

FASAL turns radar backscatter time series into an interactive, sonified "rhythm of the land" for three sites in Pakistan, paired with regional folk tales and cultural dates, and ends each site with a printable Field Record. Built solo for the 2026 NASA Space Apps Challenge "Dancing with the SARs" (NISAR).

## Honesty first

- The app has two data modes, set in the data files (`data_mode` in `series.json` and `manifest.json`), never hard-coded in the interface.
- DEMO data is synthetic. It always carries the banner "ILLUSTRATIVE DEMO DATA, NOT NISAR OBSERVATIONS", a diagonal stamp on every frame, and the same label on the Field Record.
- REAL data comes from downloaded NISAR files via `pipeline/`. Sites may be real, demo, or mixed; the banner and sensor labels say which.
- Cropping intensity is estimated only with at least 20 acquisitions spanning at least 365 days; otherwise the app says "Insufficient dates for cropping-intensity estimate."
- Every interpretation is a hypothesis ("consistent with ..."), not ground truth. Items needing a source are marked `CITATION_NEEDED`.
- Sample field polygons are starter rectangles, not verified crop fields. Redraw them in geojson.io (see `pipeline/00_README.md`).

## Run it (DEMO mode, no downloads)

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install numpy scipy pillow pyyaml
python pipeline/07_make_demo_data.py
python pipeline/08_build_manifest.py
npm install
npm run dev        # development server
npm run build      # static site in dist/
```

## Use real NISAR data

See `pipeline/00_README.md`: search with `01_search_nisar.py`, download with `02_download.py`, inspect the HDF5 layout with `03_inspect_h5.py`, edit `pipeline/config.yaml`, then run 04 to 06 and 08. The HDF5 paths in `config.yaml` are unverified defaults until you confirm them with a real file.

## Structure

```
pipeline/   offline Python: search, download, inspect, extract, frames, events, demo data, manifest
public/     static data (public/data/<site>/), optional historical maps (public/maps/)
src/        React + Vite + TypeScript app (scenes, components, lib, store)
slides/     7-slide outline with speaker notes
video/      30-second video shot list
```

## Add a historical map (Map Memory)

Drop a verified public-domain image at `public/maps/<site>.jpg` and fill in `public/maps/maps.json` (`title`, `year`, `source_url`, `license`, `verified`). Suggested places to search: Library of Congress, David Rumsey Map Collection, Wikimedia Commons, British Library. Verify each license yourself.

## Credits and license

MIT, see `LICENSE`. All libraries, fonts, data and story sources are listed in `REFERENCES.md`. All sound is generated live with the Web Audio API; there are no external image or audio assets.
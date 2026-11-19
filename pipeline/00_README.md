# FASAL pipeline

Offline Python 3.10+ scripts that turn NISAR files into the static JSON and PNG the app reads.
Every script runs from the repo root, for example `python pipeline/01_search_nisar.py --help`.
NISAR granules are streamed from ASF, never downloaded whole. Only a small per-granule cache is written to `pipeline/out/cube/`.

## Two modes

- DEMO: `07_make_demo_data.py` writes synthetic data labelled `"data_mode": "demo"`. Needs no network.
- REAL: scripts 01 to 06 turn streamed NISAR files into `"data_mode": "real"` data. Run `08_build_manifest.py` last in either mode.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r pipeline/requirements.txt
```

## Earthdata Login

1. Create a free account at https://urs.earthdata.nasa.gov.
2. If streaming answers 401 or 403, open "Applications" > "Authorized Apps" in your Earthdata profile and approve the ASF data access application (the exact name may differ).
3. Authenticate with ONE of: `EARTHDATA_TOKEN` (profile > "Generate Token"), `EARTHDATA_USER` and `EARTHDATA_PASS`, or `~/.netrc` (Windows: `~/_netrc`) with `machine urs.earthdata.nasa.gov login YOUR_USER password YOUR_PASS`. Never commit it.

Searching (01) needs no login. Everything that reads granules (02, 03) does.

## Run order (REAL)

```bash
python pipeline/01_search_nisar.py --sites punjab        # writes out/granules_punjab.csv, including a url column
python pipeline/02_inspect_h5.py <one url from the csv>  # prints the HDF5 tree and a suggested config
# edit pipeline/config.yaml (h5 section) from what 02 printed
python pipeline/03_build_cube.py --sites punjab --path 135 --direction DESCENDING
python pipeline/04_derive_fields.py --sites punjab --path 135 --direction DESCENDING   # check out/fields_punjab.png
python pipeline/05_extract.py --sites punjab --path 135 --direction DESCENDING
python pipeline/06_derive_events.py --sites punjab
python pipeline/09_make_basemap.py --sites punjab
python pipeline/08_build_manifest.py
```

- 03 streams each granule once onto a fixed lon/lat grid over the site box and caches it. Re-running skips cached granules; use `--limit N` to go in batches.
- Granules of the same date fill each other's gaps. Dates with less than `--min-cover` (default 0.5) radar coverage are dropped.
- 04 writes `pipeline/fields/<site>.geojson` from the radar time series. You can instead draw polygons by hand (for example in geojson.io) and save them there; polygons outside the site box are ignored with a warning.
- 05 deletes that site's old events, analysis and frames, so stale files cannot sit beside real data. Run 06 afterwards, then 08.
- Changing `sites.json` boxes or `frames.size` invalidates the cache automatically.

## Manual fallback in ASF Vertex

1. Open https://search.asf.alaska.edu and sign in. Set the dataset to NISAR and the product type to GCOV.
2. Draw the site box or paste its WKT (01 prints it on failure), search, and copy the file names and download URLs.
3. Create `pipeline/out/granules_<site>.csv` with the columns `date` (YYYY-MM-DD), `file_name` and `url`.
4. Continue from script 02.

Menu and button labels may differ slightly between Vertex versions.

## Files

- `common.py`: shared helpers and the rule-based phenology logic
- `h5util.py`: HDF5 open (streamed or local) and resampling onto the site grid, all paths read from config.yaml
- `cube.py`: cache key, file-name filters, and the loader used by 04 and 05
- `config.yaml`: HDF5 paths and analysis thresholds
- `sites.json`: sites, boxes, starter field polygons (used by demo sites), cultural dates
- `fields/<site>.geojson`: field polygons written by 04 or drawn by hand (override sites.json)
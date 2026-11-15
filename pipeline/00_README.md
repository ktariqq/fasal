# FASAL pipeline

Offline Python 3.10+ scripts that turn NISAR files into the static JSON and PNG the app reads.
Every script runs from the repo root, for example `python pipeline/01_search_nisar.py --help`.

## Two modes

- DEMO: `07_make_demo_data.py` writes synthetic data labelled `"data_mode": "demo"`. Needs no downloads.
- REAL: scripts 01 to 06 turn downloaded NISAR files into `"data_mode": "real"` data. Run `08_build_manifest.py` last in either mode.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r pipeline/requirements.txt
```

## Earthdata Login

1. Create a free account at https://urs.earthdata.nasa.gov.
2. If downloads answer 401 or 403 after you sign in, open "Applications" > "Authorized Apps" in your Earthdata profile and approve the ASF data access application (the exact name may differ).
3. Authenticate with ONE of:
   - Token (recommended): on your Earthdata profile choose "Generate Token", then
     `export EARTHDATA_TOKEN="paste-token-here"` (PowerShell: `$env:EARTHDATA_TOKEN=""`).
   - Username and password: set `EARTHDATA_USER` and `EARTHDATA_PASS` the same way.
   - `.netrc`: put `machine urs.earthdata.nasa.gov login YOUR_USER password YOUR_PASS` in `~/.netrc` (Windows: `~/_netrc`). Never commit it.

Searching (01) needs no login. Downloading (02) does.

## Run order (REAL)

```bash
python pipeline/01_search_nisar.py --sites punjab        # writes out/granules_punjab.csv
python pipeline/02_download.py --sites punjab --dry-run  # shows sizes, downloads nothing
python pipeline/02_download.py --sites punjab --limit 6 --max-gb 10
python pipeline/03_inspect_h5.py pipeline/out/data/punjab/<one file>.h5
# edit pipeline/config.yaml (h5 section) from what 03 printed
python pipeline/04_extract_timeseries.py --sites punjab
python pipeline/05_make_frames.py --sites punjab
python pipeline/06_derive_events.py --sites punjab
python pipeline/08_build_manifest.py
```

04 deletes that site's old demo events, analysis, and frames so stale demo files cannot sit beside real data. Run 05 and 06 afterwards, then 08.

## Manual fallback in ASF Vertex

1. Open https://search.asf.alaska.edu and sign in.
2. Set the dataset to NISAR and the product type / processing level to GCOV.
3. Draw the site box or paste its WKT (01 prints it on failure).
4. Search, note the acquisition dates, add scenes to the Downloads queue, and download them into `pipeline/out/data/<site>/`.
5. Create `pipeline/out/granules_<site>.csv` with at least the columns `date` (YYYY-MM-DD) and `file_name` (exact file name).
6. Continue from script 03.

Menu and button labels may differ slightly between Vertex versions.

## Files

- `common.py`: shared helpers and the rule-based phenology logic
- `h5util.py`: HDF5 helpers for 04 and 05, all paths read from config.yaml
- `config.yaml`: HDF5 paths and analysis thresholds
- `sites.json`: sites, boxes, starter field polygons, cultural dates
- `fields/<site>.geojson`: optional, your hand-drawn field polygons (override sites.json)
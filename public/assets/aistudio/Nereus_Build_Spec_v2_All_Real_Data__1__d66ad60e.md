# NEREUS: BUILD SPEC v2 (EVERY MODULE ON REAL DATA)

This version replaces the earlier spec. Build every module below end to end, on real satellite and ocean data, with working API calls. There are no demo layers, no roadmap cards and no synthetic data anywhere in this project.

You are a coding agent. Read this whole file. Write an implementation plan first, then build. Run everything you write. Verify the web app in a browser and take screenshots.

---

## 0. Product in one paragraph

**Nereus** is a satellite-powered ocean health watch for India's coasts. A Python pipeline pulls open satellite and ocean data from public APIs, runs transparent detection and trend algorithms, and writes small files into `web/data/`. A static web map (Leaflet) reads those files and shows eight signals: **oil slicks, algal blooms, sea-surface warming, coral heat stress, sea-level trend, ocean acidification, dark fishing-vessel leads, and floating-debris candidates**. Users: Indian Coast Guard, State Pollution Control Boards, fisheries departments, port authorities, coastal communities.

Event: ASTRA 2026 (ANTERiX Club, VIT Bhopal). Judging weights: working prototype 45, presentation 15, innovation 10, relevance 10, UI/UX 10, scalability 10.

## 1. Ground rules

1. **Real data only.** Every number on screen traces to a downloaded file or API response. No synthetic scenes, no made-up AIS, no placeholder charts. If a fetch fails, fall back to the **last successfully cached real download** in `cache/` (committed to the repo) and show "cached, last updated YYYY-MM-DD" in the UI.
2. **Truthful empty results.** If the latest scene has no oil slick, no bloom or no dark vessel, show "no detections in the latest scene" plus the scene date. That is a valid result. Never invent a detection to fill the map.
3. **Provenance on everything.** Every GeoJSON feature and every chart has `source`, `product_id`, `data_date` (acquisition or composite date), `processed_at`, and `cached` (true/false). The UI shows this in a "Data" popover. This replaces the old LIVE / DEMO / ROADMAP labels.
4. **Static deployment.** The browser only reads files in `web/data/`. No server, no database. Deploy on GitHub Pages or Netlify. A scheduled GitHub Action (section 9) refreshes the data so the site stays current.
5. **No secrets in the repo.** Credentials come from environment variables or GitHub Actions secrets. Provide `.env.example`.
6. **Science caveats stay.** These are accuracy statements, not demo labels. They must appear in the UI next to the result (section 3).
7. **Explainable algorithms.** Thresholds, statistics and classical image processing. No black-box ML.

## 2. Data source directory (links and what each gives you)

Verify each endpoint with a small test request before building on it. Names, versions and dataset IDs change over time.

| Signal | Source | What you get | Access | Link |
|---|---|---|---|---|
| Oil slicks, vessels | Copernicus Data Space, Sentinel Hub Process API | Sentinel-1 GRD, calibrated and orthorectified, as GeoTIFF | Free account + OAuth client | Docs: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Examples/S2L1C.html (Process API pattern); S1 GRD data page: https://documentation.v1.dataspace.copernicus.eu/APIs/SentinelHub/Data/S1GRD.html; S1 example requests: https://docs.sentinel-hub.com/api/latest/data/sentinel-1-grd/examples/ |
| Debris candidates | Same API | Sentinel-2 L2A bands (B04, B06, B08, B11, SCL cloud mask) | Same | https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Examples/S2L1C.html |
| Wind for false-alarm filter | Open-Meteo Historical and Forecast API | Hourly 10 m wind from ERA5 and weather models, no key | None (non-commercial, CC BY 4.0) | https://open-meteo.com/en/docs/historical-weather-api |
| Wind (Indian) | MOSDAC SCATSAT-1 and Oceansat-3 | Scatterometer winds and ocean-colour products | Free MOSDAC account; download API `mdapi` | API manual: https://mosdac.gov.in/node/2033; software: https://mosdac.gov.in/software/mdapi.zip; sign up: https://mosdac.gov.in/signup/; dataset browser: https://mosdac.gov.in/catalog/satellite.php |
| Blooms | NOAA CoastWatch ERDDAP, NASA MODIS-Aqua chlorophyll, 4 km, 8-day | Chlorophyll-a grids, subsettable by URL | None | Server: https://coastwatch.pfeg.noaa.gov/erddap/griddap/ ; near-real-time dataset page: https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1chla8day_R2022NRT ; science-quality: https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1chla8day_R202SQ.html |
| Blooms (Indian layer) | MOSDAC Oceansat-3 OCM (example product ID `E06OCM_L2C_AD`) | Indian ocean-colour products | MOSDAC account | https://mosdac.gov.in/node/2017 |
| Sea-surface warming | NOAA OISST v2.1 on ERDDAP, 0.25°, 1981 to now | Daily SST and SST anomaly | None | Final: https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.html ; near-real-time: https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21NrtAgg_LonPM180.html |
| Coral heat stress | NOAA Coral Reef Watch 5 km on ERDDAP (`NOAA_DHW`) | Degree Heating Weeks, 7-day bleaching alert level, SST, SST anomaly | None | https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.html ; monthly set (1985 onward): https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW_monthly.html ; product info: https://coralreefwatch.noaa.gov/product/5km/index.php |
| Sea level | Copernicus Marine, DUACS altimetry L4 (`SEALEVEL_GLO_PHY_L4_MY_008_047`, monthly dataset `cmems_obs-sl_glo_phy-ssh_my_allsat-l4-duacs-0.125deg_P1M-m`; includes SARAL/AltiKa among the missions) | Sea-level anomaly 1993 onward | Free account, `copernicusmarine` Python package | https://data.marine.copernicus.eu/product/SEALEVEL_GLO_PHY_L4_MY_008_047/services |
| Sea level cross-check | PSMSL tide gauges | Monthly mean sea level at Indian stations | None | https://psmsl.org/data/obtaining/ |
| Acidification | Copernicus Marine "Surface ocean carbon fields" (`MULTIOBS_GLO_BGC_CARBON_SURFACE_MYNRT_015_008`), variable `ph` (observation-based, monthly, 0.25°) | Surface pH on total scale | Free account | https://data.marine.copernicus.eu/product/MULTIOBS_GLO_BIO_CARBON_SURFACE_MYNRT_015_008 ; trend map: https://data.marine.copernicus.eu/product/GLOBAL_OMI_HEALTH_carbon_ph_trend/description |
| Dark vessels | Global Fishing Watch API v3, 4Wings, dataset `public-global-sar-presence:latest` (Sentinel-1 detections, with AIS match flag) | Vessel detections, filter `matched='false'` for unmatched ones | Free API token (non-commercial, attribution required) | https://globalfishingwatch.org/our-apis/documentation/docs/v3/4wings ; examples: https://globalfishingwatch.org/our-apis/documentation/docs/examples/report/report-example8 |
| Indian base layers | ISRO Bhuvan, Bhoonidhi, VEDAS | Coastline, thematic maps, Indian satellite catalogue | Account for some | https://bhuvan.nrsc.gov.in , https://bhoonidhi.nrsc.gov.in , https://vedas.sac.gov.in |
| Land mask and outlines | Natural Earth | Coastline and land polygons | None | https://www.naturalearthdata.com/downloads/ |

Credentials the human must create (give the human this checklist first):
1. Copernicus Data Space account, then an OAuth client in the Sentinel Hub dashboard: https://dataspace.copernicus.eu
2. Copernicus Marine account: https://data.marine.copernicus.eu
3. Global Fishing Watch API token: https://globalfishingwatch.org/our-apis/
4. MOSDAC account (optional, for the Indian wind and ocean-colour layers): https://mosdac.gov.in/signup/

NOAA ERDDAP and Open-Meteo need no account.

## 3. Science caveats (show these in the UI next to each result)

- **Oil:** SAR shows dark patches that may be oil. Say "possible slick". Look-alikes include low-wind areas, algal films and rain cells. Wind data reduces false alarms; it does not remove them.
- **Blooms:** chlorophyll above a threshold is a bloom risk indicator, not a toxin test. Turbid coastal water can read falsely high.
- **Acidification:** the pH product is observation-based (reconstructed from measurements and satellite-linked variables), not a direct measurement from space.
- **Sea level:** altimetry trends are regional means; tide-gauge trends also include land movement.
- **Dark vessels:** a detection with no AIS match is a lead for review, not proof of illegal fishing. Some vessels have no AIS for legitimate reasons, and detection coverage depends on Sentinel-1 passes.
- **Debris:** floating-debris indices respond to seaweed, foam, sun glint and ships as well as plastic. Results are candidates only.

## 4. Repository layout

```
nereus/
├── README.md
├── .env.example
├── requirements.txt
├── .github/workflows/refresh.yml     # scheduled data refresh (section 9)
├── pipeline/
│   ├── config.py                     # regions, watch areas, thresholds, dataset IDs, paths
│   ├── common/                       # http client with retries, caching, provenance writer, geo helpers, land mask
│   ├── oil/  bloom/  sst/  coral/  sealevel/  acidification/  vessels/  debris/
│   └── run_all.py
├── cache/                            # last successful real downloads (small, committed)
├── web/                              # the deployed static site
│   ├── index.html  css/  js/  vendor/
│   └── data/                         # pipeline outputs; manifest.json lists every layer + provenance
├── docs/                             # methods.md, demo_script.md, screenshots
└── tests/
```

**Stack:** Python 3.11+ with `numpy`, `scipy`, `scikit-image`, `rasterio`, `shapely`, `geopandas`, `xarray`, `netCDF4`, `pandas`, `requests`, `copernicusmarine`, `python-dotenv`, `matplotlib`. Frontend: plain HTML/CSS/ES modules, **Leaflet** and **Chart.js**, vendored locally in `web/vendor/` so the site works offline (map tiles aside, with a bundled coastline fallback).

Each module exposes `run(config) -> dict`, writes its files into `web/data/`, registers itself in `manifest.json`, and never lets its failure stop the others (catch, log, fall back to cache).

## 5. API recipes (copy-adapt, then test)

### 5.1 Copernicus Data Space: token, then Sentinel-1 via the Process API

```python
import os, requests
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

def cdse_token():
    r = requests.post(TOKEN_URL, data={
        "grant_type": "client_credentials",
        "client_id": os.environ["CDSE_CLIENT_ID"],
        "client_secret": os.environ["CDSE_CLIENT_SECRET"]}, timeout=60)
    r.raise_for_status()
    return r.json()["access_token"]

EVALSCRIPT_S1 = """
//VERSION=3
function setup() {
  return { input: ["VV", "dataMask"], output: { bands: 2, sampleType: "FLOAT32" } };
}
function evaluatePixel(s) { return [s.VV, s.dataMask]; }
"""

def fetch_s1(bbox, t_from, t_to, width=2000, height=2000):
    body = {
      "input": {
        "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
        "data": [{
          "type": "sentinel-1-grd",
          "dataFilter": {"timeRange": {"from": t_from, "to": t_to},
                         "acquisitionMode": "IW", "polarization": "DV", "resolution": "HIGH"},
          "processing": {"orthorectify": "true", "backCoeff": "SIGMA0_ELLIPSOID",
                         "demInstance": "COPERNICUS_30"}}]},
      "output": {"width": width, "height": height,
                 "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}]},
      "evalscript": EVALSCRIPT_S1}
    r = requests.post(PROCESS_URL, json=body,
                      headers={"Authorization": f"Bearer {cdse_token()}"}, timeout=300)
    r.raise_for_status()
    return r.content   # GeoTIFF bytes: band 1 = sigma0 VV (linear), band 2 = data mask
```

Notes: the Process API returns data for the acquisitions inside the time range, mosaicked. Use a narrow time window (about 1 day) around a single acquisition so the result is one scene. To find acquisition times and avoid empty requests, use the Sentinel Hub Catalog (STAC) endpoint on the same host, or the Copernicus catalogue search; read the docs at https://documentation.dataspace.copernicus.eu/ for the current catalogue URL before coding it. If a bounding box is large, tile it. Check the processing-unit quota in the dashboard.

### 5.2 Sentinel-2 for debris candidates

Same endpoint with `"type": "sentinel-2-l2a"`, evalscript inputs `["B04","B06","B08","B11","SCL","dataMask"]`, output `FLOAT32`. Mask clouds, shadows and land using `SCL`. Compute FDI per Biermann et al. (2020, Scientific Reports, "Finding Plastic Patches in Coastal Waters using Optical Satellite Data"); read the paper to confirm the exact formula and wavelengths before coding it. Also compute NDVI to separate vegetation-like floating matter.

### 5.3 NOAA ERDDAP (no account): chlorophyll, SST, coral

ERDDAP builds data URLs as `https://coastwatch.pfeg.noaa.gov/erddap/griddap/<datasetID>.<fileType>?<variable>[(time)][(lat range)][(lon range)]`. Always open the dataset's `.html` page or `.das` to confirm the variable name, dimension order and latest time before writing the query. Use `[(last)]` for the latest time.

```python
import io, pandas as pd, requests
ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap"

# Coral: DHW and 7-day alert level at one reef point (latest day)
def coral_point(lat, lon):
    q = f"{ERDDAP}/NOAA_DHW.csv?CRW_DHW[(last)][({lat})][({lon})],CRW_BAA_7D_MAX[(last)][({lat})][({lon})]"
    r = requests.get(q, timeout=120); r.raise_for_status()
    return pd.read_csv(io.StringIO(r.text), skiprows=[1])   # row 2 holds units

# SST: OISST daily over the Indian Ocean box, sst and anomaly. Dimensions: time, zlev, latitude, longitude.
def oisst_chunk(start, end, lat0=0, lat1=30, lon0=60, lon1=100):
    q = (f"{ERDDAP}/ncdcOisst21Agg_LonPM180.csv?"
         f"sst[({start}):1:({end})][(0.0):1:(0.0)][({lat0}):1:({lat1})][({lon0}):1:({lon1})],"
         f"anom[({start}):1:({end})][(0.0):1:(0.0)][({lat0}):1:({lat1})][({lon0}):1:({lon1})]")
    r = requests.get(q, timeout=600); r.raise_for_status()
    return pd.read_csv(io.StringIO(r.text), skiprows=[1])

# Chlorophyll: MODIS-Aqua 8-day. Confirm variable name (likely "chlorophyll") and dimension order on the dataset page.
def chl_subset(date_iso, lat0=5, lat1=25, lon0=65, lon1=95, dataset="erdMH1chla8day_R2022NRT"):
    q = f"{ERDDAP}/{dataset}.nc?chlorophyll[({date_iso})][({lat0}):1:({lat1})][({lon0}):1:({lon1})]"
    r = requests.get(q, timeout=600); r.raise_for_status()
    return r.content   # NetCDF bytes; read with xarray
```

Practical limits: ERDDAP slows or refuses very long time ranges in one request. Fetch OISST in chunks of up to about 9 years and join locally. Dataset IDs for MODIS chlorophyll change between processing versions (`erdMH1chla8day_R2022NRT` for near-real-time, `erdMH1chla8day_R202SQ` for science quality); discover the current one at runtime with ERDDAP search: `https://coastwatch.pfeg.noaa.gov/erddap/search/index.json?searchFor=chlorophyll+aqua+modis+8day`. Choose the dataset whose latest time is most recent.

Coral heat-stress thresholds (NOAA): DHW of 4 °C-weeks means significant bleaching is likely; 8 °C-weeks means widespread bleaching and significant mortality are expected. Alert levels: 0 no stress, 1 watch, 2 warning, 3 alert level 1, 4 alert level 2.

### 5.4 Copernicus Marine: sea level and pH

```python
import copernicusmarine as cm
# Credentials: env COPERNICUSMARINE_SERVICE_USERNAME / COPERNICUSMARINE_SERVICE_PASSWORD (check current toolbox docs for exact names)

# Discover current dataset IDs and variables first:
#   copernicusmarine describe --contains SEALEVEL_GLO_PHY_L4_MY_008_047
#   copernicusmarine describe --contains MULTIOBS_GLO_BGC_CARBON_SURFACE

sl = cm.open_dataset(
    dataset_id="cmems_obs-sl_glo_phy-ssh_my_allsat-l4-duacs-0.125deg_P1M-m",
    variables=["sla"],
    minimum_longitude=60, maximum_longitude=100,
    minimum_latitude=0, maximum_latitude=30)

# pH: use describe to get the monthly dataset id, then variable "ph"
ph = cm.open_dataset(dataset_id="<from describe>", variables=["ph"],
    minimum_longitude=60, maximum_longitude=100, minimum_latitude=0, maximum_latitude=30)
```

The multi-year sea-level dataset has a finite end date; check its temporal coverage and, if recent months are needed, also use the near-real-time sea-level product (`SEALEVEL_GLO_PHY_L4_NRT_008_046`) and say which period each part of the chart comes from.

### 5.5 Global Fishing Watch: SAR detections with no AIS match

```python
import os, requests
GFW = "https://gateway.api.globalfishingwatch.org/v3/4wings/report"
HDR = {"Authorization": f"Bearer {os.environ['GFW_API_TOKEN']}", "Content-Type": "application/json"}
params = {
  "spatial-resolution": "HIGH", "temporal-resolution": "DAILY",
  "datasets[0]": "public-global-sar-presence:latest",
  "date-range": "2026-10-01,2026-11-15", "format": "JSON",
  "filters[0]": "matched='false'"}      # unmatched = no AIS match
body = {"geojson": {"type": "Polygon", "coordinates": [[[68,6],[68,24],[78,24],[78,6],[68,6]]]}}
r = requests.post(GFW, params=params, headers=HDR, json=body, timeout=300)
```

The documented examples use a `region` dataset ID in the body; read the "Create a report of a specified region" page and its examples (links in section 2) to confirm the accepted body for a custom polygon, then adapt. Response entries contain `date`, `detections`, `lat`, `lon`. Also query `filters[0]=matched='true'` to compute the share of detections that match AIS. Use the official Python client (`gfw-api-python-client`) if simpler. Attribution to Global Fishing Watch is required in the UI.

### 5.6 Wind (false-alarm filter)

```python
def wind_ms(lat, lon, start_date, end_date):
    # Archive has a short delay; for very recent scenes use https://api.open-meteo.com/v1/forecast with past_days.
    r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
        "latitude": lat, "longitude": lon, "start_date": start_date, "end_date": end_date,
        "hourly": "wind_speed_10m", "wind_speed_unit": "ms"}, timeout=60)
    r.raise_for_status()
    return r.json()["hourly"]     # {"time": [...], "wind_speed_10m": [...]}
```

Take the hour nearest the Sentinel-1 acquisition time. If the MOSDAC account is available, also fetch SCATSAT-1 winds with the `mdapi` tool (manual in section 2) and prefer them when they cover the scene; credit ISRO/MOSDAC.

### 5.7 MOSDAC (Indian data layer, optional but credited)

Download `mdapi.zip`, edit `config.json` with the product `datasetId` from the catalogue (for example an Oceansat-3 OCM product such as `E06OCM_L2C_AD`), your credentials and a bounding box and dates, then run `mdapi.py`. There is a limit of 5000 files per day per user. Read the NetCDF/HDF output with `xarray`. If a given product does not return data for your region and dates, say so in the data popover and keep NOAA/NASA chlorophyll as the main bloom layer.

## 6. Modules

### 6.1 Oil slick detection (Sentinel-1)

- **Watch areas (config):** Mumbai / Gulf of Khambhat, Kandla-Mundra shipping lanes, Kochi, Chennai / Ennore, Visakhapatnam, Paradip, Sagar (Hooghly mouth), Mangaluru. Each is a bounding box of roughly 100 x 100 km.
- **Two run modes, both real:**
  1. **Latest scan:** for each watch area, find Sentinel-1 acquisitions from the last N days (config, default 14), process the most recent per area, report detections or "no detections".
  2. **Historical validation cases:** process archive scenes of documented spills so the map always has verified examples. Try, in order: the January 2017 Ennore / Kamarajar port (Chennai) spill; the August 2020 MV Wakashio spill off Mauritius; the October 2021 Orange County spill. Verify that a usable Sentinel-1 scene exists for each; use any that work, and show them under the label **"Historical validation case"** with the event name and date. They are real satellite data, not demo data.
- **Algorithm:**
  1. Linear sigma0 to dB: `10*log10(max(x, 1e-6))`; mask using the data-mask band.
  2. Speckle reduction: Lee filter (`scipy.ndimage`), or a median filter as fallback.
  3. Land mask from Natural Earth, buffered a few pixels; mask near-shore strip.
  4. Dark-pixel segmentation: per-tile adaptive threshold `local_mean - k*local_std` (window and `k` in config), with Otsu as a comparison.
  5. Morphological opening and closing; drop regions below a minimum area (km², config).
  6. Region features: area, perimeter, elongation, mean contrast against surrounding sea.
  7. Wind check (5.6): keep candidates only when wind is within the configured range (about 2 to 10 m/s, config); lower-confidence otherwise.
  8. Confidence `low / medium / high` from a documented rule on contrast, size, shape and wind.
  9. Vectorise to GeoJSON polygons.
- **Output:** `oil_events.geojson` (properties: `id`, `type`, `detected_at`, `area_km2`, `elongation`, `confidence`, `wind_ms`, `wind_source`, `case_type` = `latest_scan` or `historical_validation`, plus provenance and the caveat text) and a downsampled georeferenced SAR preview PNG per scene.

### 6.2 Algal bloom / phytoplankton (chlorophyll)

- **Data:** MODIS-Aqua chlorophyll via ERDDAP (5.3), over the Arabian Sea, Bay of Bengal and Indian coastal waters. Latest 8-day composite plus a multi-year climatology for the same period (build it from the science-quality dataset, cache the result).
- **Algorithm:** work in `log10(chl)`. Flag cells where chlorophyll exceeds a fixed threshold (config) or where the log anomaly exceeds the climatology by 2 standard deviations. Remove shallow turbid pixels with a distance-from-coast or bathymetry mask (config). Polygonise, then compute area, mean and max chlorophyll and anomaly in sigma.
- **Output:** `bloom_events.geojson` plus a colour-mapped transparent overlay PNG with bounds in the manifest. Optional Indian overlay from Oceansat-3 OCM if MOSDAC data is available.

### 6.3 Sea-surface warming trend

- **Data:** OISST (5.3) for a box around India. Fetch 1982 to present in chunks, cache the aggregates.
- **Compute:** monthly mean, anomaly versus a 1991 to 2020 climatology, annual means, linear trend in °C per decade (`scipy.stats.linregress`), last-12-month anomaly, and a latest-anomaly map overlay.
- **Output:** `sst_trend.json` and an anomaly overlay PNG. UI: line chart of annual anomaly with trend line and one headline number.

### 6.4 Coral heat stress

- **Reef points** (`pipeline/reefs.geojson`, approximate coordinates, stated as approximate): Gulf of Mannar, Gulf of Kutch (Marine National Park), Lakshadweep atolls (Kavaratti, Agatti, Bangaram), Andaman (Havelock/Swaraj Dweep, Mahatma Gandhi Marine National Park, Wandoor), Nicobar sites.
- **Compute:** latest DHW, 7-day alert level, SST and SST anomaly per point (5.3), plus a 90-day DHW history for a sparkline.
- **Output:** `coral_alerts.geojson` and a table. Colour by alert level using the NOAA thresholds in 5.3.

### 6.5 Sea-level trend

- **Data:** DUACS monthly sea-level anomaly (5.4) for Indian coastal and offshore points (Mumbai, Kochi, Chennai, Visakhapatnam, Kolkata/Sagar, Andaman, Lakshadweep). Cross-check against PSMSL tide gauges at the nearest stations.
- **Compute:** linear trend in mm per year with standard error, period used, and a monthly series per point for the chart.
- **Output:** `sealevel_trend.json` with satellite and tide-gauge trends side by side.

### 6.6 Ocean acidification

- **Data:** Copernicus Marine surface pH product (5.4), variable `ph`, Indian Ocean box, monthly.
- **Compute:** pH time series for the Arabian Sea and Bay of Bengal boxes, linear trend per decade, latest-month pH map and anomaly versus climatology. Cross-reference the official global pH trend map product for context.
- **Output:** `acidification.json` and a pH overlay PNG. UI shows the trend chart and the caveat from section 3.

### 6.7 Dark fishing-vessel leads

- **Primary:** Global Fishing Watch SAR detections with `matched='false'` (5.5) over the Indian EEZ region and the Bay of Bengal and Arabian Sea fishing grounds, last N days, plus the matched/unmatched share.
- **Secondary (own detection, same Sentinel-1 scenes as 6.1):** detect bright point targets on the sea with a simple CFAR-style test (pixel far above the local sea background), cluster into ship candidates, estimate length from blob size. Report as "radar-detected ships in the scene".
- **Output:** `vessels.geojson` (properties: `date`, `detections`, `ais_matched`, `source`, provenance, caveat text) and a summary card (unmatched count, share unmatched, period).

### 6.8 Floating-debris candidates

- **Data:** Sentinel-2 L2A (5.2) over river-mouth and harbour coastal areas: Thane Creek / Mumbai, Hooghly mouth, Chennai (Adyar/Cooum/Ennore), Kochi / Vembanad, Gulf of Khambhat. Use the least cloudy recent scenes.
- **Algorithm:** mask land, cloud and shadow with `SCL`; compute FDI and NDVI; flag connected pixel groups above the configured FDI threshold and above a minimum cluster size; remove clusters that look like ships (very elongated, extremely bright) using a documented rule.
- **Output:** `debris_candidates.geojson` with cluster area, mean FDI, mean NDVI and scene date. If no candidates pass, show "no candidate aggregations in the latest clear scene, date X". Never show plastic as a confirmed finding.

## 7. Frontend

**Layout:** full-height map; left rail with layer list and a "Data" popover per layer (source, product ID, data date, processed-at, cached flag); right panel for details and charts; top bar with the Nereus wordmark and a "Method" link.

**Interactions**
1. India-centred map, layer toggles for the eight signals, each with data date shown.
2. Click any polygon or marker: detail panel with values, confidence, provenance and the caveat text.
3. Alerts list of everything currently flagged (sortable by date and area); clicking flies the map to it.
4. Trends tab: SST warming chart, sea-level table/chart (satellite vs tide gauge), acidification pH chart, coral alert table.
5. Vessel summary card and the historical-validation oil cases with a before/after slider (SAR preview vs detection outline).
6. "Method and data" page: per module algorithm, parameters, limits and credits.
7. Export visible events as GeoJSON; print stylesheet for a one-page summary.
8. Responsive down to 390 px; keyboard accessible; contrast at least 4.5:1.

**Performance:** under 3 seconds first load; simplified GeoJSON; overlay PNGs under 1.5 MB each.

**Visual design (anti-slop):** deep-ocean observatory look.
- Palette only: `#04121F` deep ocean (dominant), `#0A2A3A` panels, `#FF5A3C` signal coral (the one accent: alerts and selection), `#7FE0D0` sea foam (data layers only), `#E8F1F2` text, `#7C94A0` muted.
- Fonts: Bricolage Grotesque (headings), Instrument Sans (body), IBM Plex Mono (numbers, tags). Banned as primary face: Inter, Roboto, Arial, Calibri, Helvetica.
- Banned: accent lines under headings, decorative colour bars, drop shadows on cards, cards inside cards, gradient text, glow, emoji, icon-per-list-item, stock photos, scattered hover animations, purple-blue gradients.
- Banned words in UI copy: revolutionary, cutting-edge, seamless, leverage, empower, unlock, game-changing, delve.
- No process leaks: no lorem ipsum, no TODO text, no "generated by" notes.

## 8. Credentials and caching

| Variable | For |
|---|---|
| `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` | Sentinel-1 and Sentinel-2 via Process API |
| `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD` | sea level and pH |
| `GFW_API_TOKEN` | dark-vessel detections |
| `MOSDAC_USERNAME`, `MOSDAC_PASSWORD` | optional Indian layers |

After every successful fetch, save the minimal raw input and the processed output to `cache/` (keep files small; compress; use a download script instead of committing anything large). A missing credential or failed call must produce a clear log line and a cache fallback, never a crash.

## 9. Keeping it current

Add `.github/workflows/refresh.yml`: run the pipeline on a schedule (daily), using repository secrets for the credentials, commit updated `web/data/` and `cache/`, and let GitHub Pages redeploy. Show the last-refresh time in the top bar.

## 10. Documentation

- `README.md`: description, screenshot, run steps, local serve (`python -m http.server` in `web/`), deployment, credentials table, data credits, limitations.
- `docs/methods.md`: algorithm, parameters and false-positive sources per module.
- `docs/demo_script.md`: a 60-second click-by-click demo and a 2-minute version for the video.
- Comment every threshold with why it has that value.
- **Credits** in the UI and README: ESA Copernicus Sentinel data; NASA Ocean Biology Processing Group and NOAA CoastWatch; NOAA NCEI (OISST); NOAA Coral Reef Watch; E.U. Copernicus Marine Service Information; PSMSL; Global Fishing Watch; Open-Meteo (CC BY 4.0); ISRO MOSDAC, Bhuvan, Bhoonidhi, VEDAS where used; Natural Earth.

## 11. Acceptance tests (all must pass before you report done)

1. `python pipeline/run_all.py` completes with credentials and with none (cache fallback), and writes `manifest.json` plus one output per module.
2. Every feature and chart carries provenance fields; every UI number traces to a file in `web/data/`.
3. `git grep -i -E "synthetic|make_demo|fake|placeholder data|lorem"` returns nothing in code or data.
4. The browser console shows no errors; all eight layers toggle on and off; the Data popover works.
5. At least one oil polygon (latest scan or historical validation case) visibly overlays the dark patch in its SAR preview (screenshot).
6. Each module's output was produced by a real API call logged with URL and timestamp in `pipeline/logs/`.
7. Empty-result path works: force an empty detection and confirm the UI says "no detections in the latest scene, date X".
8. No layout overflow at 1440, 1024 and 390 px (screenshots).
9. No banned fonts, no emoji, no secrets in the repo (`git grep` for key patterns).
10. README steps work from a clean clone.

## 12. Build order

Build in this order and run each tier before starting the next, because the time is short and a working smaller product beats a broken larger one.

1. **Tier 1:** shared HTTP client, caching and provenance writer; manifest; map shell with layer toggles and Data popover; coral (simplest, one ERDDAP call per point); SST trend.
2. **Tier 2:** bloom (ERDDAP chlorophyll) and sea level and acidification (Copernicus Marine).
3. **Tier 3:** oil (Sentinel-1 via Process API, historical validation case first so the map has a verified polygon early, then the latest scan) and dark vessels (GFW).
4. **Tier 4:** debris candidates (Sentinel-2), Indian MOSDAC layers, scheduled refresh workflow, before/after slider, export and print.

## 13. First steps

1. Read this file fully. Do not code yet.
2. Output a plan: tasks per tier, the first test request you will run against each data source, and the questions you need the human to answer (credentials, final watch areas, which historical oil case to feature).
3. Wait for approval.
4. Test every endpoint in section 5 with a minimal request and write down what you actually got back (dataset IDs, variable names, latest dates). Update `config.py` from those real responses.
5. Build tier by tier, run each module, inspect outputs visually, then wire the frontend to the real files.
6. When finished, report per module: what real data it used, the data date, any cache fallbacks, and any detection result that came back empty.

*Verified against public documentation on 22 November 2026. Dataset IDs, versions and endpoint URLs change; the test-first step in section 13 is mandatory.*

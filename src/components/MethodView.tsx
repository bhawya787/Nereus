import { useState } from 'react';
import type { HistoricalOilCase, NereusDataset } from '../types/nereus';

interface MethodViewProps {
  data: NereusDataset;
  initialCaseId?: string | null;
}

const MODULE_METHODS = [
  {
    name: '01. Oil Slick Detection (Sentinel-1 SAR)',
    algo: 'Linear σ0 VV backscatter converted to dB, speckle-filtered (Lee / median), coastline-masked with Natural Earth 50m, segmented via adaptive local threshold (μ − k·σ), and filtered by Open-Meteo / SCATSAT-1 10m wind window (2–10 m/s).',
    limits: 'Low-wind slick look-alikes (< 2 m/s), biogenic algal films, and convective rain cells attenuate C-band Bragg waves similarly to mineral oil.',
  },
  {
    name: '02. Algal Blooms (NOAA-20 VIIRS Chlorophyll-a)',
    algo: 'Operates in log10(chlor_a) across 4 km 8-day composites; flags clusters exceeding 1.8 mg/m³ or +1.8σ above the Indian basin logarithmic baseline.',
    limits: 'Chlorophyll-a is a biomass risk proxy, not a toxin assay. High suspended sediment in shallow estuaries can inflate optical reflectance.',
  },
  {
    name: '03. Sea-Surface Warming (NOAA CRW + Marine SST)',
    algo: 'Compares 5 km daily SST against the NOAA Coral Reef Watch climatology and computes ordinary least-squares linear warming (°C/decade) across multi-decadal records.',
    limits: 'Skin/foundation temperature composites smooth sub-5 km coastal upwelling filaments.',
  },
  {
    name: '04. Coral Heat Stress (NOAA Coral Reef Watch)',
    algo: 'Tracks Degree Heating Weeks (DHW, accumulated positive thermal anomalies over 12 weeks) and 7-day Bleaching Alert Area levels (0–4) at seven Indian reef coordinates.',
    limits: 'Reef monitoring coordinates are approximate 5 km grid centers and do not resolve micro-lagoon shading or local water depth.',
  },
  {
    name: '05. Sea-Level Trend (PSMSL + Copernicus DUACS)',
    algo: 'Computes linear sea-level rate (mm/yr ± standard error) from PSMSL Revised Local Reference monthly tide-gauge series alongside DUACS satellite altimetry when CMEMS credentials are configured.',
    limits: 'Tide gauges measure relative sea level including local vertical land subsidence or uplift, whereas altimetry measures geocentric sea surface height.',
  },
  {
    name: '06. Ocean Acidification (Copernicus Surface Carbon)',
    algo: 'Subsets observation-based monthly 0.25° surface ocean pH reconstructions (total scale) over the Arabian Sea and Bay of Bengal.',
    limits: 'Surface pH is an empirical reconstruction from in-situ pCO2 and satellite SST/salinity/chlorophyll predictors, not a direct spaceborne measurement.',
  },
  {
    name: '07. Dark Fishing-Vessel Leads (GFW 4Wings + CFAR)',
    algo: 'Queries Global Fishing Watch SAR vessel presence filtered by matched=false (no AIS broadcast) and compares against total SAR detections.',
    limits: 'Unmatched detections are leads for maritime verification only; small artisanal craft legally operate without Class-A AIS transponders.',
  },
  {
    name: '08. Floating-Debris Candidates (Sentinel-2 L2A)',
    algo: 'Selects clear scenes (cloud cover < 25%) via Copernicus STAC, masks cloud/land with SCL, and evaluates Floating Debris Index (FDI) paired with NDVI to isolate non-vegetated aggregations.',
    limits: 'Sargassum seaweed, whitecaps, sun glint, and vessel wakes produce elevated FDI responses; outputs are strictly candidates.',
  },
];

const CREDITS = [
  'ESA Copernicus Sentinel-1 GRD & Sentinel-2 L2A (Copernicus Data Space Ecosystem)',
  'NOAA CoastWatch & NOAA-20 VIIRS Ocean Color (Chlorophyll-a)',
  'NOAA Coral Reef Watch 5 km (PacIOOS / NOAA CoastWatch ERDDAP)',
  'Permanent Service for Mean Sea Level (PSMSL RLR Tide Gauges)',
  'E.U. Copernicus Marine Service Information (DUACS Altimetry & Surface Carbon)',
  'Global Fishing Watch API v3 (4Wings SAR Presence)',
  'Open-Meteo Marine & ERA5 Historical Weather API (CC BY 4.0)',
  'Natural Earth 50m Coastline & Land Polygons',
];

export function MethodView({ data, initialCaseId }: MethodViewProps) {
  const cases = data.historical_oil_cases;
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    initialCaseId && cases.some((c) => c.id === initialCaseId)
      ? initialCaseId
      : (cases[0]?.id ?? '')
  );
  const [sliderPct, setSliderPct] = useState<number>(52);

  const activeCase: HistoricalOilCase | undefined =
    cases.find((c) => c.id === selectedCaseId) ?? cases[0];

  // Normalize outline polygon coordinates into an SVG 0..100 box for visual overlay
  const renderOutlinePolygon = (poly: number[][]) => {
    if (!poly.length) return '';
    const lons = poly.map((p) => p[0]);
    const lats = poly.map((p) => p[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const spanLon = maxLon - minLon || 0.01;
    const spanLat = maxLat - minLat || 0.01;

    return poly
      .map(([lon, lat]) => {
        const x = 22 + ((lon - minLon) / spanLon) * 56;
        const y = 78 - ((lat - minLat) / spanLat) * 56;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <div className="pb-5 border-b nereus-divider">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Methodology, Validation & Provenance
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Explainable remote-sensing thresholds, real historical Sentinel-1 validation cases, and live pipeline audit logs.
        </p>
      </div>

      {/* Interactive Before/After Historical Validation Comparison */}
      {activeCase && (
        <section aria-labelledby="sar-compare-heading" className="nereus-surface p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="sar-compare-heading" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Historical Validation Case — SAR Quicklook vs. Slick Outline
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Drag the divider to compare the Copernicus Sentinel-1 backscatter quicklook against the extracted dark-patch perimeter.
              </p>
            </div>

            <div className="flex items-center gap-2" role="group" aria-label="Historical validation case selector">
              {cases.map((hc) => {
                const active = hc.id === activeCase.id;
                return (
                  <button
                    key={hc.id}
                    type="button"
                    onClick={() => setSelectedCaseId(hc.id)}
                    className="px-3 py-1.5 text-xs font-medium cursor-pointer"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: active ? 'var(--accent-coral)' : 'var(--surface-inset)',
                      color: active ? '#04121F' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'var(--accent-coral)' : 'var(--border-hairline)'}`,
                    }}
                  >
                    {hc.event_date} · {hc.id.includes('ennore') ? 'Ennore' : 'Wakashio'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Before / After Slider Frame */}
            <div className="lg:col-span-7 space-y-3">
              <div
                className="relative w-full h-72 sm:h-80 overflow-hidden nereus-inset select-none"
                data-testid="sar-comparison-stage"
              >
                {/* Base Layer (Right / After): Detection Outline over SAR */}
                <div className="absolute inset-0 flex items-center justify-center bg-[#04121F]">
                  {activeCase.thumbnail_url && (
                    <img
                      src={activeCase.thumbnail_url}
                      alt={`${activeCase.title} Sentinel-1 SAR quicklook`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover opacity-55"
                    />
                  )}
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full"
                    aria-label="Extracted slick detection polygon"
                  >
                    <polygon
                      points={renderOutlinePolygon(activeCase.outline_polygon)}
                      fill="rgba(255, 90, 60, 0.28)"
                      stroke="#FF5A3C"
                      strokeWidth="0.9"
                    />
                  </svg>
                  <span
                    className="absolute bottom-3 right-3 px-2 py-1 text-[11px] font-data"
                    style={{ backgroundColor: 'rgba(4,18,31,0.88)', color: 'var(--accent-coral)' }}
                  >
                    Detection Mask ({activeCase.area_km2} km²)
                  </span>
                </div>

                {/* Top Clipped Layer (Left / Before): Raw Sentinel-1 SAR Quicklook */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPct}% 0 0)` }}
                >
                  {activeCase.thumbnail_url ? (
                    <img
                      src={activeCase.thumbnail_url}
                      alt={`${activeCase.title} raw Copernicus Sentinel-1 scene`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-data" style={{ color: 'var(--text-muted)' }}>
                      SAR Quicklook unavailable
                    </div>
                  )}
                  <span
                    className="absolute bottom-3 left-3 px-2 py-1 text-[11px] font-data"
                    style={{ backgroundColor: 'rgba(4,18,31,0.88)', color: 'var(--data-seafoam)' }}
                  >
                    Copernicus Sentinel-1 Quicklook
                  </span>
                </div>

                {/* Vertical Divider Handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
                  style={{ left: `${sliderPct}%`, backgroundColor: 'var(--text-primary)' }}
                />
              </div>

              <label className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="shrink-0 font-data">SAR Scene</span>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={sliderPct}
                  onChange={(e) => setSliderPct(Number(e.target.value))}
                  aria-label="Comparison split percentage between SAR image and detection outline"
                  className="w-full accent-[#FF5A3C] cursor-pointer"
                />
                <span className="shrink-0 font-data">Detection Mask</span>
              </label>
            </div>

            {/* Metadata & Provenance Column */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {activeCase.title}
                </h3>
                <p className="text-xs font-data mt-1" style={{ color: 'var(--text-muted)' }}>
                  {activeCase.location} · {activeCase.event_date}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3 py-3 border-y nereus-divider text-xs">
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Slick Area</dt>
                  <dd className="text-base font-data tabular-nums mt-0.5">{activeCase.area_km2.toFixed(1)} km²</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Elongation</dt>
                  <dd className="text-base font-data tabular-nums mt-0.5">{activeCase.elongation.toFixed(1)} L/W</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>ERA5 Wind (10m)</dt>
                  <dd className="text-base font-data tabular-nums mt-0.5">{activeCase.wind_ms.toFixed(1)} m/s</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Confidence</dt>
                  <dd className="text-base font-data mt-0.5 capitalize">{activeCase.confidence}</dd>
                </div>
              </dl>

              <div className="text-xs space-y-1.5">
                <div className="font-data break-all" style={{ color: 'var(--data-seafoam)' }}>
                  Product: {activeCase.scene_id}
                </div>
                <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {activeCase.caveat}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Algorithm Specifications */}
      <section aria-labelledby="algorithms-heading" className="space-y-4">
        <h2 id="algorithms-heading" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Transparent Detection & Trend Algorithms
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULE_METHODS.map((m) => (
            <article key={m.name} className="nereus-surface p-4 space-y-2">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {m.name}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {m.algo}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Limit: {m.limits}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Pipeline Execution Logs + Scientific Credits */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 nereus-surface p-5 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Latest Pipeline Fetch Log
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.logs.map((log, i) => (
              <div key={`${log.module}-${i}`} className="nereus-inset p-2.5 text-xs space-y-0.5">
                <div className="flex items-center justify-between font-data">
                  <span style={{ color: 'var(--data-seafoam)' }}>
                    {log.module.toUpperCase()} · {log.status}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {log.timestamp.slice(0, 19).replace('T', ' ')}Z
                  </span>
                </div>
                <div className="font-data truncate" style={{ color: 'var(--text-muted)' }}>
                  {log.url}
                </div>
                <div style={{ color: 'var(--text-primary)' }}>{log.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 nereus-surface p-5 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Open Data Sources & Credits
          </h2>
          <ul className="space-y-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {CREDITS.map((credit) => (
              <li key={credit} className="pb-2 border-b nereus-divider last:border-b-0 last:pb-0">
                {credit}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

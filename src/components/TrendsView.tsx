import { useState } from 'react';
import type { NereusDataset } from '../types/nereus';
import { linearRegression } from '../utils/nereusMath';

interface TrendsViewProps {
  data: NereusDataset;
}

export function TrendsView({ data }: TrendsViewProps) {
  const [selectedStationId, setSelectedStationId] = useState<string>(
    data.sealevel_stations[0]?.id ?? ''
  );
  const [hoverSstIdx, setHoverSstIdx] = useState<number | null>(null);

  const sstSeries = data.sst_trend.annual_series;
  const activeStation =
    data.sealevel_stations.find((s) => s.id === selectedStationId) ?? data.sealevel_stations[0];

  // SST Chart SVG math
  const sstW = 680;
  const sstH = 220;
  const padL = 46;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = sstW - padL - padR;
  const plotH = sstH - padT - padB;

  const sstVals = sstSeries.map((p) => p.value);
  const sstMin = Math.min(-0.6, ...(sstVals.length ? sstVals : [0]));
  const sstMax = Math.max(1.2, ...(sstVals.length ? sstVals : [1]));
  const sstSpan = sstMax - sstMin || 1;
  const yZero = padT + ((sstMax - 0) / sstSpan) * plotH;

  const sstReg = linearRegression(
    sstSeries.map((p, i) => ({ x: i, y: p.value }))
  );
  const trendY0 =
    padT + ((sstMax - sstReg.intercept) / sstSpan) * plotH;
  const trendY1 =
    padT +
    ((sstMax - (sstReg.intercept + sstReg.slope * Math.max(1, sstSeries.length - 1))) / sstSpan) *
      plotH;

  // Sea-level station SVG math
  const slSeries = activeStation?.series ?? [];
  const slW = 540;
  const slH = 180;
  const slVals = slSeries.map((s) => s.msl_mm);
  const slMin = Math.min(...(slVals.length ? slVals : [6900]));
  const slMax = Math.max(...(slVals.length ? slVals : [7300]));
  const slSpan = slMax - slMin || 1;
  const slPath = slSeries
    .map((pt, i) => {
      const x = 44 + (i / Math.max(1, slSeries.length - 1)) * (slW - 60);
      const y = 14 + ((slMax - pt.msl_mm) / slSpan) * (slH - 42);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <div className="pb-5 border-b nereus-divider">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Long-Term Ocean Signals & Reef Telemetry
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Decadal warming trends, tide-gauge sea-level regressions, and coral thermal stress across Indian coastal basins.
        </p>
      </div>

      {/* Section 1: SST Warming Trend */}
      <section aria-labelledby="sst-heading" className="nereus-surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="sst-heading" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Sea-Surface Temperature Warming — {data.sst_trend.region}
            </h2>
            <div className="text-xs font-data mt-1 flex flex-wrap items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span>{data.sst_trend.provenance.source}</span>
              <span aria-hidden="true">·</span>
              <span>Baseline: {data.sst_trend.baseline_period}</span>
              <span aria-hidden="true">·</span>
              <span>Data date: {data.sst_trend.provenance.data_date}</span>
            </div>
          </div>

          <div className="flex items-baseline gap-6">
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Decadal Rate</div>
              <div className="text-2xl font-data font-semibold tabular-nums" style={{ color: 'var(--accent-coral)' }}>
                {data.sst_trend.decade_trend_c >= 0 ? '+' : ''}
                {data.sst_trend.decade_trend_c.toFixed(2)}
                <span className="text-xs ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>°C/dec</span>
              </div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Latest Mean SST</div>
              <div className="text-2xl font-data font-semibold tabular-nums" style={{ color: 'var(--data-seafoam)' }}>
                {data.sst_trend.latest_sst_c.toFixed(2)}
                <span className="text-xs ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>°C</span>
              </div>
            </div>
          </div>
        </div>

        {sstSeries.length === 0 ? (
          <div className="nereus-inset p-6 text-xs" style={{ color: 'var(--text-muted)' }}>
            Historical SST series unavailable in current fetch. Check Method logs for upstream status.
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${sstW} ${sstH}`}
              className="w-full h-56 nereus-inset"
              role="img"
              aria-label="Annual sea-surface temperature anomaly chart with linear regression trend"
              onMouseLeave={() => setHoverSstIdx(null)}
            >
              {/* Y-axis zero reference */}
              <line
                x1={padL}
                y1={yZero}
                x2={sstW - padR}
                y2={yZero}
                stroke="rgba(232,241,242,0.25)"
                strokeDasharray="3 3"
              />
              <text x={padL - 8} y={padT + 8} textAnchor="end" fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                +{sstMax.toFixed(1)}°C
              </text>
              <text x={padL - 8} y={yZero + 3} textAnchor="end" fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                0.0°C
              </text>
              <text x={padL - 8} y={sstH - padB} textAnchor="end" fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                {sstMin.toFixed(1)}°C
              </text>

              {/* Anomaly bars */}
              {sstSeries.map((pt, i) => {
                const bw = Math.max(4, plotW / sstSeries.length - 2);
                const x = padL + (i / sstSeries.length) * plotW + 1;
                const yVal = padT + ((sstMax - pt.value) / sstSpan) * plotH;
                const yTop = Math.min(yVal, yZero);
                const barH = Math.max(2, Math.abs(yZero - yVal));
                const isHover = hoverSstIdx === i;
                return (
                  <g key={pt.label} onMouseEnter={() => setHoverSstIdx(i)}>
                    <rect
                      x={x}
                      y={yTop}
                      width={bw}
                      height={barH}
                      fill={pt.value >= 0 ? '#FF5A3C' : '#7FE0D0'}
                      opacity={isHover ? 1 : 0.72}
                    />
                    {(i === 0 || i === sstSeries.length - 1 || i % 8 === 0) && (
                      <text
                        x={x + bw / 2}
                        y={sstH - 8}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#8CA3AF"
                        fontFamily="IBM Plex Mono"
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* OLS Linear Trend Line */}
              {sstSeries.length >= 2 && (
                <line
                  x1={padL}
                  y1={trendY0}
                  x2={sstW - padR}
                  y2={trendY1}
                  stroke="#E8F1F2"
                  strokeWidth="1.75"
                />
              )}
            </svg>

            {hoverSstIdx !== null && sstSeries[hoverSstIdx] && (
              <div
                className="mt-2 text-xs font-data tabular-nums flex items-center gap-3"
                style={{ color: 'var(--text-primary)' }}
              >
                <span>Year {sstSeries[hoverSstIdx].label}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Anomaly: {sstSeries[hoverSstIdx].value >= 0 ? '+' : ''}
                  {sstSeries[hoverSstIdx].value.toFixed(2)} °C
                </span>
                {sstSeries[hoverSstIdx].secondary !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Mean Temp: {sstSeries[hoverSstIdx].secondary?.toFixed(2)} °C</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 2: Sea-Level Trend (PSMSL Tide Gauges) */}
      <section aria-labelledby="sealevel-heading" className="nereus-surface p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="sealevel-heading" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Relative Sea-Level Trend — Indian PSMSL Tide Gauges
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Ordinary least-squares linear trend (mm/yr ± standard error) from Revised Local Reference monthly tide-gauge records. Select a station to inspect its historical record.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b nereus-divider" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-2.5 pr-3 font-medium">Station</th>
                  <th className="py-2.5 px-3 font-medium">Gauge Trend</th>
                  <th className="py-2.5 px-3 font-medium">DUACS Satellite</th>
                  <th className="py-2.5 pl-3 font-medium">Period</th>
                </tr>
              </thead>
              <tbody>
                {data.sealevel_stations.map((st) => {
                  const selected = st.id === activeStation?.id;
                  return (
                    <tr
                      key={st.id}
                      className="border-b nereus-divider transition-colors"
                      style={{
                        backgroundColor: selected ? 'var(--surface-elevated)' : 'transparent',
                      }}
                    >
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          onClick={() => setSelectedStationId(st.id)}
                          className="font-medium text-left hover:underline cursor-pointer"
                          style={{ color: selected ? 'var(--accent-coral)' : 'var(--text-primary)' }}
                        >
                          {st.name}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-data tabular-nums whitespace-nowrap">
                        {st.gauge_trend_mm_yr >= 0 ? '+' : ''}
                        {st.gauge_trend_mm_yr.toFixed(2)} ± {st.gauge_se_mm_yr.toFixed(2)} mm/yr
                      </td>
                      <td className="py-2.5 px-3 font-data tabular-nums text-xs" style={{ color: 'var(--text-muted)' }}>
                        {st.satellite_trend_mm_yr !== null
                          ? `${st.satellite_trend_mm_yr.toFixed(2)} mm/yr`
                          : 'CMEMS key needed'}
                      </td>
                      <td className="py-2.5 pl-3 font-data tabular-nums text-xs" style={{ color: 'var(--text-muted)' }}>
                        {st.period}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {activeStation && (
            <div className="lg:col-span-5 nereus-inset p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {activeStation.name} (PSMSL #{activeStation.psmsl_id})
                </h3>
                <span className="text-xs font-data tabular-nums" style={{ color: 'var(--data-seafoam)' }}>
                  {activeStation.gauge_trend_mm_yr >= 0 ? '+' : ''}
                  {activeStation.gauge_trend_mm_yr.toFixed(2)} mm/yr
                </span>
              </div>

              <svg
                viewBox={`0 0 ${slW} ${slH}`}
                className="w-full h-44"
                role="img"
                aria-label={`${activeStation.name} annual sea level series`}
              >
                <text x="40" y="20" textAnchor="end" fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                  {slMax}mm
                </text>
                <text x="40" y={slH - 28} textAnchor="end" fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                  {slMin}mm
                </text>
                {slPath && (
                  <path d={slPath} fill="none" stroke="#7FE0D0" strokeWidth="1.75" />
                )}
                {slSeries.length > 0 && (
                  <>
                    <text x="44" y={slH - 8} fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                      {slSeries[0].year}
                    </text>
                    <text x={slW - 16} y={slH - 8} textAnchor="end" fontSize="10" fill="#8CA3AF" fontFamily="IBM Plex Mono">
                      {slSeries[slSeries.length - 1].year}
                    </text>
                  </>
                )}
              </svg>
            </div>
          )}
        </div>
      </section>

      {/* Section 3: Coral Heat Stress Table */}
      <section aria-labelledby="coral-heading" className="nereus-surface p-5 sm:p-6 space-y-4">
        <div>
          <h2 id="coral-heading" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Coral Heat Stress — NOAA Coral Reef Watch 5 km
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Reef coordinates are approximate monitoring points. Bleaching is likely at DHW ≥ 4 °C-weeks; widespread mortality risk at ≥ 8 °C-weeks.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b nereus-divider" style={{ color: 'var(--text-muted)' }}>
                <th className="py-2.5 pr-4 font-medium">Reef Sector</th>
                <th className="py-2.5 px-3 font-medium">DHW</th>
                <th className="py-2.5 px-3 font-medium">7-Day Alert</th>
                <th className="py-2.5 px-3 font-medium">SST</th>
                <th className="py-2.5 px-3 font-medium">Anomaly</th>
                <th className="py-2.5 pl-3 font-medium">90-Day DHW</th>
              </tr>
            </thead>
            <tbody>
              {data.coral_reefs.map((reef) => {
                const isHigh = reef.baa_level >= 3;
                const pts = reef.history_90d;
                const maxD = Math.max(1, ...pts.map((p) => p.dhw));
                const dPath =
                  pts.length >= 2
                    ? pts
                        .map((p, i) => {
                          const x = (i / (pts.length - 1)) * 90;
                          const y = 20 - (p.dhw / maxD) * 16;
                          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')
                    : '';

                return (
                  <tr key={reef.id} className="border-b nereus-divider">
                    <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {reef.name}
                    </td>
                    <td className="py-2.5 px-3 font-data tabular-nums">
                      {reef.dhw.toFixed(2)} °C-wks
                    </td>
                    <td
                      className="py-2.5 px-3 font-data text-xs"
                      style={{ color: isHigh ? 'var(--accent-coral)' : 'var(--data-seafoam)' }}
                    >
                      Level {reef.baa_level} · {reef.baa_label}
                    </td>
                    <td className="py-2.5 px-3 font-data tabular-nums">
                      {reef.sst_c.toFixed(2)} °C
                    </td>
                    <td className="py-2.5 px-3 font-data tabular-nums">
                      {reef.sst_anomaly_c >= 0 ? '+' : ''}
                      {reef.sst_anomaly_c.toFixed(2)} °C
                    </td>
                    <td className="py-2.5 pl-3">
                      {dPath ? (
                        <svg viewBox="0 0 92 22" className="w-24 h-6" aria-hidden="true">
                          <path
                            d={dPath}
                            fill="none"
                            stroke={isHigh ? '#FF5A3C' : '#7FE0D0'}
                            strokeWidth="1.5"
                          />
                        </svg>
                      ) : (
                        <span className="text-xs font-data" style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Ocean Acidification & Dark Fishing Vessels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="nereus-surface p-5 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Ocean Acidification (Surface pH)
          </h2>
          <p className="text-xs font-data" style={{ color: 'var(--data-seafoam)' }}>
            {data.acidification.provenance.source} · {data.acidification.provenance.product_id}
          </p>
          {data.acidification.arabian_sea_ph === null ? (
            <div className="nereus-inset p-3.5 text-xs space-y-1.5" style={{ color: 'var(--text-primary)' }}>
              <p className="font-medium">Copernicus Marine Credentials Required</p>
              <p style={{ color: 'var(--text-muted)' }}>
                {data.acidification.provenance.status_note}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 font-data tabular-nums">
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Arabian Sea</div>
                <div className="text-xl font-semibold">{data.acidification.arabian_sea_ph} pH</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Bay of Bengal</div>
                <div className="text-xl font-semibold">{data.acidification.bay_of_bengal_ph} pH</div>
              </div>
            </div>
          )}
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {data.acidification.caveat}
          </p>
        </section>

        <section className="nereus-surface p-5 space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Vessel Human Activity & Dark Leads (GFW)
          </h2>
          <p className="text-xs font-data" style={{ color: 'var(--data-seafoam)' }}>
            {data.vessels_summary.provenance.source} · {data.vessels_summary.period}
          </p>
          {data.vessels_summary.provenance.requires_credentials ? (
            <div className="nereus-inset p-3.5 text-xs space-y-1.5" style={{ color: 'var(--text-primary)' }}>
              <p className="font-medium">Global Fishing Watch API Token Required</p>
              <p style={{ color: 'var(--text-muted)' }}>
                {data.vessels_summary.provenance.status_note}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-data tabular-nums">
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Fishing Hours</div>
                <div className="text-xl font-semibold" style={{ color: 'var(--data-seafoam)' }}>
                  {data.vessels_summary.fishing_hours !== undefined
                    ? Math.round(data.vessels_summary.fishing_hours).toLocaleString()
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>AIS Vessels</div>
                <div className="text-xl font-semibold">
                  {data.vessels_summary.fishing_vessels !== undefined
                    ? data.vessels_summary.fishing_vessels.toLocaleString()
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>SAR Unmatched</div>
                <div className="text-xl font-semibold" style={{ color: 'var(--accent-coral)' }}>
                  {data.vessels_summary.unmatched_count.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Unmatched Share</div>
                <div className="text-xl font-semibold">
                  {data.vessels_summary.unmatched_share_pct ?? '—'}%
                </div>
              </div>
            </div>
          )}
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {data.vessels_summary.caveat}
          </p>
        </section>
      </div>
    </main>
  );
}

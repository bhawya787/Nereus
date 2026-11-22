import { useEffect, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import type { DetectionFeature } from '../types/nereus';

interface InspectorDrawerProps {
  detection: DetectionFeature | null;
  onClose: () => void;
  onOpenMethodComparison: (caseId?: string) => void;
}

type SatViewTab = 'truecolor' | 'oceancolor' | 'sentinel';

export function InspectorDrawer({
  detection,
  onClose,
  onOpenMethodComparison,
}: InspectorDrawerProps) {
  const defaultTab: SatViewTab = detection?.thumbnail_url
    ? 'sentinel'
    : detection?.signal === 'bloom'
      ? 'oceancolor'
      : 'truecolor';
  const [satTab, setSatTab] = useState<SatViewTab>(defaultTab);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!detection) return;
    setImgError(false);
    setSatTab(
      detection.thumbnail_url
        ? 'sentinel'
        : detection.signal === 'bloom'
          ? 'oceancolor'
          : 'truecolor'
    );
  }, [detection]);

  if (!detection) return null;

  const isAlert = detection.severity === 'alert' || detection.severity === 'historical';
  const severityLabel =
    detection.severity === 'historical'
      ? 'Historical Validation Case'
      : detection.severity === 'alert'
        ? 'Active Alert'
        : detection.severity === 'watch'
          ? 'Watch Threshold'
          : 'Nominal Observation';

  // Render crisp 90-day / multi-year sparkline when series exists
  const spark = detection.sparkline ?? [];
  let sparkPath = '';
  let minVal = 0;
  let maxVal = 1;
  if (spark.length >= 2) {
    const vals = spark.map((p) => p.value);
    minVal = Math.min(...vals);
    maxVal = Math.max(...vals);
    const span = maxVal - minVal || 1;
    sparkPath = spark
      .map((pt, i) => {
        const x = (i / (spark.length - 1)) * 280;
        const y = 52 - ((pt.value - minVal) / span) * 44;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const latStr = `${Math.abs(detection.lat).toFixed(3)}°${detection.lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(detection.lon).toFixed(3)}°${detection.lon >= 0 ? 'E' : 'W'}`;

  const satImgUrl =
    satTab === 'sentinel' && detection.thumbnail_url
      ? detection.thumbnail_url
      : `/api/nasa-snapshot?lat=${detection.lat}&lon=${detection.lon}&mode=${
          satTab === 'oceancolor' ? 'oceancolor' : 'truecolor'
        }`;

  const satCaption =
    satTab === 'sentinel' && detection.thumbnail_url
      ? `Copernicus ${detection.signal === 'debris' ? 'Sentinel-2 Optical' : 'Sentinel-1 SAR'} Quicklook`
      : satTab === 'oceancolor'
        ? 'NASA GIBS MODIS Aqua Ocean Color (Chlorophyll-a)'
        : 'NASA GIBS MODIS Terra Corrected Reflectance (True Color)';

  return (
    <aside
      aria-label="Detection details"
      data-testid="inspector-drawer"
      className="no-print fixed top-16 right-4 z-20 w-[min(390px,calc(100vw-2rem))] max-h-[calc(100vh-14rem)] overflow-y-auto p-4 sm:p-5 nereus-surface-alpha"
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b nereus-divider">
        <div className="min-w-0">
          <div
            className="text-xs font-data flex flex-wrap items-center gap-1.5 mb-1"
            style={{ color: isAlert ? 'var(--accent-coral)' : 'var(--data-seafoam)' }}
          >
            <span>{severityLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Confidence: {detection.confidence}</span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {detection.title}
          </h2>
          <div className="text-xs font-data mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>{detection.region}</span>
            <span aria-hidden="true">·</span>
            <span>
              {latStr}, {lonStr}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close detection details"
          className="p-1.5 nereus-btn-ghost shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Live Satellite & Ocean Color View */}
      <div className="py-3 border-b nereus-divider space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Satellite View
          </span>
          <div className="flex items-center gap-1" role="group" aria-label="Satellite imagery view">
            {detection.thumbnail_url && (
              <button
                type="button"
                onClick={() => {
                  setImgError(false);
                  setSatTab('sentinel');
                }}
                className="px-2 py-0.5 text-[11px] font-data cursor-pointer"
                style={{
                  borderRadius: 'var(--radius-sharp)',
                  backgroundColor: satTab === 'sentinel' ? 'var(--accent-coral)' : 'var(--surface-inset)',
                  color: satTab === 'sentinel' ? '#04121F' : 'var(--text-muted)',
                }}
              >
                Sentinel
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setImgError(false);
                setSatTab('truecolor');
              }}
              className="px-2 py-0.5 text-[11px] font-data cursor-pointer"
              style={{
                borderRadius: 'var(--radius-sharp)',
                backgroundColor: satTab === 'truecolor' ? 'var(--accent-coral)' : 'var(--surface-inset)',
                color: satTab === 'truecolor' ? '#04121F' : 'var(--text-muted)',
              }}
            >
              NASA True Color
            </button>
            <button
              type="button"
              onClick={() => {
                setImgError(false);
                setSatTab('oceancolor');
              }}
              className="px-2 py-0.5 text-[11px] font-data cursor-pointer"
              style={{
                borderRadius: 'var(--radius-sharp)',
                backgroundColor: satTab === 'oceancolor' ? 'var(--data-seafoam)' : 'var(--surface-inset)',
                color: satTab === 'oceancolor' ? '#04121F' : 'var(--text-muted)',
              }}
            >
              Ocean Color
            </button>
          </div>
        </div>

        <div className="relative w-full h-40 overflow-hidden nereus-inset">
          {!imgError ? (
            <img
              key={satImgUrl}
              src={satImgUrl}
              alt={`${detection.title} ${satCaption}`}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center px-3 text-center text-xs font-data"
              style={{ color: 'var(--text-muted)' }}
            >
              Satellite imagery temporarily unavailable for this pass.
            </div>
          )}
          <div
            className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 text-[10px] font-data truncate"
            style={{ backgroundColor: 'rgba(4,18,31,0.86)', color: 'var(--data-seafoam)' }}
          >
            {satCaption}
          </div>
        </div>
      </div>

      <p className="text-sm leading-relaxed py-3" style={{ color: 'var(--text-primary)' }}>
        {detection.summary}
      </p>

      {/* Tabular Telemetry Metrics */}
      <dl className="grid grid-cols-2 gap-3 py-3 border-y nereus-divider">
        {detection.metrics.map((m) => (
          <div key={m.label}>
            <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {m.label}
            </dt>
            <dd className="text-base font-data font-medium tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {m.value}
              {m.unit && (
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                  {m.unit}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* Sparkline if available */}
      {spark.length >= 2 && (
        <div className="py-3 border-b nereus-divider">
          <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>Observed History ({spark[0].date} to {spark[spark.length - 1].date})</span>
            <span className="font-data tabular-nums">
              {minVal.toFixed(1)}–{maxVal.toFixed(1)}
            </span>
          </div>
          <svg
            viewBox="0 0 280 56"
            className="w-full h-14 nereus-inset p-1"
            role="img"
            aria-label="Observed time-series sparkline"
          >
            <path
              d={sparkPath}
              fill="none"
              stroke={isAlert ? '#FF5A3C' : '#7FE0D0'}
              strokeWidth="1.75"
            />
          </svg>
        </div>
      )}

      {/* Historical SAR preview action */}
      {detection.case_type === 'historical_validation' && (
        <div className="py-3 border-b nereus-divider">
          <button
            type="button"
            onClick={() => onOpenMethodComparison(detection.id)}
            className="w-full nereus-btn-primary px-3 py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Open SAR Before / After Comparison</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Provenance & Science Caveat */}
      <div className="pt-3 space-y-2 text-xs">
        <div>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Provenance:{' '}
          </span>
          <span className="font-data" style={{ color: 'var(--text-muted)' }}>
            {detection.provenance.source} · {detection.provenance.product_id} ·{' '}
            {detection.provenance.cached ? 'Cached' : 'Live'} ({detection.provenance.data_date})
          </span>
        </div>
        {detection.provenance.status_note && (
          <p style={{ color: 'var(--data-seafoam)' }}>{detection.provenance.status_note}</p>
        )}
        <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {detection.caveat}
        </p>
      </div>
    </aside>
  );
}

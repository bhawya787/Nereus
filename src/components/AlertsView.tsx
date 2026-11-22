import { useMemo, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import type { DetectionFeature, SignalId } from '../types/nereus';
import { buildGeoJsonFeatureCollection } from '../utils/nereusMath';

interface AlertsViewProps {
  detections: DetectionFeature[];
  onFlyToDetection: (detection: DetectionFeature) => void;
}

type SortKey = 'date_desc' | 'date_asc' | 'area_desc' | 'severity';

const SIGNAL_FILTERS: Array<{ id: 'all' | SignalId; label: string }> = [
  { id: 'all', label: 'All Signals' },
  { id: 'oil', label: 'Oil Slicks' },
  { id: 'bloom', label: 'Algal Blooms' },
  { id: 'sst', label: 'SST Warming' },
  { id: 'coral', label: 'Coral Stress' },
  { id: 'sealevel', label: 'Sea Level' },
  { id: 'vessels', label: 'Vessel Activity' },
  { id: 'debris', label: 'Floating Debris' },
];

const SEVERITY_RANK: Record<DetectionFeature['severity'], number> = {
  alert: 0,
  historical: 1,
  watch: 2,
  nominal: 3,
};

export function AlertsView({ detections, onFlyToDetection }: AlertsViewProps) {
  const [filterSignal, setFilterSignal] = useState<'all' | SignalId>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('severity');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = detections.filter((d) => {
      if (filterSignal !== 'all' && d.signal !== filterSignal) return false;
      if (q && !d.title.toLowerCase().includes(q) && !d.region.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'date_desc') return b.detected_at.localeCompare(a.detected_at);
      if (sortBy === 'date_asc') return a.detected_at.localeCompare(b.detected_at);
      if (sortBy === 'area_desc') return (b.area_km2 ?? -1) - (a.area_km2 ?? -1);
      const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return sevDiff !== 0 ? sevDiff : b.detected_at.localeCompare(a.detected_at);
    });
  }, [detections, filterSignal, search, sortBy]);

  const handleExportGeoJson = () => {
    const fc = buildGeoJsonFeatureCollection(filtered);
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nereus-detections-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b nereus-divider">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Coastal Signal Watchlist
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Active alerts, watch sectors, and historical validation detections across India’s coastline. Click any row to center the 3D globe.
          </p>
        </div>

        <div className="no-print flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportGeoJson}
            className="nereus-btn-ghost px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export GeoJSON</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="nereus-btn-ghost px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Print Summary</span>
          </button>
        </div>
      </div>

      {/* Filter & Sort Controls */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by ocean signal">
          {SIGNAL_FILTERS.map((f) => {
            const active = filterSignal === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterSignal(f.id)}
                className="px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: active ? 'var(--accent-coral)' : 'var(--surface-panel)',
                  color: active ? '#04121F' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'var(--accent-coral)' : 'var(--border-hairline)'}`,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative flex-1 sm:w-56">
            <span className="sr-only">Search coastal sectors</span>
            <Search
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter region or station…"
              className="w-full pl-8 pr-3 py-1.5 text-xs nereus-inset"
              style={{ color: 'var(--text-primary)' }}
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="hidden sm:inline">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort detections"
              className="px-2.5 py-1.5 text-xs nereus-inset cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <option value="severity">Priority</option>
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="area_desc">Largest Area</option>
            </select>
          </label>
        </div>
      </div>

      {/* Results Table */}
      {filtered.length === 0 ? (
        <div className="nereus-surface p-8 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            No detections match your current filter.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Clear the search query or select All Signals to review all satellite observations.
          </p>
        </div>
      ) : (
        <div className="nereus-surface overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b nereus-divider" style={{ color: 'var(--text-muted)' }}>
                <th className="py-3 px-4 font-medium">Signal / Status</th>
                <th className="py-3 px-4 font-medium">Observation Sector</th>
                <th className="py-3 px-4 font-medium">Key Measurement</th>
                <th className="py-3 px-4 font-medium">Area</th>
                <th className="py-3 px-4 font-medium">Data Date</th>
                <th className="py-3 px-4 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isAlert = d.severity === 'alert' || d.severity === 'historical';
                const statusWord =
                  d.severity === 'historical'
                    ? 'Historical'
                    : d.severity === 'alert'
                      ? 'Alert'
                      : d.severity === 'watch'
                        ? 'Watch'
                        : 'Nominal';

                return (
                  <tr
                    key={d.id}
                    className="border-b nereus-divider hover:bg-[rgba(127,224,208,0.08)] transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className="font-data text-xs"
                        style={{ color: isAlert ? 'var(--accent-coral)' : 'var(--data-seafoam)' }}
                      >
                        {d.signal.toUpperCase()} · {statusWord}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onFlyToDetection(d)}
                        className="text-left font-medium hover:underline cursor-pointer"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {d.title}
                      </button>
                      <div className="text-xs font-data mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {d.region} · {d.lat.toFixed(2)}°N, {d.lon.toFixed(2)}°E
                      </div>
                    </td>
                    <td className="py-3 px-4 font-data tabular-nums whitespace-nowrap">
                      {d.metrics[0] ? `${d.metrics[0].label}: ${d.metrics[0].value} ${d.metrics[0].unit ?? ''}` : '—'}
                    </td>
                    <td className="py-3 px-4 font-data tabular-nums whitespace-nowrap">
                      {d.area_km2 ? `${d.area_km2} km²` : '—'}
                    </td>
                    <td className="py-3 px-4 font-data tabular-nums whitespace-nowrap">
                      {d.provenance.data_date}
                    </td>
                    <td className="py-3 px-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {d.provenance.source}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

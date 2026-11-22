import { useCallback, useEffect, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { CAMERA_PRESETS, EarthGlobe, type CameraPreset, type EarthImageryMode } from './components/EarthGlobe';
import { InspectorDrawer } from './components/InspectorDrawer';
import { MethodView } from './components/MethodView';
import { SignalDock } from './components/SignalDock';
import { TopBar, type NavTab } from './components/TopBar';
import { TrendsView } from './components/TrendsView';
import type { DetectionFeature, NereusDataset, SignalId } from './types/nereus';

const DEFAULT_ACTIVE_LAYERS: Record<SignalId, boolean> = {
  oil: true,
  bloom: true,
  sst: true,
  coral: true,
  sealevel: true,
  acidification: false,
  vessels: true,
  debris: true,
};

export default function App() {
  const [data, setData] = useState<NereusDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('globe');
  const [activeLayers, setActiveLayers] = useState<Record<SignalId, boolean>>(DEFAULT_ACTIVE_LAYERS);
  const [selectedDetection, setSelectedDetection] = useState<DetectionFeature | null>(null);
  const [activePresetId, setActivePresetId] = useState<string>('global');
  const [imageryMode, setImageryMode] = useState<EarthImageryMode>('bluemarble');
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lon: number;
    distance?: number;
    nonce: number;
  } | null>(null);
  const [methodCaseId, setMethodCaseId] = useState<string | null>(null);

  const loadData = useCallback(async (force = false) => {
    try {
      if (force) setIsRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch(force ? '/api/refresh' : '/api/nereus', {
        method: force ? 'POST' : 'GET',
      });
      if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
      const json = (await res.json()) as NereusDataset;
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
    const syncRealtime = async () => {
      try {
        const res = await fetch('/api/realtime');
        if (!res.ok) return;
        const json = (await res.json()) as NereusDataset;
        setData(json);
        setSelectedDetection((prev) => {
          if (!prev) return null;
          return json.detections.find((d) => d.id === prev.id) ?? prev;
        });
      } catch {
        // silent background live sync retry on next interval
      }
    };
    const initialLiveTimer = window.setTimeout(syncRealtime, 2500);
    const interval = window.setInterval(syncRealtime, 60 * 1000);
    return () => {
      window.clearTimeout(initialLiveTimer);
      window.clearInterval(interval);
    };
  }, [loadData]);

  const handleToggleLayer = (id: SignalId) => {
    setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePresetId(preset.id);
    setFlyTarget({
      lat: preset.lat,
      lon: preset.lon,
      distance: preset.distance,
      nonce: Date.now(),
    });
  };

  const handleFlyToDetection = (det: DetectionFeature) => {
    setActiveTab('globe');
    setActiveLayers((prev) => ({ ...prev, [det.signal]: true }));
    setSelectedDetection(det);
    setFlyTarget({
      lat: det.lat,
      lon: det.lon,
      distance: 1.82,
      nonce: Date.now(),
    });
  };

  const handleOpenMethodComparison = (caseId?: string) => {
    if (caseId) setMethodCaseId(caseId);
    setActiveTab('method');
  };

  return (
    <div
      className="flex flex-col min-h-screen w-full"
      style={{
        backgroundColor: 'var(--bg-ocean)',
        backgroundImage:
          'radial-gradient(circle at 18% 12%, rgba(28, 92, 120, 0.24), transparent 48%), radial-gradient(circle at 82% 82%, rgba(16, 70, 92, 0.20), transparent 46%)',
        color: 'var(--text-primary)',
      }}
    >
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRefresh={() => loadData(true)}
        isRefreshing={isRefreshing}
        lastRefreshUtc={data?.last_refresh_utc ?? null}
      />

      {loading && !data ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="nereus-surface max-w-md w-full p-6 space-y-2">
            <h1 className="text-lg font-semibold">Synchronizing Satellite & Ocean Feeds</h1>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Fetching live NOAA Coral Reef Watch 5 km, NOAA-20 VIIRS chlorophyll, PSMSL tide gauges, Open-Meteo winds, and Copernicus Sentinel STAC metadata…
            </p>
          </div>
        </main>
      ) : error && !data ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="nereus-surface max-w-md w-full p-6 space-y-3">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--accent-coral)' }}>
              Unable to Load Observatory Telemetry
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => loadData(true)}
              className="nereus-btn-primary px-4 py-2 text-xs cursor-pointer"
            >
              Retry Live Sync
            </button>
          </div>
        </main>
      ) : data ? (
        <>
          {activeTab === 'globe' && (
            <main className="relative flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden">
              <EarthGlobe
                detections={data.detections}
                activeLayers={activeLayers}
                selectedId={selectedDetection?.id ?? null}
                imageryMode={imageryMode}
                flyTarget={flyTarget}
                onSelectDetection={setSelectedDetection}
              />

              {/* Compact non-obstructive top-left observatory readout */}
              <div
                className="no-print pointer-events-none fixed top-16 left-4 z-10 hidden sm:block px-3 py-2 nereus-surface-alpha"
                aria-label="Observatory status summary"
              >
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {activePresetId === 'india' || activePresetId === 'arabian' || activePresetId === 'bengal'
                    ? 'Indian Ocean Coastal Watch'
                    : 'Global Ocean Satellite Watch'}
                </div>
                <div className="text-[11px] font-data tabular-nums mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span>{data.detections.filter((d) => activeLayers[d.signal]).length} active markers</span>
                  <span aria-hidden="true">·</span>
                  <span>Synced {data.last_refresh_utc.slice(0, 16).replace('T', ' ')}Z</span>
                </div>
              </div>

              <InspectorDrawer
                detection={selectedDetection}
                onClose={() => setSelectedDetection(null)}
                onOpenMethodComparison={handleOpenMethodComparison}
              />

              <SignalDock
                layers={data.layers}
                activeLayers={activeLayers}
                onToggleLayer={handleToggleLayer}
                onSelectPreset={handleSelectPreset}
                activePresetId={activePresetId}
                imageryMode={imageryMode}
                onChangeImageryMode={setImageryMode}
              />
            </main>
          )}

          {activeTab === 'alerts' && (
            <div className="flex-1 overflow-y-auto">
              <AlertsView
                detections={data.detections}
                onFlyToDetection={handleFlyToDetection}
              />
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="flex-1 overflow-y-auto">
              <TrendsView data={data} />
            </div>
          )}

          {activeTab === 'method' && (
            <div className="flex-1 overflow-y-auto">
              <MethodView data={data} initialCaseId={methodCaseId} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

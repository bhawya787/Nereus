import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, X } from 'lucide-react';
import type { LayerManifest, SignalId } from '../types/nereus';
import { CAMERA_PRESETS, type CameraPreset, type EarthImageryMode } from './EarthGlobe';

interface SignalDockProps {
  layers: Record<SignalId, LayerManifest>;
  activeLayers: Record<SignalId, boolean>;
  onToggleLayer: (id: SignalId) => void;
  onSelectPreset: (preset: CameraPreset) => void;
  activePresetId: string;
  imageryMode: EarthImageryMode;
  onChangeImageryMode: (mode: EarthImageryMode) => void;
}

const IMAGERY_MODES: Array<{ id: EarthImageryMode; label: string }> = [
  { id: 'bluemarble', label: 'NASA Blue Marble' },
  { id: 'nasa_truecolor', label: 'NASA Satellite' },
  { id: 'ocean_color', label: 'NASA Ocean Color' },
  { id: 'relief', label: 'Relief' },
];

const SIGNAL_ORDER: SignalId[] = [
  'oil',
  'bloom',
  'sst',
  'coral',
  'sealevel',
  'acidification',
  'vessels',
  'debris',
];

export function SignalDock({
  layers,
  activeLayers,
  onToggleLayer,
  onSelectPreset,
  activePresetId,
  imageryMode,
  onChangeImageryMode,
}: SignalDockProps) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [popoverLayerId, setPopoverLayerId] = useState<SignalId | null>(null);

  const popoverLayer = popoverLayerId ? layers[popoverLayerId] : null;

  return (
    <div
      className="no-print pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(980px,95vw)] flex flex-col items-center"
      data-testid="signal-dock"
    >
      {/* Data Provenance Popover (anchored cleanly above the dock) */}
      {popoverLayer && !collapsed && (
        <div
          role="dialog"
          aria-label={`${popoverLayer.name} data provenance`}
          className="pointer-events-auto mb-3 w-full max-w-xl p-4 nereus-surface-alpha"
        >
          <div className="flex items-start justify-between gap-4 pb-2.5 border-b nereus-divider">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {popoverLayer.name}
              </h3>
              <div
                className="text-xs font-data mt-0.5 flex flex-wrap items-center gap-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>{popoverLayer.provenance.source}</span>
                <span aria-hidden="true">·</span>
                <span>{popoverLayer.provenance.cached ? 'Cached fallback' : 'Live fetch'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPopoverLayerId(null)}
              aria-label="Close data provenance popover"
              className="p-1.5 nereus-btn-ghost cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs">
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Product ID</dt>
              <dd className="font-data mt-0.5 truncate" title={popoverLayer.provenance.product_id}>
                {popoverLayer.provenance.product_id}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Data Date</dt>
              <dd className="font-data mt-0.5 tabular-nums">
                {popoverLayer.provenance.data_date}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Processed At</dt>
              <dd className="font-data mt-0.5 tabular-nums">
                {popoverLayer.provenance.processed_at.slice(0, 16).replace('T', ' ')}Z
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Records</dt>
              <dd className="font-data mt-0.5 tabular-nums">{popoverLayer.count}</dd>
            </div>
          </dl>

          {popoverLayer.count === 0 && (
            <p className="text-xs py-2 px-3 nereus-inset mb-2" style={{ color: 'var(--text-primary)' }}>
              {popoverLayer.emptyMessage}
            </p>
          )}
          {popoverLayer.provenance.status_note && (
            <p className="text-xs mb-2" style={{ color: 'var(--data-seafoam)' }}>
              {popoverLayer.provenance.status_note}
            </p>
          )}
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {popoverLayer.caveat}
          </p>
        </div>
      )}

      {/* Collapse / Expand toggle */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium nereus-surface-alpha cursor-pointer"
        style={{ color: 'var(--text-primary)' }}
      >
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span>{collapsed ? 'Show Controls' : 'Hide Controls'}</span>
      </button>

      {/* Main Dock Panel */}
      {!collapsed && (
        <div className="pointer-events-auto w-full p-3 sm:p-4 nereus-surface-alpha">
          {/* Row 1: Camera Presets + NASA Satellite Imagery Mode */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b nereus-divider">
            <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Earth camera regions">
              {CAMERA_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset)}
                    className="px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      background: isActive
                        ? 'linear-gradient(180deg, rgba(255, 114, 88, 0.96) 0%, rgba(255, 90, 60, 0.9) 100%)'
                        : 'rgba(4, 16, 28, 0.44)',
                      color: isActive ? '#04121F' : 'var(--text-muted)',
                      border: `1px solid ${isActive ? 'rgba(255, 198, 186, 0.5)' : 'var(--border-hairline)'}`,
                      boxShadow: isActive
                        ? 'inset 0 1px 0 rgba(255, 236, 230, 0.55)'
                        : 'inset 0 1px 0 rgba(232, 248, 250, 0.12)',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="NASA satellite Earth imagery">
              {IMAGERY_MODES.map((m) => {
                const active = imageryMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChangeImageryMode(m.id)}
                    aria-pressed={active}
                    className="px-2 py-1 text-[11px] font-data whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      background: active
                        ? 'linear-gradient(180deg, rgba(145, 235, 221, 0.96) 0%, rgba(127, 224, 208, 0.9) 100%)'
                        : 'rgba(4, 16, 28, 0.44)',
                      color: active ? '#04121F' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'rgba(218, 252, 246, 0.55)' : 'var(--border-hairline)'}`,
                      boxShadow: active
                        ? 'inset 0 1px 0 rgba(242, 255, 252, 0.65)'
                        : 'inset 0 1px 0 rgba(232, 248, 250, 0.12)',
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: 8 Ocean Signals Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SIGNAL_ORDER.map((id) => {
              const layer = layers[id];
              if (!layer) return null;
              const enabled = activeLayers[id];
              const isPopoverOpen = popoverLayerId === id;

              return (
                <div
                  key={id}
                  className="flex items-stretch justify-between gap-1 px-2.5 py-2 transition-colors"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    background: enabled
                      ? 'linear-gradient(155deg, rgba(255, 255, 255, 0.10) 0%, rgba(18, 60, 84, 0.52) 100%)'
                      : 'rgba(4, 16, 28, 0.40)',
                    border: `1px solid ${enabled ? 'rgba(216, 246, 250, 0.28)' : 'var(--border-hairline)'}`,
                    boxShadow: enabled
                      ? 'inset 0 1px 0 rgba(236, 250, 252, 0.24)'
                      : 'inset 0 1px 2px rgba(1, 7, 14, 0.35)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onToggleLayer(id)}
                    aria-pressed={enabled}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 shrink-0 inline-block"
                        style={{
                          borderRadius: 'var(--radius-sharp)',
                          backgroundColor: enabled ? layer.color : 'var(--text-subtle)',
                        }}
                        aria-hidden="true"
                      />
                      <span
                        className="text-xs font-medium truncate"
                        style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}
                      >
                        {layer.shortLabel}
                      </span>
                    </div>
                    <div
                      className="text-[11px] font-data tabular-nums mt-0.5 truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>{layer.count}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{layer.provenance.data_date}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPopoverLayerId(isPopoverOpen ? null : id)}
                    aria-label={`${layer.shortLabel} data provenance`}
                    aria-expanded={isPopoverOpen}
                    className="px-1.5 self-center py-1 text-[11px] font-data cursor-pointer transition-colors"
                    style={{
                      borderRadius: 'var(--radius-sharp)',
                      color: isPopoverOpen ? '#04121F' : 'var(--data-seafoam)',
                      backgroundColor: isPopoverOpen ? 'var(--data-seafoam)' : 'transparent',
                    }}
                  >
                    <Database className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

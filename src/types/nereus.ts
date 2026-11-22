export type SignalId =
  | 'oil'
  | 'bloom'
  | 'sst'
  | 'coral'
  | 'sealevel'
  | 'acidification'
  | 'vessels'
  | 'debris';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'observational';

export interface Provenance {
  source: string;
  product_id: string;
  data_date: string;
  processed_at: string;
  cached: boolean;
  endpoint?: string;
  requires_credentials?: boolean;
  status_note?: string;
}

export interface DetectionFeature {
  id: string;
  signal: SignalId;
  title: string;
  region: string;
  lat: number;
  lon: number;
  detected_at: string;
  severity: 'alert' | 'watch' | 'nominal' | 'historical';
  confidence: ConfidenceLevel;
  summary: string;
  metrics: Array<{
    label: string;
    value: string;
    unit?: string;
  }>;
  polygon?: number[][]; // [[lon, lat], ...]
  area_km2?: number;
  wind_ms?: number;
  wind_source?: string;
  case_type?: 'latest_scan' | 'historical_validation' | 'live_station';
  scene_id?: string;
  cloud_cover?: number;
  thumbnail_url?: string;
  sparkline?: Array<{ date: string; value: number }>;
  caveat: string;
  provenance: Provenance;
}

export interface LayerManifest {
  id: SignalId;
  name: string;
  shortLabel: string;
  unit: string;
  color: string;
  enabledByDefault: boolean;
  count: number;
  emptyMessage: string;
  caveat: string;
  provenance: Provenance;
}

export interface TimeSeriesPoint {
  label: string;
  value: number;
  baseline?: number;
  secondary?: number;
}

export interface SeaLevelStation {
  id: string;
  name: string;
  psmsl_id: string;
  lat: number;
  lon: number;
  gauge_trend_mm_yr: number;
  gauge_se_mm_yr: number;
  satellite_trend_mm_yr: number | null;
  period: string;
  latest_msl_mm: number | null;
  series: Array<{ year: number; msl_mm: number }>;
  provenance: Provenance;
}

export interface CoralReefRecord {
  id: string;
  name: string;
  lat: number;
  lon: number;
  approximate_coords: boolean;
  dhw: number;
  baa_level: 0 | 1 | 2 | 3 | 4;
  baa_label: string;
  sst_c: number;
  sst_anomaly_c: number;
  history_90d: Array<{ date: string; dhw: number; sst: number }>;
  provenance: Provenance;
}

export interface HistoricalOilCase {
  id: string;
  title: string;
  event_date: string;
  location: string;
  lat: number;
  lon: number;
  scene_id: string;
  area_km2: number;
  elongation: number;
  wind_ms: number;
  confidence: ConfidenceLevel;
  thumbnail_url?: string;
  outline_polygon: number[][];
  caveat: string;
  provenance: Provenance;
}

export interface NereusDataset {
  generated_at: string;
  last_refresh_utc: string;
  earth_sun_utc: string;
  layers: Record<SignalId, LayerManifest>;
  detections: DetectionFeature[];
  coral_reefs: CoralReefRecord[];
  sst_trend: {
    region: string;
    decade_trend_c: number;
    latest_sst_c: number;
    latest_anomaly_c: number;
    baseline_period: string;
    annual_series: TimeSeriesPoint[];
    provenance: Provenance;
  };
  sealevel_stations: SeaLevelStation[];
  acidification: {
    arabian_sea_ph: number | null;
    bay_of_bengal_ph: number | null;
    decade_trend_ph: number | null;
    series: TimeSeriesPoint[];
    caveat: string;
    provenance: Provenance;
  };
  vessels_summary: {
    unmatched_count: number;
    matched_count: number;
    unmatched_share_pct: number | null;
    fishing_hours?: number;
    fishing_vessels?: number;
    period: string;
    radar_ships_detected: number;
    caveat: string;
    provenance: Provenance;
  };
  historical_oil_cases: HistoricalOilCase[];
  logs: Array<{
    module: SignalId;
    url: string;
    timestamp: string;
    status: 'live' | 'cached' | 'credentials_required' | 'empty';
    note: string;
  }>;
}

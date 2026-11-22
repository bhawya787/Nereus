import type { DetectionFeature, Provenance } from '../types/nereus';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

/**
 * Converts geographic latitude/longitude (degrees) to Three.js SphereGeometry
 * right-handed Cartesian coordinates, aligned with equirectangular CanvasTexture
 * (flipY = true, u = (lon + 180)/360, v = 1 - (90 - lat)/180).
 */
export function latLonToVector3(lat: number, lon: number, radius = 1): Vec3Tuple {
  const phi = ((lon + 180) * Math.PI) / 180;
  const theta = ((90 - lat) * Math.PI) / 180;
  const sinTheta = Math.sin(theta);

  return {
    x: -radius * Math.cos(phi) * sinTheta,
    y: radius * Math.cos(theta),
    z: radius * Math.sin(phi) * sinTheta,
  };
}

/**
 * Inverse projection from unit sphere point back to geographic lat/lon (degrees).
 */
export function vector3ToLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const r = Math.hypot(x, y, z) || 1;
  const ny = Math.max(-1, Math.min(1, y / r));
  const theta = Math.acos(ny);
  const lat = 90 - (theta * 180) / Math.PI;
  let phi = Math.atan2(z, -x);
  if (phi < 0) phi += Math.PI * 2;
  const lon = (phi * 180) / Math.PI - 180;
  return { lat, lon };
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  standardError: number;
  rSquared: number;
}

/**
 * Ordinary least-squares linear regression with standard error of the slope.
 */
export function linearRegression(points: Array<{ x: number; y: number }>): RegressionResult {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0, standardError: 0, rSquared: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssXY = 0;
  let ssYY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssYY += dy * dy;
  }

  if (ssXX === 0) {
    return { slope: 0, intercept: meanY, standardError: 0, rSquared: 0 };
  }

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    const err = p.y - pred;
    ssRes += err * err;
  }

  const dof = Math.max(1, n - 2);
  const mse = ssRes / dof;
  const standardError = Math.sqrt(mse / ssXX);
  const rSquared = ssYY > 0 ? Math.max(0, 1 - ssRes / ssYY) : 0;

  return { slope, intercept, standardError, rSquared };
}

export function classifyCoralAlert(baaLevel: number): {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  severity: 'nominal' | 'watch' | 'alert';
} {
  const clamped = Math.max(0, Math.min(4, Math.round(baaLevel))) as 0 | 1 | 2 | 3 | 4;
  switch (clamped) {
    case 4:
      return { level: 4, label: 'Alert Level 2 (Mortality Risk)', severity: 'alert' };
    case 3:
      return { level: 3, label: 'Alert Level 1 (Bleaching Likely)', severity: 'alert' };
    case 2:
      return { level: 2, label: 'Bleaching Warning', severity: 'watch' };
    case 1:
      return { level: 1, label: 'Bleaching Watch', severity: 'watch' };
    default:
      return { level: 0, label: 'No Stress', severity: 'nominal' };
  }
}

export function evaluateOilWindWindow(windMs: number): {
  inWindow: boolean;
  label: string;
} {
  if (windMs < 2.0) {
    return { inWindow: false, label: 'Low wind (< 2 m/s): high look-alike risk' };
  }
  if (windMs > 10.0) {
    return { inWindow: false, label: 'High wind (> 10 m/s): slick likely dispersed' };
  }
  return { inWindow: true, label: 'Nominal SAR slick window (2–10 m/s)' };
}

export function formatProvenanceLine(p: Provenance): string {
  const status = p.cached ? `Cached (${p.data_date})` : `Live (${p.data_date})`;
  return `${p.source} · ${p.product_id} · ${status}`;
}

export interface NdbcBuoyObs {
  stationId: string;
  lat: number;
  lon: number;
  observedAt: string;
  windMs: number | null;
  waveHeightM: number | null;
  pressureHpa: number | null;
  waterTempC: number | null;
}

/**
 * Parses NOAA NDBC real-time latest_obs.txt fixed/whitespace-delimited records.
 * Skips header lines (#) and handles 'MM' missing-value sentinels cleanly.
 */
export function parseNdbcLatestObs(text: string): NdbcBuoyObs[] {
  const lines = text.split(/\r?\n/);
  const results: NdbcBuoyObs[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 19) continue;

    const stationId = cols[0];
    const lat = Number.parseFloat(cols[1]);
    const lon = Number.parseFloat(cols[2]);
    const yyyy = cols[3];
    const mm = cols[4];
    const dd = cols[5];
    const hh = cols[6];
    const mn = cols[7];

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) continue;

    const parseOpt = (val: string) => {
      if (!val || val === 'MM') return null;
      const n = Number.parseFloat(val);
      return Number.isFinite(n) ? n : null;
    };

    const windMs = parseOpt(cols[9]);
    const waveHeightM = parseOpt(cols[11]);
    const pressureHpa = parseOpt(cols[15]);
    const waterTempC = parseOpt(cols[18]);

    if (waterTempC === null && waveHeightM === null && windMs === null) continue;

    results.push({
      stationId,
      lat,
      lon,
      observedAt: `${yyyy}-${mm}-${dd}T${hh.padStart(2, '0')}:${mn.padStart(2, '0')}:00Z`,
      windMs,
      waveHeightM,
      pressureHpa,
      waterTempC,
    });
  }
  return results;
}

export function buildGeoJsonFeatureCollection(detections: DetectionFeature[]) {
  return {
    type: 'FeatureCollection',
    generated_at: new Date().toISOString(),
    features: detections.map((d) => ({
      type: 'Feature',
      id: d.id,
      geometry:
        d.polygon && d.polygon.length >= 3
          ? {
              type: 'Polygon',
              coordinates: [d.polygon],
            }
          : {
              type: 'Point',
              coordinates: [d.lon, d.lat],
            },
      properties: {
        signal: d.signal,
        title: d.title,
        region: d.region,
        detected_at: d.detected_at,
        severity: d.severity,
        confidence: d.confidence,
        summary: d.summary,
        area_km2: d.area_km2 ?? null,
        wind_ms: d.wind_ms ?? null,
        wind_source: d.wind_source ?? null,
        case_type: d.case_type ?? null,
        caveat: d.caveat,
        provenance: d.provenance,
      },
    })),
  };
}

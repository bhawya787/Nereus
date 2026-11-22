import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latLonToVector3,
  vector3ToLatLon,
  linearRegression,
  classifyCoralAlert,
  evaluateOilWindWindow,
  buildGeoJsonFeatureCollection,
  parseNdbcLatestObs,
} from './nereusMath';
import type { DetectionFeature } from '../types/nereus';

test('latLonToVector3 and vector3ToLatLon round-trip India coordinates accurately', () => {
  const mumbai = { lat: 19.076, lon: 72.8777 };
  const v = latLonToVector3(mumbai.lat, mumbai.lon, 2);
  assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 2) < 1e-6);

  const back = vector3ToLatLon(v.x, v.y, v.z);
  assert.ok(Math.abs(back.lat - mumbai.lat) < 1e-4);
  assert.ok(Math.abs(back.lon - mumbai.lon) < 1e-4);
});

test('latLonToVector3 places equator prime meridian at +X and North Pole at +Y', () => {
  const eqPrime = latLonToVector3(0, 0, 1);
  assert.ok(Math.abs(eqPrime.x - 1) < 1e-6);
  assert.ok(Math.abs(eqPrime.y) < 1e-6);
  assert.ok(Math.abs(eqPrime.z) < 1e-6);

  const northPole = latLonToVector3(90, 0, 1);
  assert.ok(Math.abs(northPole.y - 1) < 1e-6);
});

test('linearRegression computes exact slope, SE, and R2 for linear trend', () => {
  const points = [
    { x: 2000, y: 10 },
    { x: 2001, y: 13 },
    { x: 2002, y: 16 },
    { x: 2003, y: 19 },
  ];
  const res = linearRegression(points);
  assert.ok(Math.abs(res.slope - 3) < 1e-9);
  assert.ok(Math.abs(res.standardError) < 1e-9);
  assert.ok(Math.abs(res.rSquared - 1) < 1e-9);
});

test('classifyCoralAlert maps NOAA BAA 0-4 thresholds correctly', () => {
  assert.equal(classifyCoralAlert(0).severity, 'nominal');
  assert.equal(classifyCoralAlert(1).label, 'Bleaching Watch');
  assert.equal(classifyCoralAlert(3).severity, 'alert');
  assert.equal(classifyCoralAlert(4).level, 4);
});

test('evaluateOilWindWindow enforces 2 to 10 m/s SAR slick window', () => {
  assert.equal(evaluateOilWindWindow(1.2).inWindow, false);
  assert.equal(evaluateOilWindWindow(5.4).inWindow, true);
  assert.equal(evaluateOilWindWindow(12.8).inWindow, false);
});

test('buildGeoJsonFeatureCollection preserves provenance and polygon geometry', () => {
  const sample: DetectionFeature = {
    id: 'oil-test-1',
    signal: 'oil',
    title: 'Ennore Validation Case',
    region: 'Chennai / Ennore',
    lat: 13.23,
    lon: 80.34,
    detected_at: '2017-01-29T00:30:00Z',
    severity: 'historical',
    confidence: 'high',
    summary: 'Verified historical spill',
    metrics: [{ label: 'Area', value: '4.2', unit: 'km2' }],
    polygon: [
      [80.33, 13.22],
      [80.35, 13.22],
      [80.35, 13.24],
      [80.33, 13.22],
    ],
    caveat: 'SAR shows dark patches that may be oil.',
    provenance: {
      source: 'Copernicus Sentinel-1',
      product_id: 'S1A_IW_GRDH_20170129',
      data_date: '2017-01-29',
      processed_at: '2026-11-21T19:00:00Z',
      cached: true,
    },
  };
  const fc = buildGeoJsonFeatureCollection([sample]);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 1);
  assert.equal(fc.features[0].geometry.type, 'Polygon');
  assert.equal(fc.features[0].properties.provenance.product_id, 'S1A_IW_GRDH_20170129');
});

test('parseNdbcLatestObs parses live buoy rows and handles MM missing fields', () => {
  const sample = [
    '#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE',
    '#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft',
    '22101    37.24   126.02  2026 11 21 23 00  70   3.0    MM  0.5   0   MM  MM     MM    MM   3.7  15.3    MM   MM     MM',
    '15009     0.000   -3.051 2026 11 21 21 00 190   7.9    MM   MM  MM   MM  MM 1013.1    MM  27.3  27.7    MM   MM     MM',
  ].join('\n');
  const obs = parseNdbcLatestObs(sample);
  assert.equal(obs.length, 2);
  assert.equal(obs[0].stationId, '22101');
  assert.equal(obs[0].observedAt, '2026-11-21T23:00:00Z');
  assert.equal(obs[0].waveHeightM, 0.5);
  assert.equal(obs[0].waterTempC, 15.3);
  assert.equal(obs[0].pressureHpa, null);
  assert.equal(obs[1].pressureHpa, 1013.1);
});

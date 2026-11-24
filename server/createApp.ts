import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { checkApiHealth, refreshRealtimePoints, runNereusPipeline } from './nereusPipeline.ts';

const IS_VERCEL = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME
);
const ROOT_DIR = process.cwd();
const SEED_SAR_CACHE_DIR = path.join(ROOT_DIR, 'cache', 'sar_thumbnails');
const SEED_NASA_CACHE_DIR = path.join(ROOT_DIR, 'cache', 'nasa_textures');
const WRITABLE_BASE = IS_VERCEL ? path.join(os.tmpdir(), 'nereus', 'cache') : path.join(ROOT_DIR, 'cache');
const SAR_CACHE_DIR = path.join(WRITABLE_BASE, 'sar_thumbnails');
const NASA_CACHE_DIR = path.join(WRITABLE_BASE, 'nasa_textures');

function ensureCacheDir(dir: string) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Ignore on read-only filesystems
  }
}

function resolveConfinedPath(baseDir: string, fileName: string): string | null {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, fileName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

function readCachedAsset(writableDir: string, seedDir: string, fileName: string): Buffer | null {
  for (const dir of [writableDir, seedDir]) {
    const safePath = resolveConfinedPath(dir, fileName);
    if (!safePath) continue;
    try {
      if (fs.existsSync(safePath)) {
        return fs.readFileSync(safePath);
      }
    } catch {
      // ignore read failure
    }
  }
  return null;
}

function writeCachedAsset(writableDir: string, fileName: string, buf: Buffer) {
  const safePath = resolveConfinedPath(writableDir, fileName);
  if (!safePath) return;
  try {
    ensureCacheDir(writableDir);
    fs.writeFileSync(safePath, buf);
  } catch {
    // Ignore on read-only filesystems
  }
}

export function createApiApp() {
  const app = express();
  app.use(express.json());

  ensureCacheDir(SAR_CACHE_DIR);
  ensureCacheDir(NASA_CACHE_DIR);

  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      const report = await checkApiHealth();
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/nereus', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      const data = await runNereusPipeline(false);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/realtime', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      const data = await refreshRealtimePoints();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/refresh', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      const data = await runNereusPipeline(true);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/sar-preview/:caseId', async (req, res) => {
    const safeId = req.params.caseId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) {
      res.status(400).json({ error: 'Invalid caseId' });
      return;
    }

    const fileName = `${safeId}.bin`;
    const cachedBuf = readCachedAsset(SAR_CACHE_DIR, SEED_SAR_CACHE_DIR, fileName);
    if (cachedBuf) {
      const isJpeg = cachedBuf.length >= 2 && cachedBuf[0] === 0xff && cachedBuf[1] === 0xd8;
      res.setHeader('Content-Type', isJpeg ? 'image/jpeg' : 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cachedBuf);
      return;
    }

    const srcRaw = typeof req.query.src === 'string' ? req.query.src : '';
    try {
      const parsed = new URL(srcRaw);
      const allowedHosts = ['datahub.creodias.eu', 'catalogue.dataspace.copernicus.eu', 'zipper.dataspace.copernicus.eu'];
      if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) {
        res.status(400).json({ error: 'Invalid quicklook host' });
        return;
      }

      const upstream = await fetch(parsed.toString(), { redirect: 'follow' });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Upstream HTTP ${upstream.status}` });
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      writeCachedAsset(SAR_CACHE_DIR, fileName, buf);

      const ct = upstream.headers.get('content-type') || 'image/png';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.get('/api/nasa-layer/:layer', async (req, res) => {
    const layerKey = req.params.layer;
    const configs: Record<
      string,
      { layers: string; format: string; mime: string; transparent: boolean; dated: boolean; minBytes: number }
    > = {
      bluemarble: {
        layers: 'BlueMarble_ShadedRelief_Bathymetry',
        format: 'image/jpeg',
        mime: 'image/jpeg',
        transparent: false,
        dated: false,
        minBytes: 40000,
      },
      modis_truecolor: {
        layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
        format: 'image/jpeg',
        mime: 'image/jpeg',
        transparent: false,
        dated: true,
        minBytes: 60000,
      },
      ocean_color: {
        layers: 'MODIS_Aqua_L2_Chlorophyll_A',
        format: 'image/png',
        mime: 'image/png',
        transparent: true,
        dated: true,
        minBytes: 20000,
      },
    };
    const cfg = configs[layerKey];
    if (!cfg) {
      res.status(400).json({ error: 'Invalid NASA layer key' });
      return;
    }

    const dayKey = new Date(Date.now() - 3 * 86400 * 1000).toISOString().slice(0, 10);
    const ext = cfg.format === 'image/png' ? 'png' : 'jpg';
    const fileName = `${layerKey}_${cfg.dated ? dayKey : 'static'}.${ext}`;

    // Check runtime/seed exact match, then any prior seed texture for the same dated layer
    let cachedBuf = readCachedAsset(NASA_CACHE_DIR, SEED_NASA_CACHE_DIR, fileName);
    if (!cachedBuf && cfg.dated) {
      try {
        if (fs.existsSync(SEED_NASA_CACHE_DIR)) {
          const fallbackMatch = fs
            .readdirSync(SEED_NASA_CACHE_DIR)
            .find((f) => f.startsWith(`${layerKey}_`) && f.endsWith(`.${ext}`));
          if (fallbackMatch) {
            cachedBuf = readCachedAsset(NASA_CACHE_DIR, SEED_NASA_CACHE_DIR, fallbackMatch);
          }
        }
      } catch {
        // ignore directory scan errors
      }
    }

    if (cachedBuf) {
      res.setHeader('Content-Type', cfg.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cachedBuf);
      return;
    }

    const offsets = cfg.dated ? [3, 4, 5, 7] : [0];
    for (const dOff of offsets) {
      try {
        const dt = new Date(Date.now() - dOff * 86400 * 1000).toISOString().slice(0, 10);
        const timeParam = cfg.dated ? `&TIME=${dt}` : '';
        const transParam = cfg.transparent ? '&TRANSPARENT=TRUE' : '';
        const wmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${cfg.layers}&STYLES=&FORMAT=${cfg.format}${transParam}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024${timeParam}`;
        const upstream = await fetch(wmsUrl, { signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) continue;
        const ct = upstream.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) continue;
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.byteLength < cfg.minBytes) continue;
        writeCachedAsset(NASA_CACHE_DIR, fileName, buf);
        res.setHeader('Content-Type', cfg.mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buf);
        return;
      } catch {
        // try older offset
      }
    }
    res.status(502).json({ error: 'Unable to fetch NASA GIBS imagery layer' });
  });

  app.get('/api/nasa-snapshot', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const mode = req.query.mode === 'oceancolor' ? 'oceancolor' : 'truecolor';
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -85 || lat > 85 || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'Invalid lat/lon coordinates' });
      return;
    }

    const minLat = Math.max(-89, lat - 2.6).toFixed(3);
    const maxLat = Math.min(89, lat + 2.6).toFixed(3);
    const minLon = Math.max(-179.9, lon - 4.4).toFixed(3);
    const maxLon = Math.min(179.9, lon + 4.4).toFixed(3);
    const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

    const layers =
      mode === 'oceancolor'
        ? 'BlueMarble_ShadedRelief_Bathymetry,MODIS_Aqua_L2_Chlorophyll_A'
        : 'MODIS_Terra_CorrectedReflectance_TrueColor';

    const cacheId = `${mode}_${lat.toFixed(2)}_${lon.toFixed(2)}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `snap_${cacheId}.jpg`;
    const cachedBuf = readCachedAsset(NASA_CACHE_DIR, SEED_NASA_CACHE_DIR, fileName);
    if (cachedBuf) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cachedBuf);
      return;
    }

    for (const dOff of [3, 4, 6, 8]) {
      try {
        const dt = new Date(Date.now() - dOff * 86400 * 1000).toISOString().slice(0, 10);
        const wmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layers}&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=${bboxStr}&WIDTH=640&HEIGHT=380&TIME=${dt}`;
        const upstream = await fetch(wmsUrl, { signal: AbortSignal.timeout(12000) });
        if (!upstream.ok) continue;
        const ct = upstream.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) continue;
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.byteLength < 6000) continue;
        writeCachedAsset(NASA_CACHE_DIR, fileName, buf);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buf);
        return;
      } catch {
        // retry prior date
      }
    }
    res.status(502).json({ error: 'Unable to fetch regional NASA GIBS satellite snapshot' });
  });

  return app;
}

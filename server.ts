import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { checkApiHealth, refreshRealtimePoints, runNereusPipeline } from './server/nereusPipeline.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SAR_CACHE_DIR = path.join(process.cwd(), 'cache', 'sar_thumbnails');

async function startServer() {
  const app = express();
  app.use(express.json());

  if (!fs.existsSync(SAR_CACHE_DIR)) {
    fs.mkdirSync(SAR_CACHE_DIR, { recursive: true });
  }

  app.get('/api/health', async (_req, res) => {
    try {
      const report = await checkApiHealth();
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/nereus', async (_req, res) => {
    try {
      const data = await runNereusPipeline(false);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/realtime', async (_req, res) => {
    try {
      const data = await refreshRealtimePoints();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/refresh', async (_req, res) => {
    try {
      const data = await runNereusPipeline(true);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/sar-preview/:caseId', async (req, res) => {
    const safeId = req.params.caseId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cachePath = path.join(SAR_CACHE_DIR, `${safeId}.bin`);
    if (fs.existsSync(cachePath)) {
      const buf = fs.readFileSync(cachePath);
      const isJpeg = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
      res.setHeader('Content-Type', isJpeg ? 'image/jpeg' : 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
      return;
    }

    const srcRaw = typeof req.query.src === 'string' ? req.query.src : '';
    try {
      const parsed = new URL(srcRaw);
      const allowedHosts = ['datahub.creodias.eu', 'catalogue.dataspace.copernicus.eu', 'zipper.dataspace.copernicus.eu'];
      if (!allowedHosts.includes(parsed.hostname)) {
        res.status(400).json({ error: 'Invalid quicklook host' });
        return;
      }

      const upstream = await fetch(parsed.toString(), { redirect: 'follow' });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Upstream HTTP ${upstream.status}` });
        return;
      }
      const arrBuf = await upstream.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      fs.writeFileSync(cachePath, buf);

      const ct = upstream.headers.get('content-type') || 'image/png';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  const NASA_CACHE_DIR = path.join(process.cwd(), 'cache', 'nasa_textures');
  if (!fs.existsSync(NASA_CACHE_DIR)) {
    fs.mkdirSync(NASA_CACHE_DIR, { recursive: true });
  }

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
    const cacheFile = path.join(
      NASA_CACHE_DIR,
      `${layerKey}_${cfg.dated ? dayKey : 'static'}.${cfg.format === 'image/png' ? 'png' : 'jpg'}`
    );
    if (fs.existsSync(cacheFile)) {
      res.setHeader('Content-Type', cfg.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(fs.readFileSync(cacheFile));
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
        fs.writeFileSync(cacheFile, buf);
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
    const cacheFile = path.join(NASA_CACHE_DIR, `snap_${cacheId}.jpg`);
    if (fs.existsSync(cacheFile)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(fs.readFileSync(cacheFile));
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
        fs.writeFileSync(cacheFile, buf);
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

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nereus observatory listening on http://0.0.0.0:${PORT}`);
    // Pre-warm real ocean telemetry cache on boot
    runNereusPipeline(false).catch((err) => {
      console.warn('Initial Nereus pre-warm notice:', (err as Error).message);
    });
  });
}

startServer();

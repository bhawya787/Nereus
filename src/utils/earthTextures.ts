import * as THREE from 'three';
import { feature } from 'topojson-client';
import landAtlas from 'world-atlas/land-50m.json';

export interface EarthTextureSet {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  nightLightsMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  dispose: () => void;
}

// Fast deterministic 2D value/gradient noise for multi-octave terrain & bathymetry
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function gaussian2D(lat: number, lon: number, cLat: number, cLon: number, sLat: number, sLon: number): number {
  const dLat = (lat - cLat) / sLat;
  const dLon = (lon - cLon) / sLon;
  return Math.exp(-0.5 * (dLat * dLat + dLon * dLon));
}

function fbm(x: number, y: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

// Periodic seamless noise across longitude (u in [0,1])
function sphereFbm(u: number, v: number, scale: number, octaves = 5): number {
  const angle = u * Math.PI * 2;
  const nx = Math.cos(angle) * scale + 13.7;
  const nz = Math.sin(angle) * scale + 29.3;
  const ny = v * scale * 2.0 + 7.1;
  return fbm(nx + ny * 0.37, nz - ny * 0.41, octaves);
}

function traceGeoJsonRings(
  ctx: CanvasRenderingContext2D,
  geom: any,
  w: number,
  h: number
) {
  const lonToX = (lon: number) => ((lon + 180) / 360) * w;
  const latToY = (lat: number) => ((90 - lat) / 180) * h;

  const drawRing = (ring: number[][]) => {
    if (!ring.length) return;
    ctx.moveTo(lonToX(ring[0][0]), latToY(ring[0][1]));
    for (let i = 1; i < ring.length; i++) {
      const prevLon = ring[i - 1][0];
      const currLon = ring[i][0];
      // Prevent antimeridian horizontal streaks
      if (Math.abs(currLon - prevLon) > 180) {
        ctx.moveTo(lonToX(currLon), latToY(ring[i][1]));
      } else {
        ctx.lineTo(lonToX(currLon), latToY(ring[i][1]));
      }
    }
    ctx.closePath();
  };

  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) drawRing(ring);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) drawRing(ring);
    }
  } else if (geom.type === 'GeometryCollection') {
    for (const g of geom.geometries) traceGeoJsonRings(ctx, g, w, h);
  }
}

const MAJOR_CITY_CLUSTERS: Array<[number, number, number]> = [
  // India & Indian Ocean rim
  [19.07, 72.88, 1.0], // Mumbai
  [28.61, 77.21, 1.0], // Delhi
  [12.97, 77.59, 0.85], // Bengaluru
  [13.08, 80.27, 0.9], // Chennai
  [22.57, 88.36, 0.95], // Kolkata
  [17.38, 78.48, 0.85], // Hyderabad
  [23.02, 72.57, 0.8], // Ahmedabad
  [18.52, 73.85, 0.75], // Pune
  [9.93, 76.26, 0.7], // Kochi
  [17.68, 83.21, 0.7], // Visakhapatnam
  [21.17, 72.83, 0.7], // Surat
  [8.52, 76.93, 0.6], // Thiruvananthapuram
  [12.91, 74.85, 0.55], // Mangaluru
  [20.29, 85.82, 0.6], // Bhubaneswar / Paradip
  [6.92, 79.86, 0.75], // Colombo
  [24.86, 67.01, 0.9], // Karachi
  [23.81, 90.41, 0.9], // Dhaka
  [25.27, 55.29, 0.95], // Dubai
  [24.45, 54.37, 0.8], // Abu Dhabi
  [1.35, 103.82, 1.0], // Singapore
  [13.75, 100.5, 0.95], // Bangkok
  [3.13, 101.68, 0.85], // Kuala Lumpur
  [-6.2, 106.84, 0.95], // Jakarta
  // Global hubs for full 360 orbital realism
  [51.5, -0.12, 1.0], // London
  [48.85, 2.35, 0.95], // Paris
  [40.71, -74.0, 1.0], // New York
  [34.05, -118.24, 0.95], // Los Angeles
  [35.67, 139.65, 1.0], // Tokyo
  [31.23, 121.47, 1.0], // Shanghai
  [22.31, 114.16, 0.95], // Hong Kong
  [30.04, 31.23, 0.95], // Cairo
  [-23.55, -46.63, 0.95], // Sao Paulo
  [-33.86, 151.2, 0.85], // Sydney
];

export function generateEarthTextures(maxAnisotropy = 4): EarthTextureSet {
  const width = 2048;
  const height = 1024;

  // Decode Natural Earth 50m land geometry
  const landGeo = feature(landAtlas as any, (landAtlas as any).objects.land) as any;

  // 1. Build crisp binary land mask canvas first
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.fillStyle = '#000000';
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.fillStyle = '#ffffff';
  maskCtx.beginPath();
  if (landGeo.type === 'FeatureCollection') {
    for (const f of landGeo.features) {
      traceGeoJsonRings(maskCtx, f.geometry, width, height);
    }
  } else {
    traceGeoJsonRings(maskCtx, landGeo.geometry ?? landGeo, width, height);
  }
  maskCtx.fill();

  // Coastal shelf glow canvas (for shallow continental shelf bathymetry tint)
  const shelfCanvas = document.createElement('canvas');
  shelfCanvas.width = width / 2;
  shelfCanvas.height = height / 2;
  const shelfCtx = shelfCanvas.getContext('2d')!;
  shelfCtx.filter = 'blur(7px)';
  shelfCtx.drawImage(maskCanvas, 0, 0, shelfCanvas.width, shelfCanvas.height);
  shelfCtx.filter = 'none';

  // Read pixel buffers to synthesize aligned Albedo, Bump, and Roughness maps
  const maskData = maskCtx.getImageData(0, 0, width, height).data;

  // Upsample shelf blur cleanly by sampling shelfCanvas
  const shelfReadCanvas = document.createElement('canvas');
  shelfReadCanvas.width = width;
  shelfReadCanvas.height = height;
  const shelfReadCtx = shelfReadCanvas.getContext('2d')!;
  shelfReadCtx.drawImage(shelfCanvas, 0, 0, width, height);
  const shelfData = shelfReadCtx.getImageData(0, 0, width, height).data;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d')!;
  const albedoImg = albedoCtx.createImageData(width, height);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bumpCtx.createImageData(width, height);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const roughCtx = roughCanvas.getContext('2d')!;
  const roughImg = roughCtx.createImageData(width, height);

  const aBuf = albedoImg.data;
  const bBuf = bumpImg.data;
  const rBuf = roughImg.data;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    const lat = 90 - v * 180;
    const absLat = Math.abs(lat);

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const u = x / width;
      const lon = u * 360 - 180;

      const isLand = maskData[idx] > 128;
      const shelfVal = shelfData[idx] / 255;

      const nMacro = sphereFbm(u, v, 5.5, 4);
      const nDetail = sphereFbm(u + 0.13, v + 0.07, 22.0, 3);
      const ridge = 1.0 - Math.abs(nDetail * 2.0 - 1.0);

      if (!isLand) {
        // Ocean bathymetry: deep abyssal blue-black -> mid-ocean ridge -> turquoise-cobalt coastal shelf
        const bathy = nMacro * 0.65 + nDetail * 0.35;
        const shelf = Math.pow(shelfVal, 1.5);

        let r = 5 + bathy * 12 + shelf * 24;
        let g = 22 + bathy * 28 + shelf * 68;
        let b = 42 + bathy * 42 + shelf * 82;

        // Polar sea ice above 74 deg
        if (absLat > 74 + (nMacro - 0.5) * 6) {
          const iceT = Math.min(1, (absLat - 72) / 10);
          r = r * (1 - iceT) + 215 * iceT;
          g = g * (1 - iceT) + 228 * iceT;
          b = b * (1 - iceT) + 234 * iceT;
          rBuf[idx] = rBuf[idx + 1] = rBuf[idx + 2] = Math.round(145 * iceT + 48 * (1 - iceT));
        } else {
          // Ocean roughness calibrated for natural sunlight sheen without blowing out coastlines
          rBuf[idx] = rBuf[idx + 1] = rBuf[idx + 2] = Math.round(74 + shelf * 22);
        }

        aBuf[idx] = Math.min(255, Math.round(r));
        aBuf[idx + 1] = Math.min(255, Math.round(g));
        aBuf[idx + 2] = Math.min(255, Math.round(b));
        aBuf[idx + 3] = 255;

        bBuf[idx] = bBuf[idx + 1] = bBuf[idx + 2] = Math.round(12 + shelf * 18);
        bBuf[idx + 3] = 255;
        rBuf[idx + 3] = 255;
      } else {
        // Organic fBm elevation + smooth Gaussian mountain belts (zero rectangular artifacts)
        let elev = nMacro * 0.48 + ridge * 0.38 + (nDetail - 0.5) * 0.14;

        const himalayaField =
          gaussian2D(lat, lon, 32.5, 86.0, 4.2, 13.5) * (0.65 + 0.55 * ridge);
        const hinduKushField =
          gaussian2D(lat, lon, 35.5, 71.0, 3.2, 5.5) * (0.6 + 0.5 * ridge);
        const westernGhatsField =
          gaussian2D(lat, lon, 14.5, 74.6, 5.0, 1.4) * (0.5 + 0.5 * ridge);
        const andesField =
          gaussian2D(lat, lon, -20.0, -68.5, 22.0, 3.2) * (0.6 + 0.5 * ridge);

        elev = Math.min(
          1,
          elev + himalayaField * 0.42 + hinduKushField * 0.34 + westernGhatsField * 0.18 + andesField * 0.36
        );

        // Smooth Gaussian arid / desert blend (Sahara, Arabia, Thar, Central Asia)
        const saharaArabia = gaussian2D(lat, lon, 23.0, 26.0, 8.0, 32.0);
        const thar = gaussian2D(lat, lon, 26.8, 71.2, 3.2, 3.4);
        const centralAsia = gaussian2D(lat, lon, 40.5, 64.0, 6.0, 16.0);
        const subtropArid = Math.max(0, 1 - Math.abs(absLat - 25) / 11) * 0.45;
        const arid = Math.min(
          1,
          Math.max(saharaArabia, thar * 0.92, centralAsia * 0.8, subtropArid) * (0.72 + 0.52 * nMacro)
        );

        // Smooth vegetation base (tropical forests & Indo-Gangetic / peninsular greenery)
        const lush = Math.max(0, 1 - absLat / 55) * (0.5 + nMacro * 0.5) * (1 - arid * 0.78);

        let r = 52 + (1 - lush) * 46 + nDetail * 20;
        let g = 74 + lush * 28 + nDetail * 22;
        let b = 48 + (1 - lush) * 20 + nDetail * 14;

        // Blend desert sandstone smoothly
        const desertT = Math.max(0, Math.min(1, (arid - 0.28) * 1.9));
        const dR = 140 + nDetail * 32 - elev * 20;
        const dG = 114 + nDetail * 24 - elev * 18;
        const dB = 82 + nDetail * 16 - elev * 14;
        r = r * (1 - desertT) + dR * desertT;
        g = g * (1 - desertT) + dG * desertT;
        b = b * (1 - desertT) + dB * desertT;

        // Blend alpine snow ridges organically (only high peaks + polar latitudes)
        const alpineTrigger = elev - (0.74 - Math.max(0, absLat - 28) * 0.008);
        const snowT = Math.max(0, Math.min(1, Math.max(alpineTrigger * 4.2, (absLat - 67) / 8)));
        r = r * (1 - snowT) + (214 + nDetail * 18) * snowT;
        g = g * (1 - snowT) + (222 + nDetail * 18) * snowT;
        b = b * (1 - snowT) + (228 + nDetail * 16) * snowT;

        const shade = 0.85 + elev * 0.28;
        aBuf[idx] = Math.min(255, Math.round(r * shade));
        aBuf[idx + 1] = Math.min(255, Math.round(g * shade));
        aBuf[idx + 2] = Math.min(255, Math.round(b * shade));
        aBuf[idx + 3] = 255;

        const bVal = Math.min(255, Math.round(80 + elev * 175));
        bBuf[idx] = bBuf[idx + 1] = bBuf[idx + 2] = bVal;
        bBuf[idx + 3] = 255;

        // Matte terrain roughness
        rBuf[idx] = rBuf[idx + 1] = rBuf[idx + 2] = Math.round(196 + nDetail * 42);
        rBuf[idx + 3] = 255;
      }
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  // 2. Night-side urban lights canvas
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = 1024;
  nightCanvas.height = 512;
  const nightCtx = nightCanvas.getContext('2d')!;
  nightCtx.fillStyle = '#000000';
  nightCtx.fillRect(0, 0, nightCanvas.width, nightCanvas.height);

  for (const [lat, lon, weight] of MAJOR_CITY_CLUSTERS) {
    const cx = ((lon + 180) / 360) * nightCanvas.width;
    const cy = ((90 - lat) / 180) * nightCanvas.height;
    const rad = 5 + weight * 6;
    const grad = nightCtx.createRadialGradient(cx, cy, 0.5, cx, cy, rad);
    grad.addColorStop(0, `rgba(255, 206, 130, ${0.85 * weight})`);
    grad.addColorStop(0.45, `rgba(255, 166, 78, ${0.35 * weight})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    nightCtx.fillStyle = grad;
    nightCtx.beginPath();
    nightCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    nightCtx.fill();
  }

  // 3. Procedural atmospheric cloud layer
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 1024;
  cloudCanvas.height = 512;
  const cloudCtx = cloudCanvas.getContext('2d')!;
  const cloudImg = cloudCtx.createImageData(cloudCanvas.width, cloudCanvas.height);
  const cBuf = cloudImg.data;

  for (let y = 0; y < cloudCanvas.height; y++) {
    const v = y / cloudCanvas.height;
    const lat = 90 - v * 180;
    // ITCZ & mid-latitude storm band weighting
    const band =
      0.75 +
      0.25 * Math.cos(((lat - 8) * Math.PI) / 45) +
      0.2 * Math.exp(-Math.pow((Math.abs(lat) - 48) / 14, 2));

    for (let x = 0; x < cloudCanvas.width; x++) {
      const idx = (y * cloudCanvas.width + x) * 4;
      const u = x / cloudCanvas.width;
      const swirl = sphereFbm(u + 0.04 * Math.sin(v * Math.PI * 3), v, 4.2, 4);
      const wisps = sphereFbm(u + swirl * 0.08, v + swirl * 0.05, 11.0, 3);
      const density = Math.max(0, (swirl * 0.6 + wisps * 0.4) * band - 0.54) * 2.5;
      const alpha = Math.min(185, Math.round(Math.pow(density, 1.3) * 255));

      cBuf[idx] = 236;
      cBuf[idx + 1] = 243;
      cBuf[idx + 2] = 248;
      cBuf[idx + 3] = alpha;
    }
  }
  cloudCtx.putImageData(cloudImg, 0, 0);

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;

  const nightLightsMap = new THREE.CanvasTexture(nightCanvas);
  nightLightsMap.colorSpace = THREE.SRGBColorSpace;

  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;

  return {
    albedoMap,
    bumpMap,
    roughnessMap,
    nightLightsMap,
    cloudMap,
    dispose: () => {
      albedoMap.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
      nightLightsMap.dispose();
      cloudMap.dispose();
    },
  };
}

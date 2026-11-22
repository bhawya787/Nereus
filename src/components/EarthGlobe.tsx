import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { DetectionFeature, SignalId } from '../types/nereus';
import { generateEarthTextures } from '../utils/earthTextures';
import { latLonToVector3 } from '../utils/nereusMath';

export type EarthImageryMode = 'bluemarble' | 'nasa_truecolor' | 'ocean_color' | 'relief';

export interface CameraPreset {
  id: string;
  label: string;
  lat: number;
  lon: number;
  distance: number;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'global', label: 'Global', lat: 15.0, lon: 62.0, distance: 2.95 },
  { id: 'india', label: 'India Coast', lat: 14.5, lon: 79.0, distance: 2.15 },
  { id: 'pacific', label: 'Pacific', lat: 8.0, lon: 150.0, distance: 2.85 },
  { id: 'atlantic', label: 'Atlantic', lat: 24.0, lon: -42.0, distance: 2.85 },
  { id: 'arabian', label: 'Arabian Sea', lat: 16.5, lon: 68.5, distance: 2.05 },
  { id: 'bengal', label: 'Bay of Bengal', lat: 15.5, lon: 86.5, distance: 2.05 },
];

interface EarthGlobeProps {
  detections: DetectionFeature[];
  activeLayers: Record<SignalId, boolean>;
  selectedId: string | null;
  imageryMode: EarthImageryMode;
  flyTarget: { lat: number; lon: number; distance?: number; nonce: number } | null;
  onSelectDetection: (detection: DetectionFeature | null) => void;
}

function getMarkerColorHex(d: DetectionFeature, isSelected: boolean): number {
  if (isSelected) return 0xffffff;
  if (d.severity === 'alert' || d.severity === 'historical') {
    return 0xff5a3c;
  }
  if (d.severity === 'watch') {
    return 0xf5b041;
  }
  return 0x7fe0d0;
}

export function EarthGlobe({
  detections,
  activeLayers,
  selectedId,
  imageryMode,
  flyTarget,
  onSelectDetection,
}: EarthGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<{
    title: string;
    region: string;
    lat: number;
    lon: number;
    signal: string;
  } | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Refs to share live React state without tearing down WebGL scene
  const onSelectRef = useRef(onSelectDetection);
  onSelectRef.current = onSelectDetection;
  const detectionsRef = useRef(detections);
  detectionsRef.current = detections;
  const activeLayersRef = useRef(activeLayers);
  activeLayersRef.current = activeLayers;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // Imperative hooks into the Three.js scene
  const sceneHooksRef = useRef<{
    rebuildMarkers: () => void;
    flyTo: (lat: number, lon: number, distance?: number) => void;
    setImageryMode: (mode: EarthImageryMode) => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL guard per Three.js skill
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglError('WebGL context unavailable in this browser.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('3D graphics context was suspended. Reload to restore.');
    };
    const handleContextRestored = () => setWebglError(null);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04121f);

    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 60);

    // Initial framing centered globally showing multiple continents & ocean basins
    const initPos = latLonToVector3(15.0, 62.0, 2.95);
    camera.position.set(initPos.x, initPos.y, initPos.z);

    // Studio PMREM Environment for crisp ocean specular highlights
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Warm/cool directional orbital sunlight
    const sunDir = new THREE.Vector3(0.45, 0.45, -0.77).normalize();
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sunLight.position.copy(sunDir).multiplyScalar(8);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x7fe0d0, 0x061523, 0.55);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x4ca8e0, 0.75);
    rimLight.position.set(-5, -2, 5);
    scene.add(rimLight);

    // Subtle deep-space starfield (single Points draw call)
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2 * Math.PI;
      const phi = Math.acos(2 * v - 1);
      const r = 18 + Math.random() * 14;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcfe4ea,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Generate high-res Natural Earth textures procedurally
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const earthTex = generateEarthTextures(maxAniso);

    // Primary Earth sphere with custom night-lights terminator shader extension
    const earthGeo = new THREE.SphereGeometry(1, 72, 72);
    const earthMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: earthTex.albedoMap,
      bumpMap: earthTex.bumpMap,
      bumpScale: 0.022,
      roughnessMap: earthTex.roughnessMap,
      roughness: 0.94,
      metalness: 0.02,
      clearcoat: 0.06,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.45,
      emissive: new THREE.Color(0xffcc77),
      emissiveMap: earthTex.nightLightsMap,
      emissiveIntensity: 1.0,
    });

    earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: sunDir };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWorldNorm;'
        )
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nvWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDir;\nvarying vec3 vWorldNorm;'
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float sunDot = dot(normalize(vWorldNorm), normalize(uSunDir));
           float nightMask = smoothstep(0.12, -0.22, sunDot);
           totalEmissiveRadiance *= nightMask;`
        );
    };

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    // NASA Ocean Color Chlorophyll-a overlay sphere (R = 1.0012, toggled in 'ocean_color' mode)
    const oceanColorGeo = new THREE.SphereGeometry(1.0012, 72, 72);
    const oceanColorMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      visible: false,
    });
    const oceanColorMesh = new THREE.Mesh(oceanColorGeo, oceanColorMat);
    scene.add(oceanColorMesh);

    // Cache loaded NASA satellite textures cleanly
    const texLoader = new THREE.TextureLoader();
    const nasaCache: Partial<Record<'bluemarble' | 'modis_truecolor' | 'ocean_color', THREE.Texture>> = {};
    let currentImagery: EarthImageryMode = imageryMode;

    const loadNasaTexture = (
      key: 'bluemarble' | 'modis_truecolor' | 'ocean_color',
      onReady: (tex: THREE.Texture) => void
    ) => {
      if (nasaCache[key]) {
        onReady(nasaCache[key]!);
        return;
      }
      texLoader.load(
        `/api/nasa-layer/${key}`,
        (tex) => {
          if (disposed) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          tex.needsUpdate = true;
          nasaCache[key] = tex;
          onReady(tex);
        },
        undefined,
        () => {
          // keep procedural Natural Earth fallback if offline
        }
      );
    };

    // Dynamic atmospheric cloud shell
    const cloudGeo = new THREE.SphereGeometry(1.012, 64, 64);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: earthTex.cloudMap,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      roughness: 0.95,
      metalness: 0,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(cloudMesh);

    const applyImageryMode = (mode: EarthImageryMode) => {
      currentImagery = mode;
      if (mode === 'relief') {
        earthMat.map = earthTex.albedoMap;
        earthMat.needsUpdate = true;
        oceanColorMat.visible = false;
        cloudMesh.visible = true;
        requestRender();
        return;
      }
      if (mode === 'nasa_truecolor') {
        oceanColorMat.visible = false;
        cloudMesh.visible = false; // MODIS True Color already displays real clouds
        loadNasaTexture('modis_truecolor', (tex) => {
          if (currentImagery === 'nasa_truecolor') {
            earthMat.map = tex;
            earthMat.needsUpdate = true;
            requestRender();
          }
        });
        requestRender();
        return;
      }
      if (mode === 'ocean_color') {
        cloudMesh.visible = false;
        loadNasaTexture('bluemarble', (bm) => {
          if (currentImagery === 'ocean_color') {
            earthMat.map = bm;
            earthMat.needsUpdate = true;
            requestRender();
          }
        });
        loadNasaTexture('ocean_color', (oc) => {
          if (currentImagery === 'ocean_color') {
            oceanColorMat.map = oc;
            oceanColorMat.visible = true;
            oceanColorMat.needsUpdate = true;
            requestRender();
          }
        });
        requestRender();
        return;
      }
      // Default: 'bluemarble' NASA satellite imagery + subtle clouds
      oceanColorMat.visible = false;
      cloudMesh.visible = true;
      loadNasaTexture('bluemarble', (bm) => {
        if (currentImagery === 'bluemarble') {
          earthMat.map = bm;
          earthMat.needsUpdate = true;
          requestRender();
        }
      });
    };

    // Rayleigh / Fresnel atmospheric limb halo
    const atmoGeo = new THREE.SphereGeometry(1.048, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vNormalWorld;
        varying vec3 vPosWorld;
        void main() {
          vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        varying vec3 vNormalWorld;
        varying vec3 vPosWorld;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vPosWorld);
          float rim = pow(clamp(0.68 - dot(vNormalWorld, -viewDir), 0.0, 1.0), 3.0);
          float sunFacing = clamp(dot(vNormalWorld, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
          float terminator = exp(-pow(dot(vNormalWorld, normalize(uSunDir)) * 3.5, 2.0));
          vec3 dayColor = vec3(0.28, 0.68, 0.92);
          vec3 duskColor = vec3(0.98, 0.44, 0.28);
          vec3 col = mix(dayColor, duskColor, terminator * 0.35);
          float alpha = rim * (0.18 + 0.72 * sunFacing);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmoMesh);

    // Subtle geographic lat/lon graticule around Earth (R = 1.0025)
    const gratGroup = new THREE.Group();
    const gratMat = new THREE.LineBasicMaterial({
      color: 0x7fe0d0,
      transparent: true,
      opacity: 0.08,
    });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = latLonToVector3(lat, lon, 1.0025);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -85; lat <= 85; lat += 4) {
        const p = latLonToVector3(lat, lon, 1.0025);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
    }
    scene.add(gratGroup);

    // Detection markers & polygon overlays container
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);

    // Shared geometries for composite 3-part detection beacons (ring + stem + head)
    const ringGeo = new THREE.RingGeometry(0.007, 0.011, 20);
    const stemGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.024, 6);
    const headGeo = new THREE.OctahedronGeometry(0.0068, 0);
    const hitGeo = new THREE.SphereGeometry(0.02, 10, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    const upVec = new THREE.Vector3(0, 1, 0);
    const tempNorm = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    let clickableHits: THREE.Object3D[] = [];
    const disposableMarkerResources: Array<{ dispose: () => void }> = [];

    function rebuildMarkers() {
      // Clear previous markers safely
      while (markersGroup.children.length > 0) {
        markersGroup.remove(markersGroup.children[0]);
      }
      for (const r of disposableMarkerResources) r.dispose();
      disposableMarkerResources.length = 0;
      clickableHits = [];

      const visible = detectionsRef.current.filter((d) => activeLayersRef.current[d.signal]);
      for (const det of visible) {
        const isSel = det.id === selectedIdRef.current;
        const colorHex = getMarkerColorHex(det, isSel);
        const surf = latLonToVector3(det.lat, det.lon, 1.004);
        tempNorm.set(surf.x, surf.y, surf.z).normalize();
        tempQuat.setFromUnitVectors(upVec, tempNorm);

        const beacon = new THREE.Group();
        beacon.position.set(surf.x, surf.y, surf.z);
        beacon.quaternion.copy(tempQuat);

        const mat = new THREE.MeshStandardMaterial({
          color: colorHex,
          emissive: colorHex,
          emissiveIntensity: isSel ? 1.15 : 0.65,
          roughness: 0.25,
          metalness: 0.2,
        });
        const ringMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isSel ? 0.95 : 0.72,
        });
        disposableMarkerResources.push(mat, ringMat);

        // 1. Surface anchor ring (aligned flat against sphere tangent)
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(isSel ? 1.45 : 1.0);
        beacon.add(ring);

        // 2. Vertical telemetry stem
        const stem = new THREE.Mesh(stemGeo, mat);
        stem.position.y = 0.016;
        beacon.add(stem);

        // 3. Beacon head
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 0.036;
        head.scale.setScalar(isSel ? 1.35 : 1.0);
        beacon.add(head);

        // Invisible raycast proxy sphere for effortless clicking
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.y = 0.022;
        hit.layers.set(1);
        hit.userData.detection = det;
        beacon.add(hit);
        clickableHits.push(hit);

        markersGroup.add(beacon);

        // Render surface polygon outline if present
        if (det.polygon && det.polygon.length >= 3) {
          const pts = det.polygon.map(([lon, lat]) => {
            const p = latLonToVector3(lat, lon, 1.0045);
            return new THREE.Vector3(p.x, p.y, p.z);
          });
          const polyGeo = new THREE.BufferGeometry().setFromPoints(pts);
          const polyMat = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: isSel ? 0.95 : 0.75,
          });
          disposableMarkerResources.push(polyGeo, polyMat);
          markersGroup.add(new THREE.Line(polyGeo, polyMat));
        }
      }
    }

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.35;
    controls.maxDistance = 4.2;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.75;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;

    // Camera fly-to transition state (exponential damping)
    const flyState = {
      active: false,
      targetPos: new THREE.Vector3().copy(camera.position),
    };

    function flyTo(lat: number, lon: number, distance = 1.95) {
      const p = latLonToVector3(lat, lon, distance);
      flyState.targetPos.set(p.x, p.y, p.z);
      flyState.active = true;
      requestRender();
    }

    controls.addEventListener('start', () => {
      flyState.active = false;
    });

    // Render-on-demand scheduler + software WebGL afterDraw pacing
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (gl && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) return;
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // fallback below
      }
      frameId = window.setTimeout(cb, 80);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        renderDirty = false;

        if (flyState.active) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, flyState.targetPos.x, 5.5, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, flyState.targetPos.y, 5.5, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, flyState.targetPos.z, 5.5, dt);
          const distRemaining = camera.position.distanceTo(flyState.targetPos);
          if (distRemaining < 0.008) {
            camera.position.copy(flyState.targetPos);
            flyState.active = false;
          } else {
            renderDirty = true;
          }
        }

        if (!isSoftwareGl) {
          cloudMesh.rotation.y += dt * 0.006;
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || flyState.active) requestRender();
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);

    // Raycasting on dedicated layer 1 for crisp, fast detection selection
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverAt = 0;

    function updatePointer(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 6) return; // drag ended, not click
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableHits, false);
      if (hits.length > 0) {
        const det = hits[0].object.userData.detection as DetectionFeature;
        onSelectRef.current(det);
        flyTo(det.lat, det.lon, 1.82);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverAt < 60) return;
      lastHoverAt = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableHits, false);
      if (hits.length > 0) {
        const det = hits[0].object.userData.detection as DetectionFeature;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredInfo({
          title: det.title,
          region: det.region,
          lat: det.lat,
          lon: det.lon,
          signal: det.signal,
        });
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredInfo(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    rebuildMarkers();
    applyImageryMode(imageryMode);
    sceneHooksRef.current = {
      rebuildMarkers: () => {
        rebuildMarkers();
        requestRender();
      },
      flyTo,
      setImageryMode: applyImageryMode,
    };
    requestRender();

    // Gentle cloud animation loop on GPU only (software WebGL remains on-demand for fast crispness)
    let cloudTimer = 0;
    if (!isSoftwareGl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cloudTimer = window.setInterval(() => {
        requestRender();
      }, 60);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      clearInterval(cloudTimer);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      controls.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      oceanColorGeo.dispose();
      oceanColorMat.dispose();
      for (const tex of Object.values(nasaCache)) tex?.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      ringGeo.dispose();
      stemGeo.dispose();
      headGeo.dispose();
      hitGeo.dispose();
      hitMat.dispose();
      gratMat.dispose();
      for (const r of disposableMarkerResources) r.dispose();
      earthTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild markers cleanly whenever data/layers/selection changes
  useEffect(() => {
    sceneHooksRef.current?.rebuildMarkers();
  }, [detections, activeLayers, selectedId]);

  // Switch NASA Satellite / NASA Ocean Color / Natural Earth imagery cleanly
  useEffect(() => {
    sceneHooksRef.current?.setImageryMode(imageryMode);
  }, [imageryMode]);

  // Smoothly fly camera when preset or alert item triggers flyTarget
  useEffect(() => {
    if (flyTarget) {
      sceneHooksRef.current?.flyTo(flyTarget.lat, flyTarget.lon, flyTarget.distance ?? 1.9);
    }
  }, [flyTarget]);

  const visibleCount = detections.filter((d) => activeLayers[d.signal]).length;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-ocean)' }}
      data-testid="earth-canvas-container"
      data-visible-count={visibleCount}
      data-selected-id={selectedId ?? ''}
    >
      <div ref={mountRef} className="w-full h-full" />

      {webglError && (
        <div
          className="absolute inset-0 flex items-center justify-center p-6 text-center"
          style={{ backgroundColor: 'var(--bg-ocean)' }}
        >
          <div className="nereus-surface max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">3D Globe Unavailable</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {webglError} Switch to the Alerts or Trends tabs to inspect all live coastal telemetry.
            </p>
          </div>
        </div>
      )}

      {hoveredInfo && (
        <div
          className="pointer-events-none absolute top-16 left-4 z-10 px-3 py-2 nereus-surface-alpha"
          role="status"
          aria-live="polite"
        >
          <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {hoveredInfo.title}
          </div>
          <div
            className="text-xs font-data mt-0.5 flex items-center gap-2"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>{hoveredInfo.region}</span>
            <span aria-hidden="true">·</span>
            <span>
              {hoveredInfo.lat.toFixed(2)}°N, {hoveredInfo.lon.toFixed(2)}°E
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

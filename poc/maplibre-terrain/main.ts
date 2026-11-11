import { addProtocol, getVersion, Map as MapLibreMap, NavigationControl, setWorkerCount, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import china from '../../src/assets/geo/china.json';
import demPngDataUrl from './data/dem-z9-384-211.png?inline';
import demMetadata from './data/dem-metadata.json';
import workerSourceBase64 from 'virtual:cf-maplibre-worker-source';

type PocState = {
  ready: boolean;
  engine: string;
  mode: 'dev' | 'single-file';
  terrainProtocol: 'cf-dem';
  terrainTileBytes: number;
  requestedTiles: string[];
  externalRequests: string[];
  error?: string;
};

declare global {
  interface Window { __MAP_TERRAIN_POC__?: PocState }
}

const status = document.querySelector<HTMLDivElement>('#status');
const initialState: PocState = {
  ready: false,
  engine: `MapLibre GL JS ${getVersion()}`,
  mode: location.protocol === 'file:' ? 'single-file' : 'dev',
  terrainProtocol: 'cf-dem',
  terrainTileBytes: 0,
  requestedTiles: [],
  externalRequests: [],
};
window.__MAP_TERRAIN_POC__ = initialState;

function setStatus(text: string, state: 'loading' | 'ready' | 'error') {
  if (!status) return;
  status.textContent = text;
  status.dataset.state = state;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Inline data URI is malformed.');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeBase64Text(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const demBytes = decodeDataUrl(demPngDataUrl);
const demMetadataTyped = demMetadata as {
  tile: { z: number; x: number; y: number };
  queryBoundsWgs84: [number, number, number, number];
  output: { bytes: number; minElevationMeters: number; maxElevationMeters: number };
};
const expected = demMetadataTyped.tile;
const tileName = `/${expected.z}/${expected.x}/${expected.y}.png`;

// 固定、编译期受控的内存读取器：只返回这一块随包内嵌的 PNG，不读取 URL / 用户代码 / 文件系统。
addProtocol('cf-dem', async (request) => {
  const url = new URL(request.url);
  if (!url.pathname.endsWith(tileName)) {
    throw new Error(`POC only contains the recorded DEM tile ${tileName}; got ${url.pathname}`);
  }
  initialState.requestedTiles.push(request.url);
  const copy = demBytes.slice();
  return { data: copy.buffer };
});

// 内嵌官方 worker bundle，避免 MapLibre 在 file:// 下通过相对路径或网络读取 worker。
const workerBlobUrl = URL.createObjectURL(new Blob([decodeBase64Text(workerSourceBase64)], { type: 'text/javascript' }));
setWorkerUrl(workerBlobUrl);
setWorkerCount(1);

const [west, south, east, north] = demMetadataTyped.queryBoundsWgs84;
const map = new MapLibreMap({
  container: 'map',
  style: {
    version: 8,
    sources: {
      terrain: {
        type: 'raster-dem',
        tiles: ['cf-dem://tile/{z}/{x}/{y}.png'],
        tileSize: 256,
        minzoom: expected.z,
        maxzoom: expected.z,
        bounds: [west, south, east, north],
        encoding: 'terrarium',
      },
      china: { type: 'geojson', data: china as GeoJSON.FeatureCollection },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#08111d' } },
      {
        id: 'dem-hillshade',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          'hillshade-exaggeration': 0.72,
          'hillshade-shadow-color': '#07121c',
          'hillshade-highlight-color': '#b8dfd6',
          'hillshade-accent-color': '#38a6a6',
          'hillshade-illumination-direction': 315,
        },
      },
      { id: 'china-fill', type: 'fill', source: 'china', paint: { 'fill-color': '#164051', 'fill-opacity': 0.42 } },
      { id: 'china-outline', type: 'line', source: 'china', paint: { 'line-color': '#62d7c3', 'line-width': 1.15, 'line-opacity': 0.9 } },
    ],
  },
  center: [(west + east) / 2, (south + north) / 2],
  zoom: expected.z + 0.6,
  minZoom: expected.z,
  maxZoom: expected.z + 2,
  pitch: 42,
  bearing: -15,
  maxBounds: [[west, south], [east, north]],
  attributionControl: false,
  antialias: true,
  preserveDrawingBuffer: true,
});
map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');

map.on('error', (event) => {
  const message = event.error?.message || 'MapLibre emitted an unknown error.';
  if (!initialState.error) initialState.error = message;
  setStatus(`地形错误：${message}`, 'error');
});
map.once('load', () => {
  try {
    map.setTerrain({ source: 'terrain', exaggeration: 1.35 });
    initialState.terrainTileBytes = demBytes.byteLength;
    setStatus('WebGL 场景已载入，检查地形瓦片…', 'loading');
  } catch (error) {
    initialState.error = error instanceof Error ? error.message : String(error);
    setStatus(`无法启用地形：${initialState.error}`, 'error');
  }
});
map.once('idle', () => {
  const elevation = map.queryTerrainElevation(map.getCenter());
  initialState.centerElevationMeters = elevation ?? null;
  if (!initialState.error && initialState.requestedTiles.length > 0 && Number.isFinite(elevation)) {
    initialState.ready = true;
    setStatus(`真实 DEM 地形已就绪 · 中心高程 ${Math.round(elevation!)} m · 本地无网络`, 'ready');
  } else if (!initialState.error) {
    initialState.error = initialState.requestedTiles.length === 0
      ? 'DEM tile was not requested.'
      : 'Terrain elevation is unavailable at the map center.';
    setStatus(`地形验收失败：${initialState.error}`, 'error');
  }
});
window.addEventListener('beforeunload', () => URL.revokeObjectURL(workerBlobUrl), { once: true });

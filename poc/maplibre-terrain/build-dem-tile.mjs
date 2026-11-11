import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, 'data');
const Z = 9;
const X = 384;
const Y = 211;
const SIZE = 256;
const DATASET = 'ETOPO_2022_v1_15s';
const ENDPOINT = `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/${DATASET}.csv`;

function mercatorLat(y) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** Z))) * 180 / Math.PI;
}
const bounds = {
  west: X / 2 ** Z * 360 - 180,
  east: (X + 1) / 2 ** Z * 360 - 180,
  north: mercatorLat(Y),
  south: mercatorLat(Y + 1),
};

// ETOPO latitude is stored north-to-south, so the query order is deliberate.
const constraint = `z[(${bounds.north}):(${bounds.south})][(${bounds.west}):(${bounds.east})]`;
const requestUrl = `${ENDPOINT}?${encodeURIComponent(constraint)}`;
const rawName = `etopo-2022-${DATASET}-z${Z}-${X}-${Y}.csv`;
const tileName = `dem-z${Z}-${X}-${Y}.png`;
mkdirSync(DATA, { recursive: true });

console.log(`Fetching NOAA ERDDAP DEM subset: z${Z}/${X}/${Y}`);
const csv = execFileSync('curl.exe', [
  '--fail', '--location', '--silent', '--show-error', '--globoff', '--max-time', '120', requestUrl,
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const rawPath = resolve(DATA, rawName);
writeFileSync(rawPath, csv, 'utf8');

const points = [];
for (const line of csv.split(/\r?\n/)) {
  const cols = line.split(',');
  if (cols.length < 3) continue;
  const lat = Number(cols[0]);
  const lon = Number(cols[1]);
  const height = Number(cols[2]);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(height)) {
    points.push({ lat, lon, height });
  }
}
if (points.length < 4) throw new Error(`Expected a gridded DEM subset; parsed only ${points.length} numeric samples.`);

const lats = [...new Set(points.map((p) => p.lat))].sort((a, b) => a - b);
const lons = [...new Set(points.map((p) => p.lon))].sort((a, b) => a - b);
const rowByLat = new Map(lats.map((lat) => [lat, new Map()]));
for (const p of points) rowByLat.get(p.lat).set(p.lon, p.height);
if (lats.some((lat) => rowByLat.get(lat).size !== lons.length)) {
  throw new Error('NOAA response is not a complete rectangular grid; refusing to fabricate/fill data.');
}

function bracket(values, value) {
  const v = Math.max(values[0], Math.min(values[values.length - 1], value));
  let lo = 0;
  let hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= v) lo = mid;
    else hi = mid;
  }
  return [lo, hi, (v - values[lo]) / (values[hi] - values[lo] || 1)];
}
function sample(lon, lat) {
  const [x0, x1, tx] = bracket(lons, lon);
  const [y0, y1, ty] = bracket(lats, lat);
  const a = rowByLat.get(lats[y0]);
  const b = rowByLat.get(lats[y1]);
  const h00 = a.get(lons[x0]);
  const h10 = a.get(lons[x1]);
  const h01 = b.get(lons[x0]);
  const h11 = b.get(lons[x1]);
  return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
}

const rawSamples = new Float32Array(SIZE * SIZE);
let min = Infinity;
let max = -Infinity;
let sum = 0;
for (let py = 0; py < SIZE; py++) {
  const tileY = Y + (py + 0.5) / SIZE;
  const lat = mercatorLat(tileY);
  for (let px = 0; px < SIZE; px++) {
    const lon = ((X + (px + 0.5) / SIZE) / 2 ** Z) * 360 - 180;
    const height = sample(lon, lat);
    rawSamples[py * SIZE + px] = height;
    min = Math.min(min, height);
    max = Math.max(max, height);
    sum += height;
  }
}

// MapLibre Terrarium encoding: elevation = R*256 + G + B/256 - 32768.
const scanlines = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  const row = y * (1 + SIZE * 4);
  scanlines[row] = 0; // PNG filter: None
  for (let x = 0; x < SIZE; x++) {
    const h = Math.max(-32768, Math.min(32767.996, rawSamples[y * SIZE + x]));
    const encoded = h + 32768;
    const whole = Math.floor(encoded);
    const i = row + 1 + x * 4;
    scanlines[i] = whole >> 8;
    scanlines[i + 1] = whole & 255;
    scanlines[i + 2] = Math.floor((encoded - whole) * 256);
    scanlines[i + 3] = 255;
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
 ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const tilePath = resolve(DATA, tileName);
writeFileSync(tilePath, png);

const metadata = {
  title: 'ETOPO 2022 v1 15 arc-second global relief model (Ice Surface)',
  provider: 'NOAA National Centers for Environmental Information (NCEI)',
  datasetId: DATASET,
  sourceUrl: 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.html',
  metadataUrl: 'https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.dem%3Aetopo_2022',
  sourceResolution: '15 arc-seconds',
  license: 'CC0 1.0 (per NOAA NCEI metadata; retain source citation and verify metadata before broader redistribution)',
  disclaimer: 'ETOPO is a global relief model; its source inputs and accuracy vary by location. This POC is not a navigational or surveying product.',
  requestUrl,
  variable: 'z (meters above/below mean sea level)',
  queryBoundsWgs84: [bounds.west, bounds.south, bounds.east, bounds.north],
  tile: { z: Z, x: X, y: Y, width: SIZE, height: SIZE, encoding: 'MapLibre Terrarium RGB' },
  rawSample: {
    file: rawName,
    bytes: Buffer.byteLength(csv),
    sha256: createHash('sha256').update(csv).digest('hex'),
    rows: points.length,
    width: lons.length,
    height: lats.length,
    minElevationMeters: Math.min(...points.map((p) => p.height)),
    maxElevationMeters: Math.max(...points.map((p) => p.height)),
  },
  processing: 'Bilinear interpolation from the NOAA 15-arc-second gridded subset to 256x256 Web Mercator pixel centers; no synthetic/random values or extrapolated grid are introduced.',
  output: {
    file: tileName,
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
    minElevationMeters: Number(min.toFixed(2)),
    maxElevationMeters: Number(max.toFixed(2)),
    meanElevationMeters: Number((sum / rawSamples.length).toFixed(2)),
  },
};
writeFileSync(resolve(DATA, 'dem-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({
  rawBytes: metadata.rawSample.bytes,
  rawGrid: `${lons.length}x${lats.length}`,
  tileBytes: png.length,
  min: metadata.output.minElevationMeters,
  max: metadata.output.maxElevationMeters,
  mean: metadata.output.meanElevationMeters,
  bounds: metadata.queryBoundsWgs84,
}, null, 2));

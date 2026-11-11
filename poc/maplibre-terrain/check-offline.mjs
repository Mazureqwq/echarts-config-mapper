import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

function countScreenshotColors(png, step = 12) {
  if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error('Screenshot is not a PNG.');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`Unsupported screenshot PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = width * bytesPerPixel;
  let previous = Buffer.alloc(rowBytes);
  let cursor = 0;
  const colors = new Set();
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + rowBytes));
    cursor += rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = previous[i];
      const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
    }
    for (let x = 0; x < width; x += step) {
      const i = x * bytesPerPixel;
      colors.add(`${row[i]},${row[i + 1]},${row[i + 2]},${bytesPerPixel === 4 ? row[i + 3] : 255}`);
    }
    previous = row;
  }
  return colors.size;
}

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, 'dist/index.html');
const htmlBytes = statSync(htmlPath).size;
const blockedOrRequested = [];
const pageErrors = [];
const consoleErrors = [];
let navigationError = null;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route(/^https?:\/\//, async (route) => {
    blockedOrRequested.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('request', (request) => {
    if (/^https?:\/\//i.test(request.url())) blockedOrRequested.push(request.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch((error) => { navigationError = error.message; });
  await page.waitForTimeout(7000);
  const screenshot = await page.locator('.maplibregl-canvas').screenshot();
  const uniqueScreenshotColors = countScreenshotColors(screenshot);
  const result = await page.evaluate(() => {
    const state = window.__MAP_TERRAIN_POC__;
    const canvas = document.querySelector('.maplibregl-canvas');
    if (!canvas) return { state, canvas: null, webgl: null };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      state,
      canvas: { width: canvas.width, height: canvas.height },
      webgl: gl ? gl.getParameter(gl.VERSION) : null,
      visibleStatus: document.querySelector('#status')?.textContent,
    };
  });
  const report = {
    file: htmlPath,
    fileBytes: htmlBytes,
    ready: Boolean(result.state?.ready),
    engine: result.state?.engine,
    tileBytes: result.state?.terrainTileBytes,
    terrainElevationMeters: result.state?.centerElevationMeters,
    requestedTiles: result.state?.requestedTiles,
    externalRequests: blockedOrRequested,
    webgl: result.webgl,
    canvas: result.canvas,
    uniqueScreenshotColors,
    visibleStatus: result.visibleStatus,
    stateError: result.state?.error,
    pageErrors,
    consoleErrors,
    navigationError,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
  if (report.externalRequests.length) process.exitCode = 1;
  if (!report.webgl || !Number.isFinite(report.terrainElevationMeters) || report.uniqueScreenshotColors < 8) process.exitCode = 1;
  if (report.pageErrors.length || report.consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(here, '../..');

function maplibreWorkerSource(): Plugin {
  const publicId = 'virtual:cf-maplibre-worker-source';
  const resolvedId = `\0${publicId}`;
  return {
    name: 'chartforge-map-terrain-poc-worker-source',
    resolveId(id) { return id === publicId ? resolvedId : null; },
    load(id) {
      if (id !== resolvedId) return null;
      const workerPath = resolve(projectRoot, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
      const source = readFileSync(workerPath, 'utf8');
      const base64 = Buffer.from(source, 'utf8').toString('base64');
      return `export default ${JSON.stringify(base64)};`;
    },
  };
}

function inlineSingleHtml(): Plugin {
  return {
    name: 'chartforge-map-terrain-poc-single-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find((item) => item.type === 'asset' && item.fileName.endsWith('.html'));
      const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
      const cssAsset = Object.values(bundle).find((item) => item.type === 'asset' && item.fileName.endsWith('.css'));
      if (!htmlAsset || htmlAsset.type !== 'asset' || !entry || !cssAsset || cssAsset.type !== 'asset') {
        this.error('POC single-file build expected one HTML, one JS entry and one CSS asset.');
      }
      let html = typeof htmlAsset.source === 'string' ? htmlAsset.source : Buffer.from(htmlAsset.source).toString('utf8');
      const script = entry.code.replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');
      const css = typeof cssAsset.source === 'string' ? cssAsset.source : Buffer.from(cssAsset.source).toString('utf8');
      const digest = createHash('sha256').update(script, 'utf8').digest('base64');
      html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/i, `<script type="module">${script}</script>`);
      html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, `<style>${css}</style>`);
      html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, '');
      const policy = [
        "default-src 'none'",
        `script-src 'sha256-${digest}' blob:`,
        "style-src 'unsafe-inline'",
        'img-src data: blob:',
        'connect-src blob:',
        'worker-src blob: data:',
        'font-src data:',
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      html = html.replace('<!-- POC_CSP -->', `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
      htmlAsset.source = html;
      for (const item of Object.values(bundle)) {
        if (item.fileName !== htmlAsset.fileName) delete bundle[item.fileName];
      }
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [maplibreWorkerSource(), inlineSingleHtml()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(here, 'index.html'),
      output: { inlineDynamicImports: true, format: 'es' },
    },
  },
});

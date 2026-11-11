import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, 'dist/index.html');
const html = readFileSync(htmlPath, 'utf8');
const startMarker = '<script type="module">';
const start = html.indexOf(startMarker);
const end = html.indexOf('</script>', start + startMarker.length);
if (start < 0 || end < 0) throw new Error('Inline module script could not be located.');
const script = html.slice(start + startMarker.length, end);
function compact(text = '') {
  return text.split(/\r?\n/).map((line) => line.length > 1200 ? `${line.slice(0, 450)}…[${line.length} chars]…${line.slice(-450)}` : line).join('\n').slice(0, 2400);
}
const temp = resolve(here, 'dist/.inline-check.mjs');
writeFileSync(temp, script);
try {
  const checked = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const errorLines = checked.stderr.split(/\r?\n/);
  const caretLineIndex = errorLines.findIndex((line) => /^\s*\^/.test(line));
  const caretColumn = caretLineIndex > 0 ? errorLines[caretLineIndex].indexOf('^') : -1;
  const sourceErrorLine = caretLineIndex > 0 ? errorLines[caretLineIndex - 1] : '';
  const errorContext = caretColumn >= 0 ? sourceErrorLine.slice(Math.max(0, caretColumn - 140), caretColumn + 140) : compact(errorLines.slice(-5).join('\n'));
  const syntaxSummary = checked.status === 0 ? 'ok' : `${errorLines[0] || 'parse error'}\nlineChars=${sourceErrorLine.length}; caret=${caretColumn}\n${errorContext}`;
  const suspiciousLine = script.split(/\r?\n/)[813] || '';
  const closingTags = [...html.matchAll(/<\/script/gi)].map((match) => match.index);
  const csp = html.match(/Content-Security-Policy[^>]+content="([^"]+)/i)?.[1] || null;
  const report = {
    htmlBytes: Buffer.byteLength(html),
    inlineScriptBytes: Buffer.byteLength(script),
    line814Length: suspiciousLine.length,
    line814Start: suspiciousLine.slice(0, 240),
    line814End: suspiciousLine.slice(-240),
    scriptStart: start,
    firstScriptClose: end,
    allScriptCloseOffsets: closingTags,
    hasExternalScriptTag: /<script\b[^>]*\bsrc=/i.test(html),
    hasExternalStylesheet: /<link\b[^>]*rel="stylesheet"/i.test(html),
    csp,
    cspAllowsBlobConnect: Boolean(csp?.includes('connect-src blob:')),
    cspHasWorkerBlobAndData: Boolean(csp?.includes('worker-src blob: data:')),
    syntaxExit: checked.status,
    syntaxStdout: compact(checked.stdout),
    syntaxStderr: `${syntaxSummary}\nstderrBytes=${Buffer.byteLength(checked.stderr)}\ntail=${compact(checked.stderr.slice(-1200))}`,
  };
  console.log(JSON.stringify(report, null, 2));
  if (checked.status !== 0 || report.hasExternalScriptTag || report.hasExternalStylesheet || !report.cspAllowsBlobConnect || !report.cspHasWorkerBlobAndData) process.exitCode = 1;
} finally {
  unlinkSync(temp);
}

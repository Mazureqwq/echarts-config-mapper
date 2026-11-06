export interface ZipEntry {
  /** 归档内路径，统一用 / */
  path: string;
  data: Uint8Array;
}

export type DeflateFn = (bytes: Uint8Array) => Promise<Uint8Array | null>;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 优先用浏览器自带的 deflate-raw，不支持时返回 null（调用方降级为 STORE，仍然合法） */
export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!Ctor) return null;
  try {
    const stream = new Ctor("deflate-raw");
    const writer = stream.writable.getWriter();
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    void writer.write(copy);
    void writer.close();
    const buffer = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

interface PreparedEntry {
  nameBytes: Uint8Array;
  method: number;
  crc: number;
  compressed: Uint8Array;
  size: number;
  offset: number;
}

/** 写 zip（PKZIP 2.0，STORE / DEFLATE 两种方法），不依赖任何第三方库 */
export async function createZip(
  entries: ZipEntry[],
  deflate: DeflateFn = deflateRaw,
  now: Date = new Date()
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const chunks: Uint8Array[] = [];
  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const compressed = await deflate(entry.data);
    const method = compressed ? 8 : 0;
    const payload = compressed ?? entry.data;
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // flag: UTF-8 文件名
    view.setUint16(8, method, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, payload.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    chunks.push(header, payload);
    prepared.push({
      nameBytes,
      method,
      crc,
      compressed: payload,
      size: entry.data.length,
      offset,
    });
    offset += header.length + payload.length;
  }

  const centralStart = offset;
  for (const e of prepared) {
    const header = new Uint8Array(46 + e.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true); // central directory header
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, e.method, true);
    view.setUint16(12, time, true);
    view.setUint16(14, date, true);
    view.setUint32(16, e.crc, true);
    view.setUint32(20, e.compressed.length, true);
    view.setUint32(24, e.size, true);
    view.setUint16(28, e.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, e.offset, true);
    header.set(e.nameBytes, 46);
    chunks.push(header);
    offset += header.length;
  }

  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); // end of central directory
  view.setUint16(8, prepared.length, true);
  view.setUint16(10, prepared.length, true);
  view.setUint32(12, offset - centralStart, true);
  view.setUint32(16, centralStart, true);
  chunks.push(end);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}

/** 供测试与 UI 使用：文本文件集合 → zip 字节 */
export function filesToEntries(files: Array<{ path: string; content: string }>): ZipEntry[] {
  const encoder = new TextEncoder();
  return files.map((f) => ({ path: f.path, data: encoder.encode(f.content) }));
}

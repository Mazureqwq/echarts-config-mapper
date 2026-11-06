import { describe, it, expect } from "vitest";
import { crc32, createZip, deflateRaw, filesToEntries } from "../src/core/export/zip";

/** 极简 zip 读出器：只为测试校验结构，不引入依赖 */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  // 从尾部找 EOCD
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd).toBeGreaterThan(-1);
  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries: Array<{ name: string; method: number; size: number; compressed: number; data: Uint8Array }> = [];
  let cursor = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
    const localView = new DataView(bytes.buffer, bytes.byteOffset + localOffset, 30);
    expect(localView.getUint32(0, true)).toBe(0x04034b50);
    const localNameLen = localView.getUint16(26, true);
    const localExtraLen = localView.getUint16(28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    entries.push({
      name,
      method,
      size,
      compressed,
      data: bytes.subarray(start, start + compressed),
    });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("export/zip 零依赖打包", () => {
  it("crc32 与标准向量一致", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("STORE 模式（小文件/无压缩环境）内容逐字节一致", async () => {
    const files = [
      { path: "index.html", content: "<!doctype html><title>大屏</title>" },
      { path: "assets/app.js", content: "console.log(1);" },
    ];
    const zip = await createZip(filesToEntries(files), async () => null, new Date(2026, 10, 6));
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["index.html", "assets/app.js"]);
    expect(entries.every((e) => e.method === 0)).toBe(true);
    expect(new TextDecoder().decode(entries[0].data)).toBe(files[0].content);
  });

  it("支持的浏览器里走 DEFLATE，且能被标准解压器还原", async () => {
    const content = "# 大屏\n".repeat(200);
    const zip = await createZip(
      [{ path: "README.md", data: new TextEncoder().encode(content) }],
      deflateRaw
    );
    const [entry] = readZip(zip);
    expect(entry.method).toBe(8);
    expect(entry.compressed).toBeLessThan(new TextEncoder().encode(content).length);

    const stream = new DecompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    const copy = new Uint8Array(entry.data.length);
    copy.set(entry.data);
    void writer.write(copy);
    void writer.close();
    const text = await new Response(stream.readable).text();
    expect(text).toBe(content);
  });
});

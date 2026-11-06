import { describe, it, expect } from "vitest";
import { buildArtifact } from "../src/core/export/artifact";
import { buildPackagePayload } from "../src/core/export/snapshot";
import { RUNTIME_CODE } from "../src/core/export/runtime";
import { createZip, filesToEntries } from "../src/core/export/zip";
import { createWorkspace, createScreen, createChartSpec } from "../src/core/model/schema";
import type { ChartItem, ImageItem } from "../src/core/model/types";

const ECHARTS_STUB = "var echarts={registerMap:function(){},init:function(){return{setOption:function(){},resize:function(){},dispose:function(){}}}};";

function demoPayload() {
  const ws = createWorkspace();
  const screen = createScreen("门店大屏");
  screen.items.push(
    {
      id: "c1",
      kind: "chart",
      name: "销量",
      frame: { x: 10, y: 10, w: 400, h: 300, rotate: 0 },
      spec: createChartSpec("bar"),
    } as ChartItem,
    {
      id: "i1",
      kind: "image",
      name: "logo",
      frame: { x: 0, y: 0, w: 60, h: 60, rotate: 0 },
      src: "data:image/png;base64,AAAA",
      fit: "contain",
    } as ImageItem
  );
  ws.screens.push(screen);
  return buildPackagePayload(ws, [screen.id]);
}

describe("export 端到端：产物 → zip → 回读", () => {
  it("zip 里的文件与 manifest 清单一一对应，index.html 可直接打开", async () => {
    const out = await buildArtifact({
      payload: demoPayload(),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "folder",
    });
    const zip = await createZip(filesToEntries(out.files));

    // 从 zip 里读目录：EOCD → 中央目录
    const view = new DataView(zip.buffer, zip.byteOffset, zip.length);
    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    expect(eocd).toBeGreaterThan(-1);
    const count = view.getUint16(eocd + 10, true);
    expect(count).toBe(out.files.length);

    let cursor = view.getUint32(eocd + 16, true);
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      names.push(new TextDecoder().decode(zip.subarray(cursor + 46, cursor + 46 + nameLen)));
      cursor += 46 + nameLen + extraLen + commentLen;
    }

    expect(names.sort()).toEqual(out.files.map((f) => f.path).sort());
    // manifest 里的每一条都能在包里找到
    for (const f of out.manifest.files) expect(names).toContain(f.path);
    expect(names).toContain("index.html");
    expect(names).toContain("assets/echarts.min.js");
  });

  it("单文件产物只有一个 index.html，自包含且带 CSP 摘要", async () => {
    const out = await buildArtifact({
      payload: demoPayload(),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "inline",
    });
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(out.files.filter((f) => f.path === "index.html")).toHaveLength(1);
    expect(html).toContain("sha256-");
    expect(html).toContain("cf-payload");
    expect(html).toContain("门店大屏");
  });
});

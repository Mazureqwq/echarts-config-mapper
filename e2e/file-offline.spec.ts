import { expect, test } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

test("file:// offline map render", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const build = await page.evaluate(async () => {
    const snapshotUrl = new URL("/src/core/export/snapshot.ts", location.href).href;
    const artifactUrl = new URL("/src/core/export/artifact.ts", location.href).href;
    const runtimeUrl = new URL("/src/core/export/runtime.ts", location.href).href;
    const assetsUrl = new URL("/src/core/export/assets.ts", location.href).href;
    const [snapshotModule, artifactModule, runtimeModule, assetsModule] = await Promise.all([
      import(snapshotUrl), import(artifactUrl), import(runtimeUrl), import(assetsUrl),
    ]);
    const [maplibreCode, maplibreWorkerCode] = await Promise.all([
      assetsModule.loadMaplibreSource(),
      assetsModule.loadMaplibreWorkerSource(),
    ]);
    const ws = { version: 2, assets: [], designAssets: [], screens: [{ id: "s", name: "离线验证", canvas: { width: 960, height: 600, background: { kind: "color", color: "#050b12" } }, items: [{ id: "i", name: "m", kind: "component", componentId: "chartforge.map-scene-tilted", componentVersion: 1, frame: { x: 40, y: 40, w: 760, h: 500, rotate: 0 }, dataBinding: { datasetId: "d", fields: { category: "province", value: "score" } }, props: { presentation: "tilted", pitch: 28, view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" }, layers: [{ id: "f", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#102b3d", mid: "#1c5f8f", max: "#66ffff", empty: "#0d1a26" } } }] } }], updatedAt: Date.now() }], datasets: [{ id: "d", name: "d", source: { kind: "static", data: [{ province: "广东省", score: 92 }, { province: "浙江省", score: 78 }, { province: "四川省", score: 60 }, { province: "西藏自治区", score: 31 }] }, pipeline: { filter: [] } }], settings: { autosave: true } };
    const payload = assetsModule.attachGeo(snapshotModule.buildPackagePayload(ws, ["s"]));
    const echartsCode = `(function(){window.echarts={registerMap:function(){},init:function(){return{setOption:function(){},resize:function(){},dispose:function(){}};}};})();`;
    const artifact = await artifactModule.buildArtifact({
      payload, echartsCode, maplibreCode, maplibreWorkerCode,
      runtimeCode: runtimeModule.RUNTIME_CODE, mode: "inline", now: () => 1794280000000,
    });
    return { html: artifact.files.find((f: { path: string }) => f.path === "index.html")?.content ?? "", len: artifact.files.find((f: { path: string }) => f.path === "index.html")?.content.length ?? 0 };
  });

  const outPath = path.resolve("test-results", "offline-file-test.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, build.html, "utf-8");
  console.log("WROTE " + outPath + " bytes=" + build.len);

  await page.goto("file:///" + outPath.replace(/\\/g, "/"));
  await page.waitForTimeout(8000);
  const state = await page.evaluate(() => {
    const s = document.querySelector(".cf-map-scene__status");
    const canvas = document.querySelector(".maplibregl-canvas");
    let host: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !host) host = (el as any).__cfMap; });
    let paint = null;
    if (host) {
      const style = host.getStyle();
      const fill = (style.layers || []).find((l: any) => l.id === "cf-fill");
      paint = { hasFill: Boolean(fill), colorType: fill ? typeof fill.paint["fill-color"] : null, pitch: style.pitch };
    }
    return {
      status: s ? s.textContent : null,
      hasCanvas: Boolean(canvas),
      hasMap: Boolean(host),
      paint,
      labels: document.querySelectorAll(".cf-map-labels span").length,
      shimLog: (window as any).__shimLog ?? null,
    };
  });
  console.log("FILE_STATE " + JSON.stringify(state));
  await page.screenshot({ path: "test-results/visual/10-file-offline.jpg", type: "jpeg", quality: 62 });
  expect(state.hasMap).toBe(true);
});

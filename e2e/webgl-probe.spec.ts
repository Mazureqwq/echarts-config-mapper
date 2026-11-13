import { expect, test } from "@playwright/test";

test("headless 环境支持 WebGL 且 maplibre 可创建地图（环境哨兵）", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { webgl: false, maplibreLoad: false, renderer: "" };
    const maplibre = (await import("/node_modules/maplibre-gl/dist/maplibre-gl.mjs")) as any;
    const div = document.createElement("div");
    div.style.cssText = "width:200px;height:150px;position:fixed;left:-9999px;top:0";
    document.body.appendChild(div);
    const loaded = await new Promise<boolean>((resolve) => {
      const map = new maplibre.Map({ container: div, style: { version: 8, sources: {}, layers: [] }, attributionControl: false });
      const timer = setTimeout(() => resolve(false), 10_000);
      map.on("load", () => { clearTimeout(timer); resolve(true); map.remove(); });
      map.on("error", () => { clearTimeout(timer); resolve(false); });
    });
    div.remove();
    return { webgl: true, maplibreLoad: loaded, renderer: String(gl.getParameter(gl.RENDERER) ?? "") };
  });
  console.log("WEBGL_PROBE", JSON.stringify(result));
  expect(result.webgl).toBe(true);
  expect(result.maplibreLoad).toBe(true);
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockServer, DEMO_TOKEN, ENDPOINTS } from "../server/app.mjs";
import { toChartData } from "../src/core/live/payload";
import { resolveDataPath } from "../src/core/live/dataPath";
import type { AddressInfo } from "node:net";
import type { ChartType } from "../src/core/model/types";

let server: ReturnType<typeof createMockServer>;
let base = "";

beforeAll(async () => {
  server = createMockServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const auth = { Authorization: `Bearer ${DEMO_TOKEN}` };

/** 每条接口的期望：状态码 + 喂给哪种图表类型 + 需要先取 dataPath 的情况 */
const CASES: Array<{
  path: string;
  method?: "GET" | "POST";
  status: number;
  chart?: ChartType;
  dataPath?: string;
  body?: string;
  headers?: Record<string, string>;
}> = [
  { path: "/health", status: 200 },
  { path: "/api/index", status: 200 },
  { path: "/api/charts/line?months=3", status: 200, chart: "line" },
  { path: "/api/charts/bar", status: 200, chart: "bar" },
  { path: "/api/charts/pie", status: 200, chart: "pie" },
  { path: "/api/charts/map", status: 200, chart: "map" },
  { path: "/api/charts/scatter?points=6", status: 200, chart: "scatter" },
  { path: "/api/charts/radar", status: 200, chart: "radar" },
  { path: "/api/sales/rows?rows=20", status: 200, chart: "bar" },
  { path: "/api/sales/wrapped?rows=5", status: 200, chart: "line", dataPath: "data.rows" },
  { path: "/api/sales/matrix?months=4", status: 200, chart: "line" },
  { path: "/api/sales/scalars?n=6", status: 200, chart: "line" },
  { path: "/api/sales/chartdata", status: 200, chart: "line" },
  {
    path: "/api/search",
    method: "POST",
    status: 200,
    chart: "bar",
    dataPath: "rows",
    body: JSON.stringify({ region: "华东", limit: 5 }),
  },
  { path: "/api/echo?x=1", status: 200 },
  { path: "/api/secure/dashboard", status: 401 },
  { path: "/api/secure/dashboard", status: 200, chart: "line", headers: auth },
  { path: "/api/live/random", status: 200, chart: "line" },
  { path: "/api/errors/500", status: 500 },
  { path: "/api/errors/404", status: 404 },
  { path: "/api/errors/html", status: 200 },
  { path: "/api/errors/badjson", status: 200 },
  { path: "/api/errors/empty", status: 200 },
  { path: "/api/errors/object", status: 200 },
  { path: "/api/errors/slow?ms=0", status: 200, chart: "line" },
  { path: "/api/errors/flaky?rate=0", status: 200, chart: "line" },
  { path: "/api/errors/huge?rows=500", status: 200, chart: "bar" },
];

describe("mock server：接口目录与 README 对齐", () => {
  it("六种图表各有一条接口，且没有重复路径", () => {
    const charts = new Set(
      ENDPOINTS.filter((e) => e.chart && e.path.startsWith("/api/charts/")).map((e) => e.path)
    );
    expect([...charts].sort()).toEqual([
      "/api/charts/bar",
      "/api/charts/line",
      "/api/charts/map",
      "/api/charts/pie",
      "/api/charts/radar",
      "/api/charts/scatter",
    ]);
  });

  it("目录页与 JSON 目录都能访问", async () => {
    const html = await fetch(`${base}/`);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    const text = await html.text();
    expect(text).toContain("ChartForge 测试接口");

    const json = await (await fetch(`${base}/api/index`)).json();
    expect(json.endpoints.length).toBe(ENDPOINTS.length);
  });
});

describe("mock server：每条接口都真的调得通", () => {
  for (const c of CASES) {
    it(`${c.method ?? "GET"} ${c.path} → ${c.status}${c.chart ? ` 可喂给 ${c.chart}` : ""}`, async () => {
      const res = await fetch(`${base}${c.path}`, {
        method: c.method ?? "GET",
        ...(c.headers ? { headers: c.headers } : {}),
        ...(c.body ? { body: c.body } : {}),
      });
      expect(res.status).toBe(c.status);
      if (!c.chart) return;

      const raw: unknown = await res.json();
      const picked = c.dataPath ? resolveDataPath(raw, c.dataPath) : raw;
      expect(picked, `${c.path} 的 dataPath=${c.dataPath ?? "(无)"} 没有取到数据`).toBeDefined();

      const mapped = toChartData(picked, c.chart);
      expect(mapped.ok, mapped.ok ? "" : `${c.path} 无法映射成 ${c.chart}：${mapped.message}`).toBe(
        true
      );
    });
  }
});

describe("mock server：跨域与请求方式", () => {
  it("普通接口带 CORS 头，允许 Authorization", async () => {
    const res = await fetch(`${base}/api/charts/line`, {
      headers: { Origin: "http://localhost:5174" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5174");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("OPTIONS 预检返回 204 并回显请求的自定义头", async () => {
    const res = await fetch(`${base}/api/search`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5174",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("故意不开跨域的接口确实没有 CORS 头", async () => {
    const res = await fetch(`${base}/api/errors/no-cors?block=1`, {
      headers: { Origin: "http://localhost:5174" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("GET 打 POST 接口给 405，坏 JSON 给 400", async () => {
    expect((await fetch(`${base}/api/search`)).status).toBe(405);
    const bad = await fetch(`${base}/api/search`, { method: "POST", body: "{oops" });
    expect(bad.status).toBe(400);
  });

  it("/api/echo 只回报令牌「有没有带」和长度，不回显明文", async () => {
    const res = await (await fetch(`${base}/api/echo`, { headers: auth })).json();
    expect(res.auth.present).toBe(true);
    expect(res.auth.scheme).toBe("Bearer");
    expect(res.auth.length).toBe(DEMO_TOKEN.length);
    expect(JSON.stringify(res)).not.toContain(DEMO_TOKEN);
    expect(res.headers).toContain("authorization");
  });
});

describe("mock server：数据可复现", () => {
  it("同一个 seed 两次结果一致，不同 seed 不同", async () => {
    const a = await (await fetch(`${base}/api/charts/line?seed=7`)).json();
    const b = await (await fetch(`${base}/api/charts/line?seed=7`)).json();
    const c = await (await fetch(`${base}/api/charts/line?seed=8`)).json();
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("/api/errors/huge 真的返回大量行", async () => {
    const rows = await (await fetch(`${base}/api/errors/huge?rows=500`)).json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(500);
  });
});

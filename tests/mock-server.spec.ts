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

describe("mock server：默认数据量足够画出像样的图", () => {
  /**
   * 回归：`Number(null) === 0` 会让「不传参数」变成 0，再被 clamp 成下限 1，
   * 于是接口默认只回 1 行、图表看着像坏了。这里锁住默认量级。
   */
  const CASES: Array<[string, (rows: any[]) => void, string]> = [
    ["/api/charts/line", (r) => {
      expect(r.length).toBe(12);
      expect(Object.keys(r[0])).toEqual(["月份", "销售额", "成本", "利润"]);
      expect(new Set(r.map((x) => x.月份)).size).toBe(12);
    }, "折线：12 个月 × 3 列"],
    ["/api/charts/bar", (r) => {
      expect(r.length).toBe(12);
      expect(Object.keys(r[0])).toEqual(["月份", "实际完成", "目标"]);
    }, "柱状：12 个月 × 2 列"],
    ["/api/charts/pie", (r) => {
      expect(r.length).toBeGreaterThanOrEqual(8);
      const total = r.reduce((s, x) => s + x.访问量, 0);
      expect(total).toBeGreaterThan(1000);
    }, "饼图：≥8 个分类"],
    ["/api/charts/map", (r) => {
      expect(r.length).toBe(34);
      expect(r.map((x) => x.省份)).toContain("广东省");
      expect(r.map((x) => x.省份)).toContain("澳门特别行政区");
    }, "地图：34 个省级行政区全量"],
    ["/api/charts/scatter", (r) => {
      expect(r.length).toBe(120);
      expect(new Set(r.map((x) => x.分组)).size).toBe(3);
    }, "散点：120 点 / 3 组"],
    ["/api/charts/radar", (r) => {
      expect(r.length).toBeGreaterThanOrEqual(6);
      expect(Object.keys(r[0]).length).toBe(4); // 指标 + 3 个系列
    }, "雷达：≥6 指标 × 3 系列"],
    ["/api/sales/rows", (r) => {
      expect(r.length).toBe(240);
      expect(new Set(r.map((x) => x.月份)).size).toBe(12);
      expect(new Set(r.map((x) => x.渠道)).size).toBe(4);
      expect(new Set(r.map((x) => x.区域)).size).toBe(5);
    }, "长表：240 行 = 12 月 × 4 渠道 × 5 区域"],
    ["/api/sales/scalars", (r) => expect(r.length).toBe(24), "数值数组：24 点"],
    ["/api/live/random", (r) => expect(r.length).toBe(12), "实时：12 个时间点"],
  ];

  for (const [path, check, label] of CASES) {
    it(`${path}（${label}）`, async () => {
      const rows = await (await fetch(`${base}${path}`)).json();
      expect(Array.isArray(rows)).toBe(true);
      check(rows);
    });
  }

  it("显式参数依然生效（默认值没有把参数吃掉）", async () => {
    expect((await (await fetch(`${base}/api/charts/line?months=3`)).json()).length).toBe(3);
    expect((await (await fetch(`${base}/api/charts/scatter?points=6`)).json()).length).toBe(6);
    expect((await (await fetch(`${base}/api/sales/rows?rows=10`)).json()).length).toBe(10);
    expect((await (await fetch(`${base}/api/sales/scalars?n=5`)).json()).length).toBe(5);
  });

  it("wrapped / matrix 封套里的数据量也对", async () => {
    const wrapped = await (await fetch(`${base}/api/sales/wrapped`)).json();
    expect(wrapped.data.rows.length).toBe(120);
    expect(wrapped.data.total).toBe(120);
    const matrix = await (await fetch(`${base}/api/sales/matrix`)).json();
    expect(matrix.length).toBe(13); // 1 行表头 + 12 个月
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

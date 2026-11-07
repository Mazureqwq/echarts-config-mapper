/**
 * ChartForge 测试用 mock 服务（零依赖，仅用 node:http）。
 *
 * 目的：让「实时数据 / 数据源中心 / 调试台 / 加工流水线」这些功能有真接口可点。
 * 每个图表类型都有一条接口，另外配了数据形态、请求方式、鉴权、异常等演练用接口。
 * 接口清单与参数见 ./README.md，或直接浏览器打开 http://localhost:8787/。
 */
import { createServer } from "node:http";
import {
  CHANNELS,
  REGIONS,
  chartDataPayload,
  lineRows,
  liveSeries,
  mapRows,
  matrixTable,
  pieRows,
  radarRows,
  salesRows,
  scalarList,
  scatterRows,
  wrappedSales,
} from "./data.mjs";

export const DEMO_TOKEN = "demo-token";
export const DEFAULT_PORT = 8787;

/** 统一整理成 { code, message, data } —— 但图表接口默认返回「裸数组/对象」，因为最常见 */
function send(res, status, body, extraHeaders = {}) {
  const payload =
    typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function applyCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "Content-Type, Authorization, X-Tenant, X-Trace-Id"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Trace-Id, X-Server-Time");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("X-Trace-Id", `cf-${Date.now().toString(36)}`);
  res.setHeader("X-Server-Time", new Date().toISOString());
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req, limitBytes = 1 << 20) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size <= limitBytes) chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function tokenOf(req, url) {
  const header = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) return m[1].trim();
  return url.searchParams.get("token") || "";
}

/** 接口目录：/ 与 /api/index 都用它，README 也照它写 */
export const ENDPOINTS = [
  {
    method: "GET",
    path: "/health",
    summary: "探活（设置页「探活」按钮用这个）",
    params: [],
    chart: null,
  },
  { method: "GET", path: "/api/charts/line", summary: "折线图：对象数组，字段名即系列名", params: ["?months=6|12", "?seed=1"], chart: "line" },
  { method: "GET", path: "/api/charts/bar", summary: "柱状图（同折线，月份更多）", params: ["?months=12", "?seed=2"], chart: "bar" },
  { method: "GET", path: "/api/charts/pie", summary: "饼图：{渠道, 占比}", params: ["?seed=1"], chart: "pie" },
  { method: "GET", path: "/api/charts/map", summary: "地图：省级全称 + 数值", params: ["?seed=1"], chart: "map" },
  { method: "GET", path: "/api/charts/scatter", summary: "散点：{x, y, 名称, 分组}", params: ["?points=24", "?seed=1"], chart: "scatter" },
  { method: "GET", path: "/api/charts/radar", summary: "雷达：首列指标 + 多列系列", params: ["?seed=1"], chart: "radar" },
  { method: "GET", path: "/api/sales/rows", summary: "长表（一行一个组合），练过滤/选列/排序/取前N/透视", params: ["?rows=48", "?seed=1"], chart: "line|bar|pie" },
  { method: "GET", path: "/api/sales/wrapped", summary: "带封套 {code,data:{rows}}，练 dataPath=data.rows", params: ["?rows=24", "?seed=1"], chart: "line|bar" },
  { method: "GET", path: "/api/sales/matrix", summary: "二维表（首行表头）", params: ["?months=6", "?seed=1"], chart: "line|bar" },
  { method: "GET", path: "/api/sales/scalars", summary: "纯数值数组", params: ["?n=12", "?seed=1"], chart: "任意" },
  { method: "GET", path: "/api/sales/chartdata", summary: "完整 ChartData（无需推断）", params: ["?seed=1"], chart: "line|bar" },
  { method: "POST", path: "/api/search", summary: "POST + JSON 体，按条件过滤长表并回显条件", params: ["body: {region?,channel?,keyword?,limit?}"], chart: "line|bar" },
  { method: "GET", path: "/api/echo", summary: "回显方法/查询参数/请求头（验证 token 与公共参数是否真的带上）", params: ["?任意=值"], chart: null },
  { method: "GET", path: "/api/secure/dashboard", summary: `需要 Authorization: Bearer ${DEMO_TOKEN}（也接受 ?token=）`, params: ["header: Authorization", "?token="], chart: "line|bar" },
  { method: "GET", path: "/api/live/random", summary: "每次返回不同数据，肉眼确认实时刷新", params: ["?series=2"], chart: "line|bar" },
  { method: "GET", path: "/api/errors/500", summary: "固定 500（测失败提示与数据保留）", params: [], chart: null },
  { method: "GET", path: "/api/errors/404", summary: "固定 404", params: [], chart: null },
  { method: "GET", path: "/api/errors/html", summary: "返回 HTML 而不是 JSON（测非 JSON 提示）", params: [], chart: null },
  { method: "GET", path: "/api/errors/badjson", summary: "返回非法 JSON", params: [], chart: null },
  { method: "GET", path: "/api/errors/empty", summary: "返回空数组（测空数据提示）", params: [], chart: null },
  { method: "GET", path: "/api/errors/object", summary: "返回单个对象（提示需要用 dataPath 取数组）", params: [], chart: null },
  { method: "GET", path: "/api/errors/slow", summary: "延迟响应，测超时与 AbortController", params: ["?ms=8000"], chart: "line" },
  { method: "GET", path: "/api/errors/flaky", summary: "按概率失败（503），测退避与「保留上一份数据」", params: ["?rate=0.5"], chart: "line" },
  { method: "GET", path: "/api/errors/huge", summary: "大载荷，测取前 N / 性能", params: ["?rows=5000"], chart: "line" },
  { method: "GET", path: "/api/errors/no-cors", summary: "不带 CORS 头（模拟对方没开跨域）", params: ["?block=1"], chart: null },
];

function indexHtml() {
  const rows = ENDPOINTS.map((e) => {
    const params = e.params.length
      ? e.params.map((p) => `<code>${p}</code>`).join(" ")
      : "<span style=\"opacity:.5\">—</span>";
    const chart = e.chart ? `<code>${e.chart}</code>` : "<span style=\"opacity:.5\">—</span>";
    return `<tr><td><code>${e.method}</code></td><td><a href="${e.method === "GET" ? e.path : "#"}">${e.path}</a></td><td>${e.summary}</td><td>${params}</td><td>${chart}</td></tr>`;
  }).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ChartForge 测试接口</title>
<style>
  body{margin:0;padding:28px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",Arial,sans-serif;background:#f5f6f8;color:#1f2329}
  h1{font-size:20px;margin:0 0 6px}
  p.lead{margin:0 0 18px;color:#646a73;font-size:13px;line-height:1.7}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e4e8;border-radius:8px;overflow:hidden;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #eef0f3;vertical-align:top}
  th{background:#fafbfc;color:#646a73;font-weight:600;font-size:12px}
  code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#f5f6f8;padding:1px 4px;border-radius:3px}
  a{color:#4f6ef7;text-decoration:none}
  tr:last-child td{border-bottom:none}
</style>
</head>
<body>
<h1>ChartForge 测试接口</h1>
<p class="lead">
  用法：打开 <strong>接口设置</strong>，把 baseUrl 填成 <code>http://localhost:${DEFAULT_PORT}</code>，
  然后在图表的数据源里只写相对路径，例如 <code>/api/charts/line</code>。<br>
  需要鉴权的接口示例令牌：<code>${DEMO_TOKEN}</code>（放在公共请求头 <code>Authorization=Bearer ${DEMO_TOKEN}</code>）。
</p>
<table>
<thead><tr><th>方法</th><th>路径</th><th>说明</th><th>参数</th><th>适合图表</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}

export function createMockServer(options = {}) {
  const log = options.log === true;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const started = Date.now();

    if (log) console.log(`[mock] ${req.method} ${url.pathname}${url.search}`);

    // 预检：浏览器带自定义头（Authorization 等）时一定会先打 OPTIONS
    if (req.method === "OPTIONS") {
      applyCors(req, res);
      res.writeHead(204);
      res.end();
      return;
    }

    // 模拟「对方没开 CORS」：这个接口故意不加任何跨域头
    const blockCors = path === "/api/errors/no-cors" && url.searchParams.get("block") === "1";
    if (!blockCors) applyCors(req, res);

    const seed = num(url.searchParams.get("seed"), 1);

    try {
      switch (path) {
        case "/":
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(indexHtml());
          return;

        case "/api/index":
          send(res, 200, { ok: true, endpoints: ENDPOINTS });
          return;

        case "/health":
          send(res, 200, {
            ok: true,
            service: "chartforge-mock",
            time: new Date().toISOString(),
            uptimeSec: Math.round(process.uptime()),
          });
          return;

        // ---- 六种图表 ----
        case "/api/charts/line":
          send(res, 200, lineRows(seed, clamp(num(url.searchParams.get("months"), 6), 1, 24)));
          return;
        case "/api/charts/bar":
          send(res, 200, lineRows(seed + 1, clamp(num(url.searchParams.get("months"), 12), 1, 24)));
          return;
        case "/api/charts/pie":
          send(res, 200, pieRows(seed));
          return;
        case "/api/charts/map":
          send(res, 200, mapRows(seed));
          return;
        case "/api/charts/scatter":
          send(res, 200, scatterRows(seed, clamp(num(url.searchParams.get("points"), 24), 1, 500)));
          return;
        case "/api/charts/radar":
          send(res, 200, radarRows(seed));
          return;

        // ---- 数据形态 ----
        case "/api/sales/rows":
          send(res, 200, salesRows({ seed, rows: clamp(num(url.searchParams.get("rows"), 48), 1, 5000) }));
          return;
        case "/api/sales/wrapped":
          send(res, 200, wrappedSales({ seed, rows: clamp(num(url.searchParams.get("rows"), 24), 1, 5000) }));
          return;
        case "/api/sales/matrix":
          send(res, 200, matrixTable(seed, clamp(num(url.searchParams.get("months"), 6), 1, 24)));
          return;
        case "/api/sales/scalars":
          send(res, 200, scalarList(seed, clamp(num(url.searchParams.get("n"), 12), 1, 500)));
          return;
        case "/api/sales/chartdata":
          send(res, 200, chartDataPayload(seed));
          return;

        // ---- POST ----
        case "/api/search": {
          if (req.method !== "POST") {
            send(res, 405, { ok: false, error: "这个接口只接受 POST" });
            return;
          }
          const raw = await readBody(req);
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            send(res, 400, { ok: false, error: "请求体不是合法 JSON" });
            return;
          }
          const all = salesRows({ seed, rows: 96 });
          const region = body.region ? String(body.region) : "";
          const channel = body.channel ? String(body.channel) : "";
          const keyword = body.keyword ? String(body.keyword) : "";
          const limit = clamp(num(body.limit, 0), 0, 5000);
          let rows = all.filter(
            (r) =>
              (!region || r.区域 === region) &&
              (!channel || r.渠道 === channel) &&
              (!keyword || Object.values(r).some((v) => String(v).includes(keyword)))
          );
          if (limit > 0) rows = rows.slice(0, limit);
          send(res, 200, {
            ok: true,
            // 回显请求条件：用来确认 POST body 真的发出来了
            echo: { region, channel, keyword, limit },
            total: rows.length,
            rows,
          });
          return;
        }

        // ---- 回显 ----
        case "/api/echo": {
          const token = tokenOf(req, url);
          send(res, 200, {
            method: req.method,
            path: url.pathname,
            query: Object.fromEntries(url.searchParams.entries()),
            headers: Object.keys(req.headers).sort(),
            // 只回显「有没有带」，不回显令牌本身
            auth: token
              ? { present: true, scheme: /^Bearer\s/i.test(req.headers.authorization || "") ? "Bearer" : "query", length: token.length }
              : { present: false },
            note: "把这里拿到的 headers 列表和接口设置页里配的公共请求头对照，就能确认令牌是否真的带上了",
            elapsedMs: Date.now() - started,
          });
          return;
        }

        // ---- 鉴权 ----
        case "/api/secure/dashboard": {
          const token = tokenOf(req, url);
          if (token !== DEMO_TOKEN) {
            send(
              res,
              401,
              {
                ok: false,
                error: "未授权",
                hint: `请在「接口设置」的公共请求头里加上 Authorization=Bearer ${DEMO_TOKEN}`,
              },
              { "WWW-Authenticate": "Bearer" }
            );
            return;
          }
          send(res, 200, lineRows(seed + 7, 6));
          return;
        }

        // ---- 实时 ----
        case "/api/live/random":
          send(res, 200, liveSeries(clamp(num(url.searchParams.get("series"), 2), 1, 3)));
          return;

        // ---- 异常与边界 ----
        case "/api/errors/500":
          send(res, 500, { ok: false, error: "服务器内部错误（这个接口是故意报错的）" });
          return;
        case "/api/errors/404":
          send(res, 404, { ok: false, error: "接口不存在（故意的）" });
          return;
        case "/api/errors/html":
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h1>这是一个 HTML 页面，不是 JSON</h1></body></html>");
          return;
        case "/api/errors/badjson":
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end('{"broken": tru');
          return;
        case "/api/errors/empty":
          send(res, 200, []);
          return;
        case "/api/errors/object":
          send(res, 200, { ok: true, total: 3, note: "数组在 data.rows 里，需要配 dataPath" });
          return;
        case "/api/errors/slow": {
          const ms = clamp(num(url.searchParams.get("ms"), 8000), 0, 60000);
          await sleep(ms);
          send(res, 200, lineRows(seed, 4));
          return;
        }
        case "/api/errors/flaky": {
          const rate = Math.min(1, Math.max(0, num(url.searchParams.get("rate"), 0.5)));
          if (Math.random() < rate) {
            send(res, 503, { ok: false, error: "随机失败（用于测试失败退避与旧数据保留）" });
            return;
          }
          send(res, 200, lineRows(seed + Math.floor(Math.random() * 100), 6));
          return;
        }
        case "/api/errors/huge":
          send(res, 200, salesRows({ seed, rows: clamp(num(url.searchParams.get("rows"), 2000), 1, 20000) }));
          return;

        default:
          send(res, 404, {
            ok: false,
            error: `没有这个接口：${path}`,
            hint: "打开 http://localhost:" + DEFAULT_PORT + "/ 查看全部接口",
          });
      }
    } catch (e) {
      send(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  return server;
}

export { CHANNELS, REGIONS };

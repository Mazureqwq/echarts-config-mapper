import { describe, it, expect } from "vitest";
import {
  joinUrl,
  appendQuery,
  buildRequest,
  feedKey,
  clampTimeout,
  DEFAULT_TIMEOUT_MS,
} from "../src/core/live/apiSettings";
import { normalizeWorkspace, createWorkspace, createChartSpec } from "../src/core/model/schema";
import type { ApiSettings, LiveSource } from "../src/core/model/types";

const api: ApiSettings = {
  baseUrl: "https://api.example.com/",
  headers: { Authorization: "Bearer T", "X-Global": "g" },
  query: { appKey: "k1" },
  timeoutMs: 8000,
};

describe("live/apiSettings 拼接与请求合成", () => {
  it("joinUrl：去重复斜杠、自动补前导斜杠、绝对地址直通、base 为空时原样", () => {
    expect(joinUrl("https://a.com/", "/api/x")).toBe("https://a.com/api/x");
    expect(joinUrl("https://a.com", "api/x")).toBe("https://a.com/api/x");
    expect(joinUrl("https://a.com", "https://b.com/y")).toBe("https://b.com/y");
    expect(joinUrl("", "/api/x")).toBe("/api/x");
    expect(joinUrl(undefined, "/api/x")).toBe("/api/x");
  });

  it("appendQuery 保留已有参数并把新参数覆盖进去", () => {
    expect(appendQuery("/api/x", { a: "1" })).toBe("/api/x?a=1");
    expect(appendQuery("/api/x?a=0&b=2", { a: "1" })).toBe("/api/x?a=1&b=2");
    expect(appendQuery("/api/x#frag", { a: "1" })).toBe("/api/x?a=1#frag");
    expect(appendQuery("/api/x", {})).toBe("/api/x");
  });

  it("相对路径拼 baseUrl，全局 query 一起带上", () => {
    const source: LiveSource = { url: "", path: "/api/sales", intervalSec: 30 };
    const req = buildRequest(source, api);
    expect(req.url).toBe("https://api.example.com/api/sales?appKey=k1");
    expect(req.method).toBe("GET");
    expect(req.headers.Authorization).toBe("Bearer T");
  });

  it("绝对地址优先，忽略 baseUrl", () => {
    const source: LiveSource = { url: "https://other.com/x", intervalSec: 30 };
    expect(buildRequest(source, api).url).toBe("https://other.com/x?appKey=k1");
  });

  it("图表级 header/query 覆盖全局同名项", () => {
    const source: LiveSource = {
      url: "",
      path: "/api/x",
      intervalSec: 10,
      headers: { Authorization: "Bearer LOCAL" },
      query: { appKey: "local", extra: "1" },
    };
    const req = buildRequest(source, api);
    expect(req.headers.Authorization).toBe("Bearer LOCAL");
    expect(req.headers["X-Global"]).toBe("g");
    expect(req.url).toContain("appKey=local");
    expect(req.url).toContain("extra=1");
  });

  it("POST 会带 body 并自动补 Content-Type", () => {
    const source: LiveSource = {
      url: "",
      path: "/api/x",
      intervalSec: 10,
      method: "POST",
      body: '{"a":1}',
    };
    const req = buildRequest(source, undefined);
    expect(req.method).toBe("POST");
    expect(req.body).toBe('{"a":1}');
    expect(req.headers["Content-Type"]).toBe("application/json");
  });

  it("GET 不会带 body", () => {
    const source: LiveSource = { url: "/api/x", intervalSec: 10, body: '{"a":1}' };
    expect(buildRequest(source).body).toBeUndefined();
  });

  it("feedKey：参数顺序无关，参数值不同则视为不同请求", () => {
    const a = buildRequest({ url: "/api/x", intervalSec: 10, query: { a: "1", b: "2" } });
    const b = buildRequest({ url: "/api/x", intervalSec: 10, query: { b: "2", a: "1" } });
    const c = buildRequest({ url: "/api/x", intervalSec: 10, query: { a: "9" } });
    expect(feedKey(a)).toBe(feedKey(b));
    expect(feedKey(a)).not.toBe(feedKey(c));
  });

  it("clampTimeout 兜底与夹紧", () => {
    expect(clampTimeout(undefined)).toBe(DEFAULT_TIMEOUT_MS);
    expect(clampTimeout(10)).toBe(1000);
    expect(clampTimeout(999999)).toBe(120000);
  });
});

describe("model/schema 数据源与全局设置规范化", () => {
  it("只有 path 的数据源也会保留（此前 url 为空会被丢弃）", () => {
    const spec = createChartSpec("line");
    (spec as unknown as Record<string, unknown>).source = {
      url: "",
      path: "/api/sales",
      intervalSec: 15,
      method: "POST",
      body: '{"x":1}',
      headers: { A: "1" },
      query: { q: "2" },
      dataPath: "result.rows",
    };
    const raw = JSON.parse(JSON.stringify(createWorkspace())) as Record<string, unknown>;
    (raw.assets as unknown[]).push({
      id: "a1",
      name: "A",
      thumbnail: "",
      spec,
      createdAt: 0,
      updatedAt: 0,
    });
    const ws = normalizeWorkspace(raw);
    const source = ws.assets[0].spec.source!;
    expect(source.path).toBe("/api/sales");
    expect(source.method).toBe("POST");
    expect(source.body).toBe('{"x":1}');
    expect(source.headers).toEqual({ A: "1" });
    expect(source.query).toEqual({ q: "2" });
    expect(source.dataPath).toBe("result.rows");
  });

  it("旧的绝对地址数据源原样保留", () => {
    const raw = JSON.parse(JSON.stringify(createWorkspace())) as Record<string, unknown>;
    const spec = createChartSpec("bar") as unknown as Record<string, unknown>;
    spec.source = { url: "https://old.api/x", intervalSec: 20, dataPath: "data" };
    (raw.assets as unknown[]).push({ id: "a1", name: "A", thumbnail: "", spec, createdAt: 0, updatedAt: 0 });
    const ws = normalizeWorkspace(raw);
    expect(ws.assets[0].spec.source).toEqual({
      url: "https://old.api/x",
      intervalSec: 20,
      dataPath: "data",
    });
  });

  it("全局 api 设置被保留；非法 filter op 回落 eq，limit 夹紧", () => {
    const raw = JSON.parse(JSON.stringify(createWorkspace())) as Record<string, unknown>;
    raw.settings = {
      autosave: true,
      api: { baseUrl: " https://a.com ", headers: { A: 1 }, query: { q: "1" }, timeoutMs: 5000 },
    };
    const spec = createChartSpec("line") as unknown as Record<string, unknown>;
    spec.source = {
      url: "",
      path: "/x",
      intervalSec: 10,
      filter: [{ field: "s", op: "bogus", value: "1" }],
      limit: 999999,
    };
    (raw.assets as unknown[]).push({ id: "a1", name: "A", thumbnail: "", spec, createdAt: 0, updatedAt: 0 });
    const ws = normalizeWorkspace(raw);
    expect(ws.settings.api?.baseUrl).toBe("https://a.com");
    expect(ws.settings.api?.headers).toEqual({ A: "1" });
    expect(ws.assets[0].spec.source?.filter?.[0].op).toBe("eq");
    expect(ws.assets[0].spec.source?.limit).toBe(5000);
  });
});

import { describe, it, expect, vi } from "vitest";
import { probeSource, inferFields, toProbeRows, explainFetchError } from "../src/core/live/probe";

const source = { url: "", path: "/api/sales", intervalSec: 30 };

describe("live/probe 调试台探活", () => {
  it("相对路径会拼上全局 baseUrl，并带上全局 token", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ list: [1] }) }));
    const res = await probeSource(source, { baseUrl: "https://api.test/v1/", headers: { Authorization: "Bearer t" } }, { fetchImpl });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/v1/api/sales",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer t" }),
      })
    );
  });

  it("耗时用注入的时钟计算", async () => {
    let t = 1000;
    const res = await probeSource(source, undefined, {
      fetchImpl: async () => {
        t += 120;
        return { ok: true, status: 200, json: async () => ({}) };
      },
      now: () => t,
    });
    expect(res.durationMs).toBe(120);
  });

  it("POST 会带上 body 且自动补 Content-Type", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    await probeSource({ ...source, method: "POST", body: '{"a":1}' }, undefined, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/sales"),
      expect.objectContaining({ method: "POST", body: '{"a":1}' })
    );
    const init = (fetchImpl.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    const contentType = Object.entries(init.headers).find(
      ([k]) => k.toLowerCase() === "content-type"
    );
    expect(contentType?.[1]).toBe("application/json");
  });

  it("HTTP 错误码翻译成人话", async () => {
    const res = await probeSource(source, undefined, {
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.error).toContain("404");
  });

  it("CORS 这类网络异常给出可操作提示", async () => {
    const res = await probeSource(source, undefined, {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("CORS");
  });

  it("非 JSON 响应单独提示", async () => {
    const res = await probeSource(source, undefined, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("JSON");
  });

  it("超时被翻译为超时提示", () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(explainFetchError(err)).toContain("超时");
  });
});

describe("live/probe 字段推断", () => {
  it("数组响应的首行键就是列名", () => {
    const { fields, rows } = inferFields([{ a: 1, b: 2 }, { a: 3, c: 4 }]);
    expect(fields).toEqual(["a", "b", "c"]);
    expect(rows).toHaveLength(2);
  });

  it("常见封装会把内层数组摊平", () => {
    expect(toProbeRows({ data: { list: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
  });

  it("标量包成一列 value", () => {
    expect(toProbeRows(42)).toEqual([{ value: 42 }]);
    expect(toProbeRows(null)).toEqual([]);
  });
});

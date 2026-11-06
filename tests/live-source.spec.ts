import { describe, it, expect, vi } from "vitest";
import {
  validateLiveSource,
  describePayload,
  probeLiveSource,
  LIVE_MAX_INTERVAL_SEC,
} from "../src/core/live/liveSource";

describe("core/live/liveSource", () => {
  it("接受 http/https 与站内相对地址", () => {
    for (const url of ["https://api.example.com/d", "http://10.0.0.2/d", "/api/data"]) {
      const r = validateLiveSource({ url, intervalSec: 30 });
      expect(r.ok).toBe(true);
    }
  });

  it("拒绝空地址、非 http 协议与 javascript: 伪协议", () => {
    expect(validateLiveSource({ url: "  ", intervalSec: 30 }).ok).toBe(false);
    expect(validateLiveSource({ url: "ftp://x/y", intervalSec: 30 }).ok).toBe(false);
    expect(validateLiveSource({ url: "javascript:alert(1)", intervalSec: 30 }).ok).toBe(false);
  });

  it("间隔小于下限会被抬到 5 秒，超大值封顶", () => {
    const low = validateLiveSource({ url: "/api/d", intervalSec: 1 });
    expect(low.ok && low.source.intervalSec).toBe(5);
    const high = validateLiveSource({ url: "/api/d", intervalSec: 999999 });
    expect(high.ok && high.source.intervalSec).toBe(LIVE_MAX_INTERVAL_SEC);
  });

  it("dataPath 去空格，空串则不带该字段", () => {
    const a = validateLiveSource({ url: "/api/d", intervalSec: 10, dataPath: " result.rows " });
    expect(a.ok && a.source.dataPath).toBe("result.rows");
    const b = validateLiveSource({ url: "/api/d", intervalSec: 10, dataPath: "   " });
    expect(b.ok && "dataPath" in b.source).toBe(false);
  });

  it("describePayload 给出人能读懂的预览摘要", () => {
    expect(describePayload([1, 2, 3])).toContain("共 3 项");
    expect(describePayload({ a: 1, b: 2 })).toContain("2 个字段");
    expect(describePayload("文本")).toContain("字符串");
    expect(describePayload(null)).toContain("空");
  });

  it("probeLiveSource 成功时返回预览，失败时返回错误信息", async () => {
    const ok = await probeLiveSource(
      { url: "https://x/api", intervalSec: 5, dataPath: "result" },
      async () => ({ result: [{ 月份: "一月", 销量: 10 }] })
    );
    expect(ok.ok).toBe(true);
    expect(ok.preview).toContain("共 1 项");

    const httpFail = await probeLiveSource({ url: "https://x/api", intervalSec: 5 }, async () => {
      throw new Error("HTTP 500");
    });
    expect(httpFail.ok).toBe(false);
    expect(httpFail.error).toContain("HTTP 500");

    const badPath = await probeLiveSource(
      { url: "https://x/api", intervalSec: 5, dataPath: "nope.deeper" },
      async () => ({ result: [] })
    );
    expect(badPath.ok).toBe(false);
    expect(badPath.error).toContain("dataPath");
  });

  it("probeLiveSource 用真实 fetch 时把非 2xx 变成可读错误", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as unknown as Response);
    const r = await probeLiveSource({ url: "/api/x", intervalSec: 5 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("404");
    spy.mockRestore();
  });
});

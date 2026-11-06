import { describe, it, expect } from "vitest";
import { scrubSecrets } from "../src/core/storage/workspaceRepo";
import { createWorkspace, createChartAsset, createChartSpec } from "../src/core/model/schema";

function wsWithSecrets() {
  const ws = createWorkspace();
  ws.settings.api = { baseUrl: "https://api.test", headers: { Authorization: "Bearer 123" } };
  const asset = createChartAsset("订单", createChartSpec("bar"));
  asset.spec.source = {
    url: "",
    path: "/api/orders",
    intervalSec: 30,
    headers: { "X-Token": "abc" },
  };
  ws.assets.push(asset);
  return ws;
}

describe("storage/scrubSecrets 导出脱敏", () => {
  it("默认把全局与图表级 header 的值替换成 ***，键保留", () => {
    const out = scrubSecrets(wsWithSecrets()) as ReturnType<typeof wsWithSecrets>;
    expect(out.settings.api?.headers).toEqual({ Authorization: "***" });
    expect(out.assets[0].spec.source?.headers).toEqual({ "X-Token": "***" });
    // baseUrl / path 这类非密钥信息要保留，否则导出就没用了
    expect(out.settings.api?.baseUrl).toBe("https://api.test");
    expect(out.assets[0].spec.source?.path).toBe("/api/orders");
  });

  it("显式打开 exportHeaders 时原样保留（用户自己知道在导出密钥）", () => {
    const ws = wsWithSecrets();
    ws.settings.api = { ...ws.settings.api!, exportHeaders: true };
    const out = scrubSecrets(ws) as ReturnType<typeof wsWithSecrets>;
    expect(out.settings.api?.headers).toEqual({ Authorization: "Bearer 123" });
    expect(out.assets[0].spec.source?.headers).toEqual({ "X-Token": "abc" });
  });

  it("不改动传入对象（导出不能顺手污染内存里的工作区）", () => {
    const ws = wsWithSecrets();
    scrubSecrets(ws);
    expect(ws.settings.api?.headers).toEqual({ Authorization: "Bearer 123" });
  });

  it("单图资产导出同样脱敏", () => {
    const asset = createChartAsset("订单", createChartSpec("bar"));
    asset.spec.source = { url: "", path: "/a", intervalSec: 30, headers: { "X-Key": "k" } };
    const out = scrubSecrets(asset) as typeof asset;
    expect(out.spec.source?.headers).toEqual({ "X-Key": "***" });
  });
});

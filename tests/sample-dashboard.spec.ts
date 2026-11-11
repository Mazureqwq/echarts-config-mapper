import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeWorkspace } from "@/core/model/schema";

const samplePath = new URL("../examples/screens/logistics-national-operations.screen.json", import.meta.url);
const envelope = JSON.parse(readFileSync(samplePath, "utf8")) as {
  format: string;
  kind: string;
  payload: unknown;
};

describe("logistics national operations sample screen", () => {
  it("is a valid ChartForge screen with registered visuals and all items inside the canvas", () => {
    expect(envelope.format).toBe("chartforge/v1");
    expect(envelope.kind).toBe("screen");

    const workspace = normalizeWorkspace({ version: 1, screens: [envelope.payload] });
    expect(workspace.screens).toHaveLength(1);
    const [screen] = workspace.screens;
    expect(screen.name).toBe("智慧物流·全国运营态势");
    expect(screen.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(screen.items.length).toBeGreaterThan(50);
    expect(screen.items.every((item) => item.frame.x >= 0 && item.frame.y >= 0)).toBe(true);
    expect(screen.items.every((item) => item.frame.x + item.frame.w <= screen.canvas.width)).toBe(true);
    expect(screen.items.every((item) => item.frame.y + item.frame.h <= screen.canvas.height)).toBe(true);

    const charts = screen.items.filter((item) => item.kind === "chart");
    expect(charts.some((item) => item.kind === "chart" && item.spec.type === "map")).toBe(true);
    expect(charts.some((item) => item.kind === "chart" && item.spec.type === "geoFlow")).toBe(true);
    expect(charts.some((item) => item.kind === "chart" && item.spec.type === "geoScatter")).toBe(true);
    expect(screen.items.some((item) => item.kind === "component" && item.componentId === "chartforge.section-title")).toBe(true);
  });
});

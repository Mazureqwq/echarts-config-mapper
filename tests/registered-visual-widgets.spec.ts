import { createSSRApp, h } from "vue";
import type { Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { componentRegistry } from "@/core/components/builtins";
import type { ComponentRenderProps } from "@/core/components/types";
import CornerFrameWidget from "@/workbench/components/CornerFrameWidget.vue";
import SectionTitleWidget from "@/workbench/components/SectionTitleWidget.vue";

const sharedProps: Pick<ComponentRenderProps, "item" | "snapshot" | "rows" | "variables" | "emitEvent"> = {
  item: {} as ComponentRenderProps["item"],
  snapshot: { status: "idle", rows: [] },
  rows: [],
  variables: {},
  emitEvent: () => undefined,
};

function definition(id: string) {
  const registered = componentRegistry.get(id, 1);
  expect(registered).toBeDefined();
  return registered!;
}

function renderWidget(view: Component, props: Record<string, unknown> = {}): Promise<string> {
  return renderToString(createSSRApp({
    render: () => h(view, { ...sharedProps, ...props }),
  }));
}

describe("registered visual widgets", () => {
  it("registers the exact versioned section title and corner frame contracts", () => {
    const title = definition("chartforge.section-title");
    expect(title).toMatchObject({
      id: "chartforge.section-title",
      version: 1,
      name: "标题栏",
      category: "decoration",
      defaultFrame: { x: 100, y: 100, w: 520, h: 72, rotate: 0 },
      defaults: { title: "分区标题", subtitle: "", variant: "underline", accentColor: "" },
      catalog: {
        group: "decoration",
        description: "大屏分区标题",
        tags: ["标题", "分区", "装饰"],
        previewKey: "section-title",
      },
      exportRendererId: "chartforge-section-title-v1",
    });
    expect(title.props).toEqual([
      { key: "title", label: "标题", type: "string", defaultValue: "分区标题" },
      { key: "subtitle", label: "副标题", type: "string", defaultValue: "" },
      { key: "variant", label: "样式", type: "select", defaultValue: "underline", options: ["underline", "bar", "bracket"] },
      { key: "accentColor", label: "强调色", type: "color", defaultValue: "", themeToken: "accent" },
    ]);
    expect(title.renderer).toMatchObject({ kind: "vue", view: SectionTitleWidget });

    const frame = definition("chartforge.corner-frame");
    expect(frame).toMatchObject({
      id: "chartforge.corner-frame",
      version: 1,
      name: "装饰边框",
      category: "decoration",
      defaultFrame: { x: 100, y: 100, w: 500, h: 300, rotate: 0 },
      defaults: { variant: "corner", color: "", thickness: 2, inset: 8 },
      catalog: {
        group: "decoration",
        description: "大屏角标边框装饰",
        tags: ["边框", "角标", "装饰"],
        previewKey: "corner-frame",
      },
      exportRendererId: "chartforge-corner-frame-v1",
    });
    expect(frame.props).toEqual([
      { key: "variant", label: "样式", type: "select", defaultValue: "corner", options: ["corner", "outline", "double"] },
      { key: "color", label: "边框颜色", type: "color", defaultValue: "", themeToken: "accent" },
      { key: "thickness", label: "线宽", type: "number", defaultValue: 2 },
      { key: "inset", label: "内缩", type: "number", defaultValue: 8 },
    ]);
    expect(frame.renderer).toMatchObject({ kind: "vue", view: CornerFrameWidget });
  });

  it("renders hostile title and subtitle strings as text and supports every declared title variant", async () => {
    const hostileTitle = '<img src=x onerror="alert(1)">';
    const hostileSubtitle = "<script>run()</script>";
    const html = await renderWidget(SectionTitleWidget, { title: hostileTitle, subtitle: hostileSubtitle });
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain("&lt;script&gt;run()&lt;/script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");

    for (const variant of ["underline", "bar", "bracket"] as const) {
      const rendered = await renderWidget(SectionTitleWidget, { variant });
      expect(rendered).toContain(`section-title--${variant}`);
    }
  });

  it("falls back from invalid title variants and colors without accepting CSS text", async () => {
    const html = await renderWidget(SectionTitleWidget, {
      variant: "url('https://example.invalid')" as never,
      accentColor: "red; background:url(https://example.invalid)",
    });
    expect(html).toContain("section-title--underline");
    expect(html).toContain("var(--cf-primary");
    expect(html).not.toContain("https://example.invalid");
    expect(html).not.toContain("background:url");
  });

  it("renders every corner-frame variant with bounded dimensions and no external resources", async () => {
    for (const variant of ["corner", "outline", "double"] as const) {
      const html = await renderWidget(CornerFrameWidget, { variant });
      expect(html).toContain(`corner-frame--${variant}`);
    }

    const html = await renderWidget(CornerFrameWidget, {
      variant: "external" as never,
      color: "url(https://example.invalid)",
      thickness: 90,
      inset: -40,
    });
    expect(html).toContain("corner-frame--corner");
    expect(html).toContain("--corner-thickness:8px");
    expect(html).toContain("--corner-inset:0px");
    expect(html).toContain("var(--cf-primary");
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/<(?:img|script|iframe|link)\b/i);

    const lowerBounds = await renderWidget(CornerFrameWidget, { thickness: 0, inset: 100 });
    expect(lowerBounds).toContain("--corner-thickness:1px");
    expect(lowerBounds).toContain("--corner-inset:32px");
  });
});

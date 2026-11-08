import { describe, expect, it } from "vitest";
import {
  LAYOUT_BACKGROUND_ENTRIES,
  createLayoutAssetItems,
  createLayoutBackgroundItems,
  listLayoutBackgroundEntries,
} from "../src/core/design/layoutBackgrounds";
import { templateSlots } from "../src/core/model/templates";
import type { ScreenCanvas, TemplateSlot } from "../src/core/model/templates";
import type { ScreenItem } from "../src/core/model/types";

const CANVASES: ScreenCanvas[] = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];
const EXPECTED_LAYOUTS = [
  { id: "monitor-main-side", templateId: "main-side", slotCount: 3 },
  { id: "monitor-grid-2x2", templateId: "grid-2x2", slotCount: 4 },
] as const;
const EXPECTED_IDS = [
  "monitor-main-side",
  "monitor-grid-2x2",
  "monitor-panel-frame",
  "monitor-title-band",
  "monitor-corner-accent",
];

function expectFrameInside(item: ScreenItem, canvas: ScreenCanvas): void {
  const { x, y, w, h, rotate } = item.frame;
  expect([x, y, w, h, rotate].every(Number.isFinite)).toBe(true);
  expect(w).toBeGreaterThan(0);
  expect(h).toBeGreaterThan(0);
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x + w).toBeLessThanOrEqual(canvas.width);
  expect(y + h).toBeLessThanOrEqual(canvas.height);
}

function expectSameSlotFrames(items: ScreenItem[], slots: TemplateSlot[]): void {
  const backgrounds = items.filter((item) => item.kind === "shape");
  expect(backgrounds).toHaveLength(slots.length);
  expect(backgrounds.map(({ frame }) => ({ x: frame.x, y: frame.y, w: frame.w, h: frame.h }))).toEqual(
    slots.map(({ x, y, w, h }) => ({ x, y, w, h }))
  );
}

describe("layout background recipes", () => {
  it("registers exactly the two layouts and three local assets", () => {
    expect(listLayoutBackgroundEntries()).toBe(LAYOUT_BACKGROUND_ENTRIES);
    expect(LAYOUT_BACKGROUND_ENTRIES.map(({ id }) => id)).toEqual(EXPECTED_IDS);
    expect(LAYOUT_BACKGROUND_ENTRIES.filter(({ kind }) => kind === "layout")).toHaveLength(2);
    expect(LAYOUT_BACKGROUND_ENTRIES.filter(({ kind }) => kind === "asset")).toHaveLength(3);
    expect(LAYOUT_BACKGROUND_ENTRIES.every(({ name, description, previewKey }) =>
      Boolean(name.trim() && description.trim() && previewKey) && !/^https?:/i.test(previewKey)
    )).toBe(true);
  });

  it.each(EXPECTED_LAYOUTS)("$templateId layouts reuse every template slot", ({ id, templateId, slotCount }) => {
    for (const canvas of CANVASES) {
      const slots = templateSlots(templateId, canvas);
      expect(slots).toHaveLength(slotCount);
      const items = createLayoutBackgroundItems(id, canvas);
      expect(items.length).toBeGreaterThan(slotCount);
      expectSameSlotFrames(items, slots);
      for (const item of items) expectFrameInside(item, canvas);
      for (const item of items.filter((entry) => entry.kind === "component")) {
        expect(["chartforge.section-title", "chartforge.corner-frame"]).toContain(item.componentId);
      }
    }
  });

  it("generates no partial composition for unknown IDs or unsafe canvas geometry", () => {
    expect(createLayoutBackgroundItems("not-registered", CANVASES[0])).toEqual([]);
    expect(createLayoutAssetItems("not-registered", CANVASES[0])).toEqual([]);
    for (const canvas of [
      { width: 0, height: 1080 },
      { width: -1, height: 720 },
      { width: Number.NaN, height: 720 },
      { width: 1920, height: Number.POSITIVE_INFINITY },
    ]) {
      expect(createLayoutBackgroundItems("monitor-main-side", canvas)).toEqual([]);
      expect(createLayoutBackgroundItems("monitor-grid-2x2", canvas)).toEqual([]);
      expect(createLayoutAssetItems("monitor-panel-frame", canvas)).toEqual([]);
    }
  });

  it("returns no tiny layout or keeps all tiny-layout frames finite and in bounds", () => {
    for (const id of ["monitor-main-side", "monitor-grid-2x2"]) {
      const canvas = { width: 80, height: 80 };
      for (const item of createLayoutBackgroundItems(id, canvas)) expectFrameInside(item, canvas);
    }
  });

  it.each(["monitor-panel-frame", "monitor-title-band", "monitor-corner-accent"])(
    "centers %s on click and honors an explicit insertion point",
    (id) => {
      const canvas = { width: 1280, height: 720 };
      const centered = createLayoutAssetItems(id, canvas);
      const dropped = createLayoutAssetItems(id, canvas, { x: 640, y: 360 });
      expect(centered).toHaveLength(1);
      expect(dropped).toHaveLength(1);
      expect(centered[0].frame).toEqual(dropped[0].frame);
      expect(centered[0].frame.x + centered[0].frame.w / 2).toBeCloseTo(640);
      expect(centered[0].frame.y + centered[0].frame.h / 2).toBeCloseTo(360);
      expectFrameInside(centered[0], canvas);
    }
  );
});

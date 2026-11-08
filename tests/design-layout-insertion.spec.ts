import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createItem, createScreen } from "../src/core/model/schema";
import { useDocumentStore } from "../src/stores/documentStore";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import type { ScreenItem } from "../src/core/model/types";

function seedScreen(canvas = { width: 1280, height: 720 }) {
  const workspace = useWorkspaceStore();
  const document = useDocumentStore();
  const screen = createScreen("验收大屏", canvas);
  workspace.workspace.screens.push(screen);
  document.currentScreenId = screen.id;
  return { workspace, document, screen };
}

function expectItemsInside(items: ScreenItem[], width: number, height: number): void {
  for (const item of items) {
    expect([item.frame.x, item.frame.y, item.frame.w, item.frame.h, item.frame.rotate].every(Number.isFinite)).toBe(true);
    expect(item.frame.w).toBeGreaterThan(0);
    expect(item.frame.h).toBeGreaterThan(0);
    expect(item.frame.x).toBeGreaterThanOrEqual(0);
    expect(item.frame.y).toBeGreaterThanOrEqual(0);
    expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(width);
    expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(height);
  }
}

beforeEach(() => setActivePinia(createPinia()));

describe("document layout background insertion", () => {
  it("returns a safe no-op for a missing screen or unknown recipe", () => {
    const document = useDocumentStore();
    const commit = vi.spyOn(document, "commit");
    expect(document.insertLayoutBackground("monitor-main-side")).toEqual([]);
    expect(document.insertLayoutAsset("monitor-panel-frame")).toEqual([]);
    expect(commit).not.toHaveBeenCalled();

    const { screen } = seedScreen();
    expect(document.insertLayoutBackground("unknown-layout")).toEqual([]);
    expect(document.insertLayoutAsset("unknown-asset")).toEqual([]);
    expect(screen.items).toEqual([]);
    expect(commit).not.toHaveBeenCalled();
  });

  it("inserts a grouped layout behind existing items without changing them or the canvas background", () => {
    const { document, screen } = seedScreen();
    const existing = createItem("shape", { x: 32, y: 48, w: 160, h: 90 });
    existing.name = "既有图层";
    screen.items.push(existing);
    const oldBackground = structuredClone(screen.canvas.background);
    const oldFrame = structuredClone(existing.frame);
    const oldItems = [...screen.items];
    const commit = vi.spyOn(document, "commit");

    const ids = document.insertLayoutBackground("monitor-main-side");

    expect(ids.length).toBeGreaterThan(3);
    expect(screen.items.slice(0, ids.length).map((item) => item.id)).toEqual(ids);
    const inserted = screen.items.slice(0, ids.length);
    expect(new Set(inserted.map((item) => item.groupId))).toEqual(new Set([inserted[0].groupId]));
    expect(inserted[0].groupId).toBeTruthy();
    expect(screen.items.slice(ids.length)).toEqual(oldItems);
    expect(screen.items[ids.length]).toBe(oldItems[0]);
    expect(existing.frame).toEqual(oldFrame);
    expect(screen.canvas.background).toEqual(oldBackground);
    expectItemsInside(inserted, 1280, 720);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("assigns fresh item and group IDs on repeated layout insertion", () => {
    const { document, screen } = seedScreen();
    const firstIds = document.insertLayoutBackground("monitor-grid-2x2");
    const firstGroup = screen.items[0].groupId;
    const secondIds = document.insertLayoutBackground("monitor-grid-2x2");
    const secondGroup = screen.items[0].groupId;

    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    expect(firstGroup).toBeTruthy();
    expect(secondGroup).toBeTruthy();
    expect(secondGroup).not.toBe(firstGroup);
    expect(screen.items.slice(0, secondIds.length).every((item) => item.groupId === secondGroup)).toBe(true);
  });

  it("inserts a standalone asset at the drop point and centers click insertion", () => {
    const { document, screen } = seedScreen();
    const droppedId = document.insertLayoutAsset("monitor-title-band", { x: 420, y: 260 })[0];
    const dropped = screen.items.find((item) => item.id === droppedId)!;
    expect(dropped.frame.x + dropped.frame.w / 2).toBeCloseTo(420);
    expect(dropped.frame.y + dropped.frame.h / 2).toBeCloseTo(260);
    expectItemsInside([dropped], screen.canvas.width, screen.canvas.height);

    const centeredId = document.insertLayoutAsset("monitor-panel-frame")[0];
    const centered = screen.items.find((item) => item.id === centeredId)!;
    expect(centered.frame.x + centered.frame.w / 2).toBeCloseTo(screen.canvas.width / 2);
    expect(centered.frame.y + centered.frame.h / 2).toBeCloseTo(screen.canvas.height / 2);
  });
});

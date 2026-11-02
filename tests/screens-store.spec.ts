import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useScreensStore } from "../src/stores/screens";

describe("screens store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("create 生成 schema 并插入列表头部，保存到 screens 目录", async () => {
    const store = useScreensStore();
    const schema = await store.create("销售 大屏");
    expect(schema.version).toBe(1);
    expect(schema.canvas.width).toBe(1920);
    expect(schema.canvas.height).toBe(1080);
    expect(schema.items).toHaveLength(0);
    expect(schema.id.indexOf("销售-大屏-")).toBe(0);
    expect(store.screens[0].id).toBe(schema.id);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/save");
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.path).toBe("src/assets/screens/" + schema.id + ".screen.json");
  });

  it("copy 生成新 id 与副本名称且 items 深拷贝互不影响", async () => {
    const store = useScreensStore();
    const schema = await store.create("原屏");
    schema.items.push({
      id: "item-1",
      type: "text",
      name: "文本",
      rect: { x: 0, y: 0, w: 100, h: 40 },
      zIndex: 1,
      visible: true,
      locked: false,
    });
    const copy = await store.copy(schema.id);
    expect(copy).not.toBe(schema);
    expect(copy.id).not.toBe(schema.id);
    expect(copy.name).toBe("原屏 副本");
    copy.items[0].name = "已改动";
    expect(schema.items[0].name).toBe("文本");
    expect(store.screens[0].id).toBe(copy.id);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/save");
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(body.path).toBe("src/assets/screens/" + copy.id + ".screen.json");
  });

  it("save 同步 updatedAt 并替换 state 内对象", async () => {
    const store = useScreensStore();
    const schema = await store.create("待保存");
    schema.updatedAt = "2000-01-01T00:00:00.000Z";
    await store.save(schema);
    expect(schema.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
    const stored = store.byId(schema.id);
    expect(stored?.id).toBe(schema.id);
    expect(stored?.updatedAt).toBe(schema.updatedAt);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/save");
  });

  it("remove 调用 /api/delete 并从列表移除", async () => {
    const store = useScreensStore();
    const schema = await store.create("待删除");
    expect(store.screens.some((item) => item.id === schema.id)).toBe(true);
    await store.remove(schema.id);
    expect(store.screens.some((item) => item.id === schema.id)).toBe(false);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/delete");
  });
});

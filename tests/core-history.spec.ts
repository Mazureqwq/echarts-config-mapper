import { describe, it, expect } from "vitest";
import { History } from "../src/core/history/history";

interface Doc {
  n: number;
  items?: string[];
}

describe("core/history", () => {
  it("push/undo/redo 边界", () => {
    const h = new History<Doc>();
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(h.current()).toBeNull();
    h.push({ n: 1 });
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();
    h.push({ n: 2 });
    expect(h.undo()).toEqual({ n: 1 });
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toEqual({ n: 2 });
    expect(h.redo()).toBeNull();
  });

  it("push 清空 redo 栈", () => {
    const h = new History<Doc>();
    h.push({ n: 1 });
    h.push({ n: 2 });
    h.undo();
    h.push({ n: 3 });
    expect(h.canRedo).toBe(false);
    expect(h.current()).toEqual({ n: 3 });
  });

  it("limit 截断最旧状态", () => {
    const h = new History<Doc>({ limit: 3 });
    h.push({ n: 1 });
    h.push({ n: 2 });
    h.push({ n: 3 });
    h.push({ n: 4 });
    expect(h.undo()).toEqual({ n: 3 });
    expect(h.undo()).toEqual({ n: 2 });
    expect(h.undo()).toBeNull();
  });

  it("快照零共享引用：入栈、current、undo 返回值互不污染", () => {
    const h = new History<Doc>();
    const doc: Doc = { n: 1, items: ["a"] };
    h.push(doc);
    doc.items!.push("b");
    expect(h.current()!.items).toEqual(["a"]);
    const snap = h.current()!;
    snap.items!.push("x");
    expect(h.current()!.items).toEqual(["a"]);
    h.push({ n: 2, items: ["b"] });
    const back = h.undo()!;
    back.items!.push("y");
    expect(h.current()!.items).toEqual(["a"]);
  });

  it("clear 清空历史", () => {
    const h = new History<Doc>();
    h.push({ n: 1 });
    h.push({ n: 2 });
    h.clear();
    expect(h.current()).toBeNull();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

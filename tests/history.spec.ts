import { describe, expect, it } from "vitest";
import { HistoryStack } from "../src/utils/history";

describe("HistoryStack", () => {
  it("初始状态不能撤销/重做", () => {
    const stack = new HistoryStack({ n: 0 });
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });

  it("push/undo/redo 正确回滚", () => {
    const stack = new HistoryStack({ n: 0 });
    stack.push({ n: 1 });
    stack.push({ n: 2 });
    expect(stack.value.n).toBe(2);
    expect(stack.undo().n).toBe(1);
    expect(stack.undo().n).toBe(0);
    expect(stack.canUndo).toBe(false);
    expect(stack.redo().n).toBe(1);
    expect(stack.redo().n).toBe(2);
  });

  it("新操作会清空重做栈", () => {
    const stack = new HistoryStack({ n: 0 });
    stack.push({ n: 1 });
    stack.undo();
    stack.push({ n: 5 });
    expect(stack.canRedo).toBe(false);
  });

  it("超出上限时丢弃最早记录", () => {
    const stack = new HistoryStack({ n: 0 }, 3);
    [1, 2, 3, 4, 5].forEach((n) => stack.push({ n }));
    expect(stack.size).toBe(3);
    const seen: number[] = [];
    while (stack.canUndo) seen.push(stack.undo().n);
    expect(seen).toEqual([4, 3, 2]);
  });
});

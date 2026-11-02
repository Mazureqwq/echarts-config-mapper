import { describe, expect, it } from "vitest";
import { isTypingTarget } from "@/utils/dom";

/** 伪造事件目标（node 环境无 DOM，只依赖 tagName 与 isContentEditable 字段） */
function fake(tagName: string, contentEditable = false): EventTarget {
  return { tagName, isContentEditable: contentEditable } as unknown as EventTarget;
}

describe("isTypingTarget", () => {
  it("INPUT 输入框判定为输入态", () => {
    expect(isTypingTarget(fake("INPUT"))).toBe(true);
  });

  it("TEXTAREA 与 SELECT 判定为输入态", () => {
    expect(isTypingTarget(fake("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(fake("SELECT"))).toBe(true);
  });

  it("contentEditable 元素判定为输入态", () => {
    expect(isTypingTarget(fake("DIV", true))).toBe(true);
  });

  it("普通元素与空目标判定为非输入态", () => {
    expect(isTypingTarget(fake("DIV"))).toBe(false);
    expect(isTypingTarget(fake("BODY"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("大小写敏感：小写标签不误判（浏览器实际输出大写）", () => {
    expect(isTypingTarget(fake("input"))).toBe(false);
  });
});

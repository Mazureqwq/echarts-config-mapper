import { inject, provide } from "vue";
import type { EChartsOptionLike } from "@/types/chart";

/**
 * 面板与 store 之间的解耦上下文。
 * 面板只面向 option 编辑能力（读/改/替换/记历史），不感知具体 store 实现。
 */
export interface OptionEditor {
  read(path: string, fallback?: unknown): unknown;
  /** 连续输入使用，不记历史 */
  update(path: string | Array<string | number>, value: unknown): void;
  /** 整体替换 option；record=true 记一次历史 */
  replace(option: EChartsOptionLike, record: boolean): void;
  /** 手动记一次历史（如 addRow/removeRow 后） */
  commit(): void;
}

const OPTION_EDITOR_KEY = "optionEditor";

export function provideOptionEditor(editor: OptionEditor): void {
  provide(OPTION_EDITOR_KEY, editor);
}

export function useOptionEditor(): OptionEditor {
  const editor = inject<OptionEditor>(OPTION_EDITOR_KEY);
  if (!editor) {
    throw new Error("useOptionEditor: 缺少 OptionEditor 上下文，请先在祖先组件调用 provideOptionEditor");
  }
  return editor;
}

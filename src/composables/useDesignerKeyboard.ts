import { onBeforeUnmount, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useDesignerStore } from "@/stores/designer";
import { isTypingTarget } from "@/utils/dom";

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** 设计器全局快捷键：删除/复制/粘贴/撤销重做/保存/方向键微调（Shift 10px） */
export function useDesignerKeyboard(): void {
  const designer = useDesignerStore();

  function onKeyDown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (isTypingTarget(event.target)) return;
    if (!designer.schema) return;

    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      designer
        .save()
        .then(() => ElMessage.success("大屏已保存"))
        .catch(() => ElMessage.error("保存失败：保存 API 仅开发环境可用"));
      return;
    }

    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) designer.redo();
      else designer.undo();
      return;
    }

    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      designer.redo();
      return;
    }

    if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      designer.copySelected();
      return;
    }

    if (mod && event.key.toLowerCase() === "v") {
      event.preventDefault();
      designer.paste();
      return;
    }

    if (event.key === "Delete") {
      if (designer.selectedId) {
        event.preventDefault();
        designer.removeItem(designer.selectedId);
      }
      return;
    }

    if (!mod && event.key in ARROW_STEPS && designer.selectedId) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const [dxUnit, dyUnit] = ARROW_STEPS[event.key];
      const item = designer.schema.items.find((entry) => entry.id === designer.selectedId);
      if (!item) return;
      designer.updateRect(
        item.id,
        { x: item.rect.x + dxUnit * step, y: item.rect.y + dyUnit * step },
        false,
      );
      designer.commit();
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
}

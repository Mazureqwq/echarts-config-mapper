<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import {
  STYLE_CLIPBOARD_EXCLUDED_KEYS,
  canPasteStyle,
  describeStyleClipboardTarget,
} from "@/core/components/styleClipboard";
import type { ScreenItem } from "@/core/model/types";

/**
 * T14（P0-1 / P0-2）：复制 / 粘贴样式。
 *
 * 这是 DataV 设计库调研里「执行层」的入口——让规格真正落到组件上的机制。
 * 只复制外观；位置、尺寸、id、名称、数据绑定永不变动。
 */
const props = defineProps<{ item: ScreenItem }>();
const doc = useDocumentStore();
const feedback = ref("");
const feedbackKind = ref<"ok" | "error">("ok");

const canPaste = computed(() => canPasteStyle(props.item, doc.styleClipboard));
const copiedLabel = computed(() => doc.styleClipboard?.label ?? "");
const canCopy = computed(() => {
  // 未注册的组件版本不允许复制（其 props 语义未知）
  return props.item.kind !== "component" || Boolean(props.item.componentId);
});

// 切换选中元素时清空上一次的操作反馈，否则旧的「已复制…」会盖住当前元素的提示
watch(() => props.item.id, () => {
  feedback.value = "";
});

function announce(message: string, kind: "ok" | "error"): void {
  feedback.value = message;
  feedbackKind.value = kind;
}

function onCopy(): void {
  const result = doc.copyStyle(props.item.id);
  announce(result.message, result.ok ? "ok" : "error");
}

function onPaste(): void {
  const result = doc.pasteStyle(props.item.id);
  announce(result.message, result.ok ? "ok" : "error");
}
</script>

<template>
  <div class="style-clipboard" data-style-clipboard>
    <div class="style-clipboard__actions">
      <button
        type="button"
        class="cf-button cf-button--ghost cf-button--small style-clipboard__btn"
        :disabled="!canCopy"
        data-style-copy
        @click="onCopy"
      >
        复制样式
      </button>
      <button
        type="button"
        class="cf-button cf-button--ghost cf-button--small style-clipboard__btn"
        :disabled="!canPaste"
        :title="doc.styleClipboard ? `粘贴「${copiedLabel}」的样式` : '样式剪贴板为空'"
        data-style-paste
        @click="onPaste"
      >
        粘贴样式
      </button>
    </div>
    <p v-if="feedback" class="style-clipboard__feedback" :class="`style-clipboard__feedback--${feedbackKind}`" role="status">
      {{ feedback }}
    </p>
    <p v-else-if="doc.styleClipboard && !canPaste" class="style-clipboard__hint">
      剪贴板中是「{{ copiedLabel }}」的样式，与当前「{{ describeStyleClipboardTarget(item) }}」类型不同，无法粘贴。
    </p>
    <p class="style-clipboard__note">
      只复制外观；位置、尺寸、数据绑定保持不变（不复制 {{ STYLE_CLIPBOARD_EXCLUDED_KEYS.slice(0, 4).join(" / ") }} 等数据字段）。
    </p>
  </div>
</template>

<style scoped>
.style-clipboard { display: flex; flex-direction: column; gap: 6px; }
.style-clipboard__actions { display: flex; gap: 6px; }
.style-clipboard__btn { flex: 1 1 0; min-width: 0; }
.style-clipboard__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.style-clipboard__feedback { margin: 0; font-size: 10px; }
.style-clipboard__feedback--ok { color: var(--cf-primary); }
.style-clipboard__feedback--error { color: var(--cf-danger); }
.style-clipboard__hint { margin: 0; color: var(--cf-text-2); font-size: 10px; line-height: 1.5; }
.style-clipboard__note { margin: 0; color: var(--cf-text-2); font-size: 9px; line-height: 1.5; opacity: 0.8; }
</style>

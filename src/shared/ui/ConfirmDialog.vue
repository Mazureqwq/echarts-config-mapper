<script setup lang="ts">
defineProps<{
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();
</script>

<template>
  <teleport to="body">
    <div class="cf-confirm__mask" @click.self="emit('cancel')">
      <div class="cf-confirm__box" role="dialog">
        <div class="cf-confirm__title">{{ title }}</div>
        <div class="cf-confirm__message">{{ message }}</div>
        <div class="cf-confirm__slot"><slot /></div>
        <div class="cf-confirm__actions">
          <button class="cf-button cf-button--ghost" @click="emit('cancel')">{{ cancelText ?? "取消" }}</button>
          <button class="cf-button cf-button--primary" @click="emit('confirm')">
            {{ confirmText ?? "确定" }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.cf-confirm__mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cf-confirm__box {
  width: 320px;
  padding: 20px;
  border-radius: var(--cf-radius, 8px);
  background: var(--cf-panel, #fff);
  box-shadow: var(--cf-shadow, 0 2px 8px rgba(0, 0, 0, 0.2));
}
.cf-confirm__title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}
.cf-confirm__message {
  color: var(--cf-text-2, #646a73);
  margin-bottom: 16px;
  line-height: 1.6;
}
.cf-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}</style>

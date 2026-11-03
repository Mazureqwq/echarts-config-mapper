<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";

const fatal = ref("");

onErrorCaptured((err: unknown) => {
  fatal.value = err instanceof Error ? err.message : String(err);
  return false;
});
</script>

<template>
  <div class="app-shell">
    <div v-if="fatal" class="app-fatal">
      <h2>页面出错了</h2>
      <p>{{ fatal }}</p>
      <button @click="fatal = ''">返回</button>
    </div>
    <router-view v-else />
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
}
.app-fatal {
  padding: 48px;
  text-align: center;
}
</style>

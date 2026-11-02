<template>
  <main class="page">
    <h1 class="title">大屏预览</h1>
    <p class="tip">运行态建设中（Task 9/10 实现），当前大屏 id：{{ id }}</p>
  </main>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";

// 占位视图：Task 9/10 替换为大屏运行态
const route = useRoute();
const id = route.params.id;
</script>

<style scoped>
.page {
  height: 100%;
  overflow: auto;
  padding: 24px 32px;
}

.title {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--cf-text);
}

.tip {
  color: var(--cf-text-dim);
}
</style>

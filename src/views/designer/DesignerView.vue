<template>
  <main class="page">
    <h1 class="title">大屏设计器</h1>
    <p class="tip">设计器建设中（Task 12/13 实现），当前大屏 id：{{ id }}</p>
  </main>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";

// 占位视图：Task 13 替换为设计器正式布局
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

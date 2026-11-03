<script setup lang="ts">
defineProps<{ id: string }>();
// 任务14 组装完整工作台
</script>

<template>
  <div class="workbench-placeholder">
    <h1>工作台</h1>
    <p>当前大屏：{{ id }}</p>
    <router-link to="/">返回列表</router-link>
  </div>
</template>

<style scoped>
.workbench-placeholder {
  padding: 48px;
  text-align: center;
}
</style>

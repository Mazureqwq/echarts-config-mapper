<script setup lang="ts">
defineProps<{ id: string }>();
// 任务14 填充演示模式
</script>

<template>
  <div class="play-placeholder">
    <h1>演示模式</h1>
    <p>大屏：{{ id }}</p>
    <router-link to="/">返回</router-link>
  </div>
</template>

<style scoped>
.play-placeholder {
  padding: 48px;
  text-align: center;
}
</style>

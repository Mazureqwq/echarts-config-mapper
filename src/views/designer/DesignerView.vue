<template>
  <main class="page">
    <DesignerCanvas />
  </main>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import DesignerCanvas from "@/components/designer/DesignerCanvas.vue";
import { useDesignerStore } from "@/stores/designer";

// 临时布局：Task 13 替换为设计器正式布局（顶栏/面板/快捷键）
const route = useRoute();
const designer = useDesignerStore();

onMounted(() => {
  const id = String(route.params.id ?? "");
  if (!id || !designer.load(id)) {
    designer.newSchema();
  }
});
</script>

<style scoped>
.page {
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
}
</style>

<template>
  <main v-if="!schema" class="missing">
    <p class="missing-title">大屏不存在</p>
    <p class="missing-tip">未找到大屏：{{ id }}</p>
    <el-button type="primary" @click="goBack">返回大屏列表</el-button>
  </main>
  <div v-else class="render-page">
    <ScreenStage :schema="schema" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ScreenSchema } from "@/core/types";
import ScreenStage from "@/core/ScreenStage.vue";

const route = useRoute();
const router = useRouter();

/** Task 10 接入 screensStore 后改为 store.byId(route.params.id) 提供 */
const schema = ref<ScreenSchema | null>(null);

const id = computed(() => String(route.params.id ?? ""));

function goBack(): void {
  router.push("/screens");
}
</script>

<style scoped>
.missing {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.missing-title {
  margin: 0;
  font-size: 18px;
  color: var(--cf-text);
}

.missing-tip {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-dim);
}

.render-page {
  width: 100%;
  height: 100%;
}
</style>

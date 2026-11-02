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
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ScreenSchema } from "@/core/types";
import ScreenStage from "@/core/ScreenStage.vue";
import { applyApiData, createPoller, pickByPath } from "@/core/data-source";
import type { Poller } from "@/core/data-source";
import { useScreensStore } from "@/stores/screens";
import { deepClone } from "@/utils/object";

const route = useRoute();
const router = useRouter();
const store = useScreensStore();

const id = computed(() => String(route.params.id ?? ""));
const schema = ref<ScreenSchema | null>(null);
const pollers: Poller[] = [];

function stopPollers(): void {
  for (const poller of pollers) poller.stop();
  pollers.length = 0;
}

/** 载入 schema 快照并为 API 数据源图表建立轮询（interval 为 0 只拉取一次） */
function initScreen(): void {
  stopPollers();
  const source = store.byId(id.value);
  if (!source) {
    schema.value = null;
    return;
  }
  const clone = reactive(deepClone(source));
  schema.value = clone;
  for (const item of clone.items) {
    const chart = item.chart;
    if (item.type !== "chart" || !chart) continue;
    const config = chart.dataSource;
    if (config.mode !== "api" || !config.api.url) continue;
    const api = config.api;
    const poller = createPoller(
      () =>
        fetch(api.url, { method: api.method, headers: api.headers }).then((response) =>
          response.json(),
        ),
      (data) => {
        const value = pickByPath(data, api.dataPath);
        if (value !== undefined) {
          chart.option = applyApiData(chart.option, value, api.optionPath);
        }
      },
      api.interval,
    );
    poller.start();
    pollers.push(poller);
  }
}

watch(id, initScreen, { immediate: true });

onBeforeUnmount(stopPollers);

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

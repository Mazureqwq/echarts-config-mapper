<template>
  <main class="page cf-app">
    <header class="toolbar">
      <el-input
        v-model="query"
        class="search-input"
        placeholder="搜索名称或标签"
        clearable
      />
      <el-select v-model="category" class="category-select">
        <el-option
          v-for="opt in categoryOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <div class="spacer"></div>
      <el-button type="primary" @click="createNew">新建图表</el-button>
    </header>

    <div v-if="list.length === 0" class="empty">
      <p class="empty-title">还没有图表资产</p>
      <p class="empty-tip">在编辑器里调整好图表后点击「存为资产」，即可保存到这里复用</p>
    </div>

    <div v-else class="grid">
      <AssetCard v-for="asset in list" :key="asset.id" :asset="asset" />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useAssetsStore } from "@/stores/assets";
import AssetCard from "@/components/library/AssetCard.vue";

const router = useRouter();
const assetsStore = useAssetsStore();

const query = ref("");
const category = ref("");

const categoryOptions = computed(() => {
  const options = [{ label: "全部分类", value: "" }];
  for (const item of assetsStore.categories) {
    options.push({ label: item, value: item });
  }
  return options;
});

const list = computed(() => assetsStore.filtered(query.value, category.value));

function createNew(): void {
  router.push("/editor");
}
</script>

<style scoped>
.page {
  height: 100%;
  overflow: auto;
  padding: 24px 32px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.search-input {
  width: 240px;
}

.category-select {
  width: 160px;
}

.spacer {
  flex: 1 1 auto;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 288px);
  gap: 16px;
  justify-content: flex-start;
}

.empty {
  padding: 96px 0;
  text-align: center;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--cf-text);
}

.empty-tip {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-dim);
}
</style>

<script setup lang="ts">
const search = defineModel<string>("search", { required: true });
const category = defineModel<string>("category", { required: true });
const activeTag = defineModel<string | null>("activeTag", { required: true });

withDefaults(
  defineProps<{
    categories: string[];
    tags: string[];
    searchPlaceholder?: string;
  }>(),
  { searchPlaceholder: "搜索名称或标签" }
);
</script>

<template>
  <div class="collection-filter-bar">
    <slot name="leading" />
    <input
      v-model="search"
      class="collection-filter-bar__search"
      type="search"
      :placeholder="searchPlaceholder"
    />
    <select v-model="category" class="collection-filter-bar__select">
      <option value="">全部分类</option>
      <option value="未分类">未分类</option>
      <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
    </select>
    <div v-if="tags.length" class="collection-filter-bar__tags">
      <button
        v-for="tag in tags"
        :key="tag"
        type="button"
        class="collection-filter-bar__tag"
        :class="{ active: activeTag === tag }"
        :aria-pressed="activeTag === tag"
        @click="activeTag = activeTag === tag ? null : tag"
      >
        {{ tag }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.collection-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.collection-filter-bar__search {
  box-sizing: border-box;
  width: 220px;
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}

.collection-filter-bar__select {
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}

.collection-filter-bar__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.collection-filter-bar__tag {
  padding: 4px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 12px;
}

.collection-filter-bar__tag.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
}
</style>

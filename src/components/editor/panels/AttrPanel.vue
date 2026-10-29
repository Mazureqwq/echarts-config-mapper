<template>
  <div class="attr-panel">
    <div class="search-row">
      <ElInput v-model="keyword" size="small" placeholder="搜索属性…" clearable>
        <template #prefix><Icon name="search" :size="13" /></template>
      </ElInput>
    </div>

    <div class="group-tabs">
      <button
        v-for="group in visibleGroups"
        :key="group.key"
        class="gtab"
        :class="{ active: group.key === activeKey }"
        @click="activeKey = group.key"
      >
        {{ groupShort(group.label) }}
      </button>
    </div>

    <div class="fields" v-if="activeGroup">
      <p v-if="activeGroup.desc" class="group-desc">{{ activeGroup.desc }}</p>
      <FieldControl
        v-for="(meta, key) in activeGroup.fields"
        :key="key"
        :meta="meta"
        :value="readValue(key)"
        @update="(v) => onUpdate(key, v)"
        @child-update="(childKey, v) => onChildUpdate(key, childKey, v)"
      />
    </div>

    <div class="empty" v-else>没有匹配的属性</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElInput } from "element-plus";
import FieldControl from "@/components/editor/panels/FieldControl.vue";
import Icon from "@/components/ui/Icon.vue";
import { getSchema } from "@/config/schema";
import { useWorkspaceStore } from "@/stores/workspace";
import type { ChartInstance, SchemaGroup } from "@/types/chart";
import { getByPath, setByPath } from "@/utils/object";

const props = defineProps<{ chart: ChartInstance }>();
const store = useWorkspaceStore();

const keyword = ref("");
const activeKey = ref("title");

const schema = computed(() => getSchema(props.chart.type));

const groups = computed<SchemaGroup[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return schema.value.groups;
  return schema.value.groups
    .map((group) => {
      const fields = Object.fromEntries(
        Object.entries(group.fields).filter(
          ([key, meta]) =>
            key.toLowerCase().includes(kw) || meta.label.toLowerCase().includes(kw),
        ),
      );
      return { ...group, fields };
    })
    .filter((group) => Object.keys(group.fields).length > 0);
});

const visibleGroups = computed(() => groups.value);

const activeGroup = computed<SchemaGroup | null>(
  () => groups.value.find((group) => group.key === activeKey.value) ?? groups.value[0] ?? null,
);

watch(
  () => props.chart.id,
  () => {
    keyword.value = "";
    activeKey.value = "title";
  },
);

function groupShort(label: string): string {
  return label.split(" ")[0] ?? label;
}

/** 字段路径 = 分组键 + 字段键（schema 中均为相对路径） */
function fullPath(key: string): string {
  const group = activeGroup.value;
  return group ? `${group.key}.${key}` : key;
}

function readValue(key: string): unknown {
  return getByPath(props.chart.option, fullPath(key));
}

function onUpdate(key: string, value: unknown): void {
  store.updateOption(props.chart.id, fullPath(key), value);
  store.commit();
}

function onChildUpdate(key: string, childKey: string, value: unknown): void {
  const path = fullPath(key);
  const current = getByPath(props.chart.option, path);
  const base = current && typeof current === "object" ? current : {};
  store.updateOption(props.chart.id, path, setByPath(base, childKey, value));
  store.commit();
}
</script>

<style scoped>
.attr-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1 1 auto;
}

.search-row {
  padding: 0 0 2px;
}

.group-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.gtab {
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--cf-border);
  background: var(--cf-bg-2);
  color: var(--cf-text-muted);
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.gtab:hover {
  color: var(--cf-text);
  border-color: var(--cf-border-strong);
}

.gtab.active {
  background: var(--cf-accent-soft);
  border-color: var(--cf-accent);
  color: #c7c9ff;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
}

.group-desc {
  margin: 2px 0 4px;
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.empty {
  padding: 20px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--cf-text-faint);
}
</style>

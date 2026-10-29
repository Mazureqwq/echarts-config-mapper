<template>
  <div class="data-panel">
    <div class="sheet-head">
      <span class="sheet-title">数据表</span>
      <span class="sheet-hint">{{ rows.length }} 行 × {{ columns.length }} 列</span>
    </div>

    <div class="sheet" v-if="columns.length">
      <div class="sheet-row sheet-header">
        <span v-for="col in columns" :key="col.key" class="cell head">{{ col.label }}</span>
        <span class="cell head narrow" />
      </div>

      <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="sheet-row">
        <input
          v-for="col in columns"
          :key="col.key"
          class="cell input"
          :value="row[col.key]"
          @input="onCellInput(rowIndex, col.key, ($event.target as HTMLInputElement).value)"
        />
        <button class="cell narrow del" title="删除该行" @click="removeRow(rowIndex)">
          <Icon name="close" :size="12" />
        </button>
      </div>
    </div>

    <p v-else class="tips">该图表类型暂不支持表格编辑，请使用 JSON 面板。</p>

    <div class="sheet-actions">
      <button class="soft-btn" @click="addRow"><Icon name="plus" :size="12" />新增行</button>
      <button class="soft-btn" @click="reset"><Icon name="reset" :size="12" />恢复默认数据</button>
    </div>

    <p class="tips">{{ sheetTip }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "@/components/ui/Icon.vue";
import { createDefaultOption } from "@/config/optionFactory";
import { useWorkspaceStore } from "@/stores/workspace";
import type { ChartInstance } from "@/types/chart";
import { getByPath, setByPath } from "@/utils/object";

const props = defineProps<{ chart: ChartInstance }>();
const store = useWorkspaceStore();

interface Column {
  key: string;
  label: string;
}

const value = (path: string): any => getByPath(props.chart.option, path);

const sheetTip = computed(() => {
  switch (props.chart.type) {
    case "map":
      return "区域名称需与地图数据中的名称完全一致（例如「广东省」「北京市」），数值用于视觉映射着色。";
    case "radar":
      return "每列对应雷达图的一个指标维度，行 1 为该系列各维度的取值。";
    case "pie":
      return "每行一个扇区，数值决定面积占比。";
    case "scatter":
      return "每行一个点，X / Y 为数值坐标。";
    default:
      return "类目轴（xAxis.data）与第 1 条系列长度需一致，编辑时会自动对齐。";
  }
});

const categoriesPath = computed(() => (props.chart.type === "line" || props.chart.type === "bar" ? "xAxis.data" : ""));

const columns = computed<Column[]>(() => {
  const type = props.chart.type;
  const first = value("series.0.data");
  if (!Array.isArray(first)) return [];

  if (type === "pie") {
    return [
      { key: "name", label: "名称" },
      { key: "value", label: "数值" },
    ];
  }
  if (type === "radar") {
    const indicator = (value("radar.indicator") ?? []) as Array<{ name: string }>;
    return indicator.map((item, index) => ({ key: `v${index}`, label: item.name }));
  }
  if (type === "scatter") {
    return [
      { key: "x", label: "X" },
      { key: "y", label: "Y" },
    ];
  }
  return [
    { key: categoriesPath.value ? "category" : "x", label: categoriesPath.value ? "类目" : "X" },
    ...[0, 1].map((index) => ({
      key: `v${index}`,
      label: (value(`series.${index}.name`) as string) ?? `系列 ${index + 1}`,
    })),
  ];
});

const rows = computed<Record<string, string>[]>(() => {
  const type = props.chart.type;
  const seriesCount = ((value("series") ?? []) as unknown[]).length || 1;
  const length = Math.max(
    ((value("series.0.data") ?? []) as unknown[]).length,
    categoriesPath.value ? ((value(categoriesPath.value) ?? []) as unknown[]).length : 0,
  );

  return Array.from({ length }, (_, rowIndex) => {
    const row: Record<string, string> = {};

    if (type === "pie") {
      const item = value(`series.0.data.${rowIndex}`) ?? {};
      row.name = String(item.name ?? "");
      row.value = String(item.value ?? "");
      return row;
    }
    if (type === "radar") {
      const item = value(`series.0.data.0.value`) ?? [];
      columns.value.forEach((col, idx) => {
        row[col.key] = String((item as unknown[])[idx] ?? "");
      });
      return row;
    }
    if (type === "scatter") {
      const item = (value(`series.0.data.${rowIndex}`) ?? []) as unknown[];
      row.x = String(item[0] ?? "");
      row.y = String(item[1] ?? "");
      return row;
    }

    if (categoriesPath.value) {
      row.category = String((value(categoriesPath.value) as unknown[])?.[rowIndex] ?? "");
    } else {
      row.x = String((value(`series.0.data.${rowIndex}`) as unknown) ?? "");
    }
    for (let s = 0; s < Math.min(seriesCount, 2); s += 1) {
      row[`v${s}`] = String((value(`series.${s}.data.${rowIndex}`) as unknown) ?? "");
    }
    return row;
  });
});

function onCellInput(rowIndex: number, key: string, raw: string): void {
  const type = props.chart.type;
  let option = props.chart.option;

  if (type === "pie") {
    const list = [...((value("series.0.data") ?? []) as any[])];
    list[rowIndex] = { ...(list[rowIndex] ?? {}), [key]: key === "value" ? Number(raw) || 0 : raw };
    option = setByPath(option, "series.0.data", list);
  } else if (type === "radar") {
    const list = [...((value("series.0.data.0.value") ?? []) as any[])];
    const idx = Number(key.slice(1));
    list[idx] = Number(raw) || 0;
    option = setByPath(option, "series.0.data.0.value", list);
  } else if (type === "scatter") {
    const list = [...((value("series.0.data") ?? []) as any[][])];
    const point = [...(list[rowIndex] ?? [0, 0])];
    point[key === "x" ? 0 : 1] = Number(raw) || 0;
    list[rowIndex] = point;
    option = setByPath(option, "series.0.data", list);
  } else {
    if (key === "category") {
      const list = [...((value(categoriesPath.value) ?? []) as any[])];
      list[rowIndex] = raw;
      option = setByPath(option, categoriesPath.value, list);
    } else {
      const seriesIndex = Number(key.slice(1));
      const path = `series.${seriesIndex}.data`;
      const list = [...((value(path) ?? []) as any[])];
      list[rowIndex] = Number(raw) || 0;
      option = setByPath(option, path, list);
    }
  }

  store.replaceOption(props.chart.id, option, false);
}

function addRow(): void {
  const type = props.chart.type;
  let option = props.chart.option;
  const last = rows.value[rows.value.length - 1];

  if (type === "pie") {
    const list = [...((value("series.0.data") ?? []) as any[])];
    list.push({ name: `新增项 ${list.length + 1}`, value: 100 });
    option = setByPath(option, "series.0.data", list);
  } else if (type === "radar") {
    const list = [...((value("series.0.data.0.value") ?? []) as any[])];
    list.push(0);
    option = setByPath(option, "series.0.data.0.value", list);
  } else if (type === "scatter") {
    const list = [...((value("series.0.data") ?? []) as any[][])];
    list.push([0, 0]);
    option = setByPath(option, "series.0.data", list);
  } else {
    if (categoriesPath.value) {
      const categories = [...((value(categoriesPath.value) ?? []) as any[])];
      categories.push(`类目 ${categories.length + 1}`);
      option = setByPath(option, categoriesPath.value, categories);
    }
    const seriesCount = ((value("series") ?? []) as unknown[]).length || 1;
    for (let s = 0; s < Math.min(seriesCount, 2); s += 1) {
      const path = `series.${s}.data`;
      const list = [...((value(path) ?? []) as any[])];
      list.push(Number(last?.[`v${s}`]) || 0);
      option = setByPath(option, path, list);
    }
  }

  store.replaceOption(props.chart.id, option, true);
}

function removeRow(rowIndex: number): void {
  const type = props.chart.type;
  let option = props.chart.option;

  if (type === "pie") {
    const list = [...((value("series.0.data") ?? []) as any[])];
    list.splice(rowIndex, 1);
    option = setByPath(option, "series.0.data", list);
  } else if (type === "radar") {
    const list = [...((value("series.0.data.0.value") ?? []) as any[])];
    list.splice(rowIndex, 1);
    option = setByPath(option, "series.0.data.0.value", list);
  } else if (type === "scatter") {
    const list = [...((value("series.0.data") ?? []) as any[][])];
    list.splice(rowIndex, 1);
    option = setByPath(option, "series.0.data", list);
  } else {
    if (categoriesPath.value) {
      const categories = [...((value(categoriesPath.value) ?? []) as any[])];
      categories.splice(rowIndex, 1);
      option = setByPath(option, categoriesPath.value, categories);
    }
    const seriesCount = ((value("series") ?? []) as unknown[]).length || 1;
    for (let s = 0; s < Math.min(seriesCount, 2); s += 1) {
      const path = `series.${s}.data`;
      const list = [...((value(path) ?? []) as any[])];
      list.splice(rowIndex, 1);
      option = setByPath(option, path, list);
    }
  }

  store.replaceOption(props.chart.id, option, true);
}

function reset(): void {
  const fresh = createDefaultOption(props.chart.type);
  store.replaceOption(props.chart.id, fresh, true);
}
</script>

<style scoped>
.data-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1 1 auto;
}

.sheet-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.sheet-title {
  font-size: 11.5px;
  color: var(--cf-text-dim);
}

.sheet-hint {
  font-family: var(--cf-font-mono);
  font-size: 10px;
  color: var(--cf-text-faint);
}

.sheet {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-sm);
  overflow: hidden;
  max-height: 320px;
  overflow-y: auto;
}

.sheet-row {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--cf-border-soft);
}

.sheet-row:last-child {
  border-bottom: 0;
}

.sheet-header {
  position: sticky;
  top: 0;
  background: var(--cf-bg-3);
  z-index: 1;
}

.cell {
  flex: 1 1 0;
  min-width: 0;
  padding: 4px 6px;
  font-size: 11px;
  color: var(--cf-text-dim);
}

.head {
  font-size: 10px;
  color: var(--cf-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.input {
  width: 100%;
  border: 0;
  border-right: 1px solid var(--cf-border-soft);
  background: transparent;
  font-family: var(--cf-font-mono);
  outline: none;
}

.input:focus {
  background: var(--cf-bg-2);
  color: var(--cf-text);
}

.narrow {
  flex: 0 0 24px;
  display: grid;
  place-items: center;
}
.del {
  border: 0;
  background: transparent;
  color: var(--cf-text-faint);
  cursor: pointer;
}

.del:hover {
  color: var(--cf-danger);
  background: var(--cf-danger-soft);
}

.sheet-actions {
  display: flex;
  gap: 6px;
}

.soft-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: var(--cf-radius-sm);
  border: 1px solid var(--cf-border);
  background: var(--cf-bg-2);
  color: var(--cf-text-dim);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.soft-btn:hover {
  border-color: var(--cf-border-strong);
  color: var(--cf-text);
}

.tips {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--cf-text-faint);
}
</style>

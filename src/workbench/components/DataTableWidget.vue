<script setup lang="ts">
import type { ComponentRenderProps } from "@/core/components/types";
import { emitDataTableRowSelect, formatWidgetValue } from "@/core/components/dataWidgets";

type Column = { field: string; label: string; format: "text" | "number" | "percent"; width?: number; align?: "left" | "center" | "right" };
const props = withDefaults(defineProps<ComponentRenderProps & { columns: Column[]; rowKey?: string; striped?: boolean }>(), {
  columns: () => [], rowKey: "", striped: true,
});

function cell(row: Record<string, unknown>, column: Column): string {
  return formatWidgetValue(row[column.field], column.format);
}
function selectRow(row: Record<string, unknown>, index: number): void {
  emitDataTableRowSelect(props.emitEvent, row, index);
}
function rowKey(row: Record<string, unknown>, index: number): string | number {
  const value = props.rowKey ? row[props.rowKey] : undefined;
  return typeof value === "string" || typeof value === "number" ? value : index;
}
</script>

<template>
  <div class="data-table-widget" :class="{ 'data-table-widget--striped': striped }">
    <p v-if="snapshot.status === 'loading'" class="data-table-widget__status" role="status">正在加载数据…</p>
    <p v-else-if="snapshot.status === 'error'" class="data-table-widget__status data-table-widget__status--error" role="status">{{ snapshot.error || "数据加载失败" }}</p>
    <p v-if="snapshot.status === 'stale'" class="data-table-widget__status data-table-widget__status--stale" role="status">数据过期{{ snapshot.error ? `：${snapshot.error}` : "，显示最近一次成功数据" }}</p>
    <p v-if="snapshot.status === 'idle' && rows.length" class="data-table-widget__sample" role="status">示例数据 · 绑定数据集后自动替换</p>
    <p v-if="!rows.length && snapshot.status !== 'loading' && snapshot.status !== 'error'" class="data-table-widget__empty">暂无数据</p>
    <div v-if="rows.length && columns.length" class="data-table-widget__scroll">
      <table class="data-table-widget__table">
        <thead><tr><th v-for="column in columns" :key="column.field" :style="{ width: column.width ? `${column.width}px` : undefined, textAlign: column.align || 'left' }">{{ column.label }}</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="rowKey(row, index)" tabindex="0" @click="selectRow(row, index)" @keydown.enter.stop.prevent="selectRow(row, index)" @keydown.space.stop.prevent="selectRow(row, index)">
            <td v-for="column in columns" :key="column.field" :data-format="column.format" :style="{ width: column.width ? `${column.width}px` : undefined, textAlign: column.align || 'left' }">{{ cell(row, column) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="rows.length && !columns.length" class="data-table-widget__empty">请在组件配置中添加显示列</p>
  </div>
</template>

<style scoped>
.data-table-widget { display: flex; width: 100%; height: 100%; flex-direction: column; overflow: hidden; color: var(--cf-text, #e8edf7); font: 12px/1.45 system-ui, sans-serif; }
.data-table-widget__scroll { width: 100%; min-height: 0; flex: 1; overflow: auto; }
.data-table-widget__table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.data-table-widget__table th, .data-table-widget__table td { padding: 7px 9px; border-bottom: 1px solid var(--cf-border, #344054); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.data-table-widget__table th { position: sticky; top: 0; background: var(--cf-panel, #202a39); color: var(--cf-text, #f2f5fa); text-align: left; }
.data-table-widget__table tbody tr { cursor: pointer; outline: none; }
.data-table-widget__table tbody tr:hover, .data-table-widget__table tbody tr:focus-visible { background: color-mix(in srgb, var(--cf-primary, #6c8cff) 18%, transparent); }
.data-table-widget--striped tbody tr:nth-child(even) { background: color-mix(in srgb, var(--cf-panel, #202a39) 55%, transparent); }
.data-table-widget__status, .data-table-widget__empty, .data-table-widget__sample { margin: 0; padding: 8px; color: var(--cf-text-2, #9ca9bb); font-size: 11px; }
.data-table-widget__sample { padding-bottom: 2px; color: var(--cf-primary, #6c8cff); }
.data-table-widget__status--error, .data-table-widget__status--stale { color: #ffb45e; }
</style>

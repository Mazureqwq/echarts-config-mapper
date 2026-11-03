<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChartItem } from "@/core/model/types";
import { chartRegistry } from "@/core/chart/registry";
import { dataToMatrix, matrixToChartData } from "@/core/chart/chartData";
import { parseTsv } from "@/core/chart/tsv";
import { createChartAsset } from "@/core/model/schema";
import { useDocumentStore } from "@/stores/documentStore";

const props = defineProps<{ item: ChartItem }>();
const doc = useDocumentStore();

const tsvMode = ref(false);
const tsvText = ref("");
const notice = ref("");

const descriptor = computed(() => chartRegistry[props.item.spec.type]);
const matrix = computed<string[][]>(() => dataToMatrix(props.item.spec.data));

function applyMatrix(next: string[][]): void {
  if (next.length === 0) return;
  const data = matrixToChartData(next, props.item.spec.type);
  doc.updateChartData(props.item.id, data);
}

function onCell(r: number, c: number, ev: Event): void {
  const value = (ev.target as HTMLInputElement).value;
  const next = matrix.value.map((row) => [...row]);
  next[r][c] = value;
  applyMatrix(next);
}

function addRow(): void {
  const cols = matrix.value[0]?.length ?? 2;
  applyMatrix([...matrix.value.map((r) => [...r]), Array(cols).fill("0")]);
}

function delRow(): void {
  if (matrix.value.length <= 1) return;
  applyMatrix(matrix.value.slice(0, -1).map((r) => [...r]));
}

function addCol(): void {
  applyMatrix(matrix.value.map((row, i) => [...row, i === 0 ? `系列${row.length}` : "0"]));
}

function delCol(): void {
  if ((matrix.value[0]?.length ?? 0) <= 1) return;
  applyMatrix(matrix.value.map((row) => row.slice(0, -1)));
}

function openTsv(): void {
  tsvText.value = matrix.value.map((row) => row.join("\t")).join("\n");
  tsvMode.value = true;
}

function applyTsv(): void {
  try {
    const parsed = parseTsv(tsvText.value);
    if (parsed.length === 0) {
      notice.value = "TSV 内容为空";
      return;
    }
    applyMatrix(parsed);
    tsvMode.value = false;
    notice.value = "已应用 TSV 数据";
  } catch (e) {
    notice.value = `TSV 解析失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

function saveAsAsset(): void {
  const asset = createChartAsset(props.item.name || "未命名图表", JSON.parse(JSON.stringify(props.item.spec)));
  doc.upsertAsset(asset);
  notice.value = "已保存为图表资产";
}
</script>

<template>
  <div class="data-table">
    <div class="data-table__head">
      <span class="data-table__title">数据（{{ descriptor.dataKind === "category" ? "类目/系列" : descriptor.dataKind === "nameValue" ? "名称/数值" : descriptor.dataKind === "xy" ? "x/y" : "系列/指标" }}）</span>
      <button class="data-table__btn" @click="tsvMode ? (tsvMode = false) : openTsv()">{{ tsvMode ? "返回表格" : "粘贴 TSV" }}</button>
    </div>

    <template v-if="!tsvMode">
      <div class="data-table__scroll">
        <table>
          <tr v-for="(row, r) in matrix" :key="r">
            <td v-for="(cell, c) in row" :key="c">
              <input :value="cell" @change="onCell(r, c, $event)" />
            </td>
          </tr>
        </table>
      </div>
      <div class="data-table__ops">
        <button class="data-table__btn" @click="addRow">+ 行</button>
        <button class="data-table__btn" @click="delRow">- 行</button>
        <button class="data-table__btn" @click="addCol">+ 列</button>
        <button class="data-table__btn" @click="delCol">- 列</button>
      </div>
    </template>

    <template v-else>
      <textarea v-model="tsvText" class="data-table__tsv" rows="8" placeholder="从 Excel 复制后直接粘贴（制表符分隔）" />
      <div class="data-table__ops">
        <button class="data-table__btn data-table__btn--primary" @click="applyTsv">应用 TSV</button>
      </div>
    </template>

    <div class="data-table__ops">
      <button class="data-table__btn data-table__btn--primary" @click="saveAsAsset">保存为资产</button>
    </div>
    <div v-if="notice" class="data-table__notice">{{ notice }}</div>
  </div>
</template>

<style scoped>
.data-table__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.data-table__title {
  font-size: 12px;
  font-weight: 600;
}
.data-table__scroll {
  overflow: auto;
  max-height: 260px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
}
.data-table table {
  border-collapse: collapse;
  width: 100%;
}
.data-table td {
  border: 1px solid var(--cf-border);
  padding: 0;
}
.data-table td input {
  width: 80px;
  border: none;
  padding: 4px 6px;
  font-size: 12px;
  background: transparent;
  color: var(--cf-text);
}
.data-table__tsv {
  width: 100%;
  font-family: monospace;
  font-size: 12px;
  padding: 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
}
.data-table__ops {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.data-table__btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--cf-border);
  border-radius: 5px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.data-table__btn--primary {
  background: var(--cf-primary);
  border-color: var(--cf-primary);
  color: #fff;
}
.data-table__notice {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cf-primary);
}
</style>

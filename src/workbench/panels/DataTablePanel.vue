<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChartData, ChartItem } from "@/core/model/types";
import { chartRegistry } from "@/core/chart/registry";
import { dataToMatrix, matrixToChartData } from "@/core/chart/chartData";
import { parseTsv } from "@/core/chart/tsv";

const props = defineProps<{ item: ChartItem }>();
const emit = defineEmits<{ (e: "changeData", data: ChartData): void }>();

const tsvMode = ref(false);
const tsvText = ref("");
const notice = ref("");

const descriptor = computed(() => chartRegistry[props.item.spec.type]);
const matrix = computed<string[][]>(() => dataToMatrix(props.item.spec.data));

function applyMatrix(next: string[][]): void {
  if (next.length === 0) return;
  const data = matrixToChartData(next, props.item.spec.type);
  emit("changeData", data);
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

</script>

<template>
  <div class="data-table">
    <div class="data-table__head">
      <span class="data-table__title">数据（{{ descriptor.dataKind === "category" ? "类目/系列" : descriptor.dataKind === "nameValue" ? "名称/数值" : descriptor.dataKind === "xy" ? "x/y" : "系列/指标" }}）</span>
      <button class="cf-button cf-button--small data-table__btn" @click="tsvMode ? (tsvMode = false) : openTsv()">{{ tsvMode ? "返回表格" : "粘贴 TSV" }}</button>
    </div>

    <template v-if="!tsvMode">
      <div class="data-table__scroll">
        <table>
          <tr v-for="(row, r) in matrix" :key="r">
            <td v-for="(cell, c) in row" :key="c">
              <input :value="cell" @change="onCell(r, c, $event)" class="cf-control cf-control--cell" />
            </td>
          </tr>
        </table>
      </div>
      <div class="data-table__ops">
        <button class="cf-button cf-button--small data-table__btn" @click="addRow">+ 行</button>
        <button class="cf-button cf-button--small data-table__btn" @click="delRow">- 行</button>
        <button class="cf-button cf-button--small data-table__btn" @click="addCol">+ 列</button>
        <button class="cf-button cf-button--small data-table__btn" @click="delCol">- 列</button>
      </div>
    </template>

    <template v-else>
      <textarea v-model="tsvText" class="data-table__tsv cf-control cf-control--textarea" rows="8" placeholder="从 Excel 复制后直接粘贴（制表符分隔）" />
      <div class="data-table__ops">
        <button class="cf-button cf-button--small cf-button--primary data-table__btn" @click="applyTsv">应用 TSV</button>
      </div>
    </template>

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
  font-size: 12px;
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
.data-table__notice {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cf-primary);
}
</style>

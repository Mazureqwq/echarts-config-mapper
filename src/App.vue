<template>
  <div :style="{
    width: '100vw',
    height: '100vh'
  }">
    <Dashboard />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useCanvasStore } from "./stores/canvasStore";
import { ChartComponentType, CANVAS_DEFAULT_CONFIG } from "./constants/canvas";
import Dashboard from "./views/dashboard.vue";

const store = useCanvasStore();
const { screenWidth, screenHeight, selectedComponent } = storeToRefs(store);

const sizeLimit = {
  MIN_WIDTH: CANVAS_DEFAULT_CONFIG.COMPONENT_SIZE_LIMIT.MIN_WIDTH,
  MAX_WIDTH: CANVAS_DEFAULT_CONFIG.COMPONENT_SIZE_LIMIT.MAX_WIDTH,
  MIN_HEIGHT: CANVAS_DEFAULT_CONFIG.COMPONENT_SIZE_LIMIT.MIN_HEIGHT,
  MAX_HEIGHT: CANVAS_DEFAULT_CONFIG.COMPONENT_SIZE_LIMIT.MAX_HEIGHT,
};

// 通用添加图表方法（简化重复代码）
const addChart = (type: ChartComponentType) => {
  const title = {
    [ChartComponentType.LineChart]: "折线图",
    [ChartComponentType.BarChart]: "柱状图",
    [ChartComponentType.PieChart]: "饼图",
  }[type];
  store.addComponent({ type, title });
};
</script>

<style scoped lang="less">
.screen-editor {
  display: flex;
  height: 100vh;
  background: #0b1220;
  overflow: hidden;
}

.left-toolbar {
  width: 180px;
  background: #141b29;
  padding: 20px;
  color: #fff;

  .toolbar-item {
    padding: 10px;
    background: #1d2a42;
    margin-bottom: 10px;
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    transition: background 0.2s;

    &:hover {
      background: #2c3a55;
    }

    &.danger {
      background: #dc2626;

      &:hover {
        background: #b91c1c;
      }
    }
  }
}

.canvas-container {
  flex: 1;
  background: #0b1220;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
}

.chart-grid-item {
  background: #0f172a;
  border: 1px solid #2c3a55;
  border-radius: 4px;
  overflow: hidden;

  .chart-header {
    padding: 8px 12px;
    background: #141b29;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2c3a55;

    .chart-title {
      color: #fff;
      font-size: 14px;
    }

    .delete-btn {
      background: transparent;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition:
        background 0.2s,
        color 0.2s;

      &:hover {
        background: #dc2626;
        color: #fff;
      }
    }
  }

  .chart-item {
    width: 100%;
    height: calc(100% - 40px);
  }
}

.right-panel {
  width: 300px;
  background: #141b29;
  padding: 20px;
  color: #fff;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
      margin: 0;
      color: #fff;
    }

    .delete-selected-btn {
      background: #dc2626;
      color: #fff;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #b91c1c;
      }
    }
  }

  :deep(.el-form-item__label) {
    color: #fff;
  }

  :deep(.el-input),
  :deep(.el-input-number) {
    --el-input-bg-color: #1d2a42;
    --el-input-text-color: #fff;
    --el-input-border-color: #2c3a55;
  }
}
</style>

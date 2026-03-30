<template>
  <div class="body-wrap">
    <div class="left-mini">
      <div
        v-for="(item, idx) in miniTools"
        :key="idx"
        class="item"
        @click="onEnd(idx)">
        <img :src="item.img" />
        <p>{{ item.name }}</p>
      </div>
    </div>
    <div class="center-container">
      <div style="position: absolute; top: 10px; right: 10px">
        <ElButton size="small" type="primary" @click="copyOption"
          >复制配置</ElButton
        >
      </div>
      <div class="config">
        <span
          >宽:
          <ElInputNumber
            v-model="width"
            controls-position="right"
            size="small"
            :min="1"
            :max="1200"
            :style="{
              width: '80px',
            }"
            placeholder="请输入索引" />
        </span>
        <span>
          高:
          <ElInputNumber
            v-model="height"
            controls-position="right"
            size="small"
            :min="1"
            :max="1200"
            :style="{
              width: '80px',
            }"
            placeholder="请输入索引" />
        </span>
      </div>
      <div
        class="wrapper"
        :style="{
          width: width + 'px',
          height: height + 'px',
        }">
        <DragItem
          v-for="(item, idx) in options"
          :key="item.id"
          :options="item"
          :idx="idx"
          @set-option="setOption" />
      </div>
    </div>
    <div class="rg-option">
      <ConfigUi
        v-if="options.length > 0"
        :cur-option="options[0]"
        :index="index" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, provide } from "vue";
import DragItem from "@/components/firm/drag-item.vue";
import ConfigUi from "@/components/firm/config-ui";
import config from "@/setting/config";
import emitter from "@/utils/eventBus";
import { ElButton, ElInputNumber, ElMessage } from "element-plus";
import { useClipboard } from "@vueuse/core";

// 类型定义
interface MiniTool {
  name: string;
  value: string;
  img: string;
  [key: string]: any;
}

interface ChartOption {
  type: string;
  id: number;
  x: number;
  y: number;
  isActive: boolean;
  echartOption?: any;
  [key: string]: any;
}

const { copy } = useClipboard();
const copyOption = () => {
  const option = options.value[0]?.echartOption.echartOption;
  console.log(option);
  copy(JSON.stringify(option));
  ElMessage.success("复制成功");
};

// 数据
const miniTools = ref<MiniTool[]>(config.types);
const index = ref<number>(0);
const options = ref<ChartOption[]>([
  // {
  //   type: "bar",
  //   id: 10001,
  //   x: 180,
  //   y: 300,
  //   isActive: false,
  //   echartOption: undefined,
  // },
]);
const width = ref<number>(800);
const height = ref<number>(600);
provide("sizeOptions", { width, height });
// 监听事件总线
onMounted(() => {
  // 设置配置项
  emitter.on("setOptionItem", (data: { option: any; idx: number }) => {
    const { option, idx } = data;
    if (options.value[idx]) {
      options.value[idx].echartOption = option;
    }
    options.value.forEach((item, i) => {
      item.isActive = i === idx;
    });
    index.value = idx;
  });

  // 删除项
  emitter.on("delItem", () => {
    options.value.splice(index.value, 1);
  });
});

// 子组件更新配置
const setOption = (item: ChartOption, idx: number) => {
  options.value[idx] = item;
  index.value = idx;
};
const echartModules = import.meta.glob("../option/**/**-base-option.ts");
const echartOption = async (type) => {
  const path = `../option/${type}/${type}-base-option.ts`;
  const loader = echartModules[path];
  const module = await loader();
  return module?.default || {};
};
// 拖拽结束 → 添加图表
const onEnd = async (idx: any) => {
  const tool = miniTools.value[idx];
  options.value = [
    {
      type: tool.value,
      x: tool.x,
      y: tool.y,
      id: Math.random(),
      echartOption: await echartOption(tool.value),
      isActive: true,
    },
  ];
};
</script>

<style lang="less">
div.item.sortable-chosen.sortable-ghost {
  cursor: pointer;
  -webkit-user-drag: element;
  user-select: element !important;
}

.rg-option {
  // position: absolute;
  // right: 0;
  width: 300px;
  background: rgba(0, 0, 0, 0.2);
  height: 100%;
  overflow: auto;

  // &:hover {
  //   right: 0;
  // }
}

html,
body,
.body-wrap {
  padding: 0;
  margin: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
}
.left-mini {
  width: 140px;
  // position: absolute;
  // left: 0;
  // top: 0;
  padding-top: 40px;
  height: 100%;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
  // &:hover {
  //   left: 0;
  //   cursor: pointer;
  // }

  > .ghost {
    background: red;
  }

  .item {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
}

.center-container {
  background-color: #fff;
  flex: 1;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  .config {
    display: flex;
    flex-direction: row;
    gap: 20px;
    margin-bottom: 10px;
  }

  .wrapper {
    width: 800px;
    height: 600px;
    border: 1px solid #cccccc46;
    box-shadow: 0 0 5px 2px rgba(0, 0, 0, 0.1);
  }
}

.nonmal {
  height: auto;
}

.close {
  overflow: hidden;
  height: 20px;
}
</style>

<script setup lang="ts">
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: "画布与选择",
    rows: [
      ["拖入落位", "左面板「图表类型/素材」拖到画布；「图表库」拖入生成图表副本"],
      ["选择", "单击 / 框选 / Shift 加选 / Esc 取消"],
      ["快速查找", "Ctrl+F：按名称、类型或 ID 定位画布元素"],
      ["移动", "拖动；网格吸附开启时方向键按网格间距移动（Shift+方向键 1px）；关闭时方向键 1px / Shift 10px"],
      ["缩放旋转", "8 向手柄（Shift 等比）；旋转手柄（Shift 吸附 15°）"],
      ["吸附", "元素/画布 边缘与中线自动对齐，红参考线提示"],
      ["画布缩放", "滚轮（以光标为锚点）；Ctrl+0 适应窗口 / Ctrl+1 100% / Ctrl+± 逐档"],
      ["平移画布", "空格+拖拽 或 鼠标中键拖拽"],
    ],
  },
  {
    title: "编辑命令",
    rows: [
      ["复制 / 粘贴", "Ctrl+C / Ctrl+V"],
      ["原位复制", "Ctrl+D"],
      ["删除", "Delete / Backspace"],
      ["组合 / 解组", "Ctrl+G / Ctrl+Shift+G"],
      ["撤销 / 重做", "Ctrl+Z / Ctrl+Y（或 Ctrl+Shift+Z）"],
      ["图层顺序", "图层面板：拖拽排序、置顶/置底/上移/下移"],
    ],
  },
  {
    title: "图表与大屏",
    rows: [
      ["聚焦编辑", "双击图表进入配置+数据编辑，Esc 返回"],
      ["数据表格", "增删行列；粘贴 TSV（Excel 直贴）"],
      ["图表资产", "图表库（/charts）新建并编辑；「图表库」tab 拖入大屏 = 独立副本；检查器可「另存为图表资产」"],
      ["图表类型", "检查器「类型」下拉切换（会重置参数与数据，位置尺寸不变）"],
      ["演示模式", "顶栏「演示」，Esc 退出"],
      ["轮播演示", "大屏库「轮播演示」选多块大屏 + 间隔；演示中 ← / → 切屏，空格暂停，Esc 返回"],
      ["帮助", "按 ? 打开/关闭本浮层"],
    ],
  },
];
</script>

<template>
  <div v-if="ui.helpVisible" class="shortcuts-help" @click.self="ui.setHelpVisible(false)">
    <div class="shortcuts-help__box">
      <div class="shortcuts-help__head">
        <span>快捷键与操作</span>
        <button @click="ui.setHelpVisible(false)">✕</button>
      </div>
      <div v-for="g in GROUPS" :key="g.title" class="shortcuts-help__group">
        <div class="shortcuts-help__group-title">{{ g.title }}</div>
        <div v-for="row in g.rows" :key="row[0]" class="shortcuts-help__row">
          <span class="shortcuts-help__key">{{ row[0] }}</span>
          <span class="shortcuts-help__desc">{{ row[1] }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcuts-help {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.shortcuts-help__box {
  width: 520px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--cf-panel);
  border-radius: 12px;
  padding: 20px 24px;
}
.shortcuts-help__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
}
.shortcuts-help__head button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--cf-text-2);
  font-size: 15px;
}
.shortcuts-help__group {
  margin-bottom: 16px;
}
.shortcuts-help__group-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--cf-primary);
}
.shortcuts-help__row {
  display: flex;
  gap: 14px;
  padding: 4px 0;
  font-size: 12px;
}
.shortcuts-help__key {
  width: 130px;
  flex-shrink: 0;
  font-weight: 600;
}
.shortcuts-help__desc {
  color: var(--cf-text-2);
}
</style>

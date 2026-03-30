import { defineStore } from "pinia";
import type {
  CanvasState,
  CanvasComponent,
  AddComponentParams,
} from "@/types/canvas";
import {
  CANVAS_DEFAULT_CONFIG,
  CHART_DEFAULT_CONFIG,
} from "@/constants/canvas";

export const useCanvasStore = defineStore("canvas", {
  state: (): CanvasState => ({
    components: [],
    selectedComponent: null,
    screenWidth: CANVAS_DEFAULT_CONFIG.SCREEN_WIDTH,
    screenHeight: CANVAS_DEFAULT_CONFIG.SCREEN_HEIGHT,
    proportion:
      CANVAS_DEFAULT_CONFIG.SCREEN_WIDTH / CANVAS_DEFAULT_CONFIG.SCREEN_HEIGHT,
  }),

  actions: {
    /**
     * 添加画布组件
     * @param comp 组件基础信息
     */
    addComponent(comp: AddComponentParams) {
      try {
        const newComp: CanvasComponent = {
          id: Date.now(),
          type: comp.type,
          x: CANVAS_DEFAULT_CONFIG.COMPONENT_DEFAULT_POSITION.x,
          y: CANVAS_DEFAULT_CONFIG.COMPONENT_DEFAULT_POSITION.y,
          w: CANVAS_DEFAULT_CONFIG.COMPONENT_DEFAULT_SIZE.w,
          h: CANVAS_DEFAULT_CONFIG.COMPONENT_DEFAULT_SIZE.h,
          i: String(Date.now()),
          title: comp.title,
          option: comp.option || CHART_DEFAULT_CONFIG[comp.type],
        };
        this.components.push(newComp);
        // 自动选中新增组件
        this.selectComponent(newComp.id);
      } catch (error) {
        console.error("添加组件失败:", error);
      }
    },

    /**
     * 更新组件属性
     * @param id 组件ID
     * @param partialComp 要更新的属性
     */
    updateComponent(id: number, partialComp: Partial<CanvasComponent>) {
      try {
        const index = this.components.findIndex((item) => item.id === id);
        if (index === -1) {
          console.warn(`未找到ID为${id}的组件`);
          return;
        }
        this.components[index] = { ...this.components[index], ...partialComp };
      } catch (error) {
        console.error("更新组件失败:", error);
      }
    },

    /**
     * 选中组件
     * @param id 组件ID
     */
    selectComponent(id: number) {
      // 避免重复选中相同组件导致不必要的渲染
      if (this.selectedComponent?.id === id) return;

      const targetComp = this.components.find((item) => item.id === id);
      this.selectedComponent = targetComp || null;
    },

    /**
     * 删除选中的组件
     */
    deleteSelectedComponent() {
      if (!this.selectedComponent) return;

      this.components = this.components.filter(
        (item) => item.id !== this.selectedComponent!.id,
      );
      this.selectedComponent = null;
    },

    /**
     * 清空所有组件
     */
    clearAllComponents() {
      this.components = [];
      this.selectedComponent = null;
    },
  },
});

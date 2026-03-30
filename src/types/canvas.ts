import { ChartComponentType } from "../constants/canvas";

// 图表组件类型（关联枚举，增强类型安全）
export type ChartType = `${ChartComponentType}`;

// 画布组件项
export interface CanvasComponent {
  id: number;
  type: ChartType;
  x: number;
  y: number;
  w: number;
  h: number;
  i: string;
  title: string;
  option?: Record<string, any>;
}

// 画布状态
export interface CanvasState {
  components: CanvasComponent[];
  selectedComponent: CanvasComponent | null;
  screenWidth: number;
  screenHeight: number;
  proportion: number;
}

// 添加组件入参类型
export interface AddComponentParams {
  type: ChartType;
  title: string;
  option?: Record<string, any>;
}

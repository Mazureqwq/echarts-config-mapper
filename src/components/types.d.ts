export interface ShadowStyle {
  color: string;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: ShadowBlur;
  opacity: number;
}

export interface ConfigValue {
  [key: string]: any;
}

export interface ShadowBlur {
  shadowColor: string;
  shadowBlur: number;
}

export interface TickConfig {
  show: boolean;
  alignWithLabel: boolean;
  interval: number;
  inside: boolean;
  length: number;
  lineStyle: LineStyle;
}
export interface ShadowBlur {
  shadowColor: string;
  shadowBlur: number;
}

export interface LineStyle {
  color?: string;
  width?: number;
  type?: "solid" | "dashed" | "dotted" | string;
  shadowColor?: string;
  shadowBlur?: ShadowBlur;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}
export interface ShadowBlur {
  shadowColor: string;
  shadowBlur: number;
}
export interface ShadowBlur {
  shadowColor: string;
  shadowBlur: number;
}

export interface AreaStyle {
  color: string;
  shadowBlur: ShadowBlur;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  opacity: number;
}

export interface SplitArea {
  interval: number;
  show: boolean;
  areaStyle: AreaStyle;
}
export interface TextStyle {
  color: string;
  fontSize: number;
  fontFamily: string;
  textBorderWidth: number;
  textBorderColor: string;
  textShadowColor: string;
  textShadowBlur: number;
  textShadowOffsetX: number;
  textShadowOffsetY: number;
}

export interface OptionItem {
  label: string;
  value: string;
}

export interface LineStyleType {
  color: string;
  width: number;
  type: string;
  shadowColor: string;
  shadowBlur: {
    shadowColor: string;
    shadowBlur: number;
  };
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface AxisLine {
  show: boolean;
  onZero: boolean;
  symbol: "none" | "arrow" | string;
  symbolSize: number[];
  symbolOffset: number;
  lineStyle: LineStyleType;
}

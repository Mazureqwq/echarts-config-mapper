import { use, registerMap } from "echarts/core";
import {
  LineChart,
  BarChart,
  PieChart,
  MapChart,
  ScatterChart,
  RadarChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import chinaGeo from "../../assets/geo/china.json";

let registered = false;

export function registerCharts(): void {
  if (registered) return;
  use([
    LineChart,
    BarChart,
    PieChart,
    MapChart,
    ScatterChart,
    RadarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    VisualMapComponent,
    CanvasRenderer,
  ]);
  registerMap("china", chinaGeo as never);
  registered = true;
}

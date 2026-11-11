import { use, registerMap } from "echarts/core";
import {
  LineChart,
  BarChart,
  PieChart,
  MapChart,
  ScatterChart,
  HeatmapChart,
  LinesChart,
  RadarChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  GeoComponent,
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
    HeatmapChart,
    LinesChart,
    RadarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    VisualMapComponent,
    GeoComponent,
    CanvasRenderer,
  ]);
  registerMap("china", chinaGeo as never);
  registered = true;
}

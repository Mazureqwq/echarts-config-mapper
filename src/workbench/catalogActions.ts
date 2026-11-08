import { DESIGN_DND_MIME } from "@/shared/dnd";
import type { ComponentCatalogEntry } from "@/core/components/types";
import type { ChartType } from "@/core/model/types";

export type CatalogActions = {
  addChart(type: ChartType): void;
  addComponent(id: string, version: number): void;
  addBasic(kind: "text" | "image" | "shape"): void;
};

const ITEM_DND_MIME = "application/x-chartforge-item";

export function insertCatalogEntry(entry: ComponentCatalogEntry, actions: CatalogActions): void {
  switch (entry.source) {
    case "chart":
      actions.addChart(entry.chartType);
      return;
    case "component":
      actions.addComponent(entry.componentId, entry.componentVersion);
      return;
    case "basic":
      actions.addBasic(entry.itemKind);
      return;
  }
}

export function catalogDragPayload(entry: ComponentCatalogEntry): { mime: string; data: string } {
  if (entry.source === "component") {
    return {
      mime: DESIGN_DND_MIME,
      data: JSON.stringify({ kind: "component", id: entry.componentId, version: entry.componentVersion }),
    };
  }

  const payload = entry.source === "chart"
    ? { kind: "chart", chartType: entry.chartType }
    : { kind: entry.itemKind };
  return { mime: ITEM_DND_MIME, data: JSON.stringify(payload) };
}

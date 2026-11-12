import { defineStore } from "pinia";
import { useDocumentStore } from "./documentStore";

export type AppView = "screens" | "workbench" | "play";
export const GRID_SIZE_OPTIONS = [8, 16, 24, 32] as const;
export type GridSize = (typeof GRID_SIZE_OPTIONS)[number];

export const useUiStore = defineStore("ui", {
  state: () => ({
    view: "screens" as AppView,
    zoom: 100,
    pan: { x: 0, y: 0 },
    previewing: false,
    aligning: true,
    snapEnabled: true,
    gridEnabled: false,
    gridSnapEnabled: false,
    gridSize: 24 as GridSize,
    helpVisible: false,
    searchVisible: false,
    blueprintOpen: false,
    editingId: null as string | null,
  }),
  getters: {
    selection: () => useDocumentStore().selectedIds,
  },
  actions: {
    setZoom(z: number) {
      this.zoom = Math.min(400, Math.max(25, Math.round(z)));
    },
    zoomIn() {
      this.setZoom(this.zoom + 10);
    },
    zoomOut() {
      this.setZoom(this.zoom - 10);
    },
    setPreviewing(v: boolean) {
      this.previewing = v;
    },
    setEditing(id: string | null) {
      this.editingId = id;
    },
    setSnapEnabled(v: boolean) {
      this.snapEnabled = v;
    },
    setGridEnabled(v: boolean) {
      this.gridEnabled = v;
    },
    setGridSnapEnabled(v: boolean) {
      this.gridSnapEnabled = v;
    },
    setGridSize(size: number) {
      if (GRID_SIZE_OPTIONS.some((option) => option === size)) this.gridSize = size as GridSize;
    },
    setHelpVisible(v: boolean) {
      this.helpVisible = v;
    },
    setSearchVisible(v: boolean) {
      this.searchVisible = v;
    },
    setBlueprintOpen(v: boolean) {
      this.blueprintOpen = v;
    },
    setView(view: AppView) {
      this.view = view;
    },
    setPan(pan: { x: number; y: number }) {
      this.pan = pan;
    },
  },
});

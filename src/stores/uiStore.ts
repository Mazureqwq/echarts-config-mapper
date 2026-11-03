import { defineStore } from "pinia";
import { useDocumentStore } from "./documentStore";

export type AppView = "screens" | "workbench" | "play";

export const useUiStore = defineStore("ui", {
  state: () => ({
    view: "screens" as AppView,
    zoom: 100,
    pan: { x: 0, y: 0 },
    previewing: false,
    aligning: true,
    snapEnabled: true,
    helpVisible: false,
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
    setHelpVisible(v: boolean) {
      this.helpVisible = v;
    },
    setView(view: AppView) {
      this.view = view;
    },
    setPan(pan: { x: number; y: number }) {
      this.pan = pan;
    },
  },
});

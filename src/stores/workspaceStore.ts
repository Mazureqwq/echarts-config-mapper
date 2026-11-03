import { defineStore } from "pinia";
import { createWorkspace } from "@/core/model/schema";
import type { Workspace } from "@/core/model/types";
import {
  loadWorkspace,
  saveWorkspace,
  exportJson,
  importJson,
} from "@/core/storage/workspaceRepo";

export const SAVE_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    workspace: createWorkspace() as Workspace,
    loaded: false,
    saveState: "idle" as "idle" | "saved" | "error",
  }),
  getters: {
    screens: (s) => s.workspace.screens,
    assets: (s) => s.workspace.assets,
    settings: (s) => s.workspace.settings,
  },
  actions: {
    load() {
      this.workspace = loadWorkspace();
      this.loaded = true;
      this.saveState = "idle";
    },
    save() {
      try {
        saveWorkspace(this.workspace);
        this.saveState = "saved";
      } catch (e) {
        this.saveState = "error";
        throw e;
      }
    },
    scheduleSave() {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(() => {
        saveTimer = null;
        this.save();
      }, SAVE_DEBOUNCE_MS);
    },
    exportAll(): string {
      return exportJson(this.workspace);
    },
    importFrom(text: string, mode: "merge" | "replace") {
      this.workspace = importJson(text, mode);
      this.loaded = true;
      this.saveState = "saved";
    },
  },
});

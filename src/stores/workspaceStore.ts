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
        try {
          this.save();
        } catch {
          /* saveState 已置 error，顶栏提示并可重试 */
        }
      }, SAVE_DEBOUNCE_MS);
    },
    duplicateScreen(id: string) {
      const src = this.workspace.screens.find((s) => s.id === id);
      if (!src) return;
      const clone = JSON.parse(JSON.stringify(src)) as (typeof this.workspace.screens)[number];
      clone.id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `id-${Date.now().toString(36)}`;
      clone.name = `${src.name} 副本`;
      clone.items.forEach((it) => {
        it.id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      });
      this.workspace.screens.push(clone);
      this.save();
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

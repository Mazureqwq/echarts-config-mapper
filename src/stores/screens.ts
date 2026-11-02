import { defineStore } from "pinia";
import type { ScreenSchema } from "@/core/types";
import { createScreenSchema } from "@/core/item";
import { deepClone } from "@/utils/object";
import { slugifyName } from "@/utils/slug";

/** 从仓库内大屏目录加载 schema（构建期打包，按 updatedAt 降序） */
function loadScreens(): ScreenSchema[] {
  const modules = import.meta.glob<ScreenSchema>("../assets/screens/*.screen.json", { eager: true });
  return Object.values(modules)
    .filter((schema): schema is ScreenSchema => Boolean(schema) && typeof schema.id === "string")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function screenPath(id: string): string {
  return "src/assets/screens/" + id + ".screen.json";
}

async function postSave(schema: ScreenSchema): Promise<void> {
  const response = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: screenPath(schema.id), content: JSON.stringify(schema, null, 2) }),
  });
  if (!response.ok) throw new Error("保存大屏失败");
}

export const useScreensStore = defineStore("screens", {
  state: () => ({
    screens: loadScreens(),
  }),

  getters: {
    byId(state) {
      return (id: string): ScreenSchema | undefined =>
        state.screens.find((schema) => schema.id === id);
    },
  },

  actions: {
    async create(name: string): Promise<ScreenSchema> {
      const id = slugifyName(name, "screen") + "-" + Date.now().toString(36);
      const schema = createScreenSchema(id, name);
      await postSave(schema);
      this.screens.unshift(schema);
      return schema;
    },

    async save(schema: ScreenSchema): Promise<void> {
      schema.updatedAt = new Date().toISOString();
      await postSave(schema);
      const index = this.screens.findIndex((item) => item.id === schema.id);
      if (index >= 0) {
        this.screens.splice(index, 1, schema);
      } else {
        this.screens.unshift(schema);
      }
    },

    async copy(id: string): Promise<ScreenSchema> {
      const source = this.byId(id);
      if (!source) throw new Error("大屏不存在");
      const copy = deepClone(source);
      copy.name = source.name + " 副本";
      copy.id = slugifyName(copy.name, "screen") + "-" + Date.now().toString(36);
      copy.updatedAt = new Date().toISOString();
      await postSave(copy);
      this.screens.unshift(copy);
      return copy;
    },

    async remove(id: string): Promise<void> {
      const response = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: screenPath(id) }),
      });
      if (!response.ok) throw new Error("删除大屏失败");
      this.screens = this.screens.filter((schema) => schema.id !== id);
    },
  },
});

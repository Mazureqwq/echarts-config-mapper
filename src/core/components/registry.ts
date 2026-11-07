import type { ComponentDefinition, ComponentRegistry } from "./types";

class ImmutableComponentRegistry implements ComponentRegistry {
  private readonly definitions: readonly ComponentDefinition[];
  private readonly byVersion = new Map<string, ComponentDefinition>();

  constructor(definitions: readonly ComponentDefinition[]) {
    const copy: ComponentDefinition[] = [];
    for (const definition of definitions) {
      if (!definition.id.trim()) throw new Error("组件 ID 不能为空");
      if (!Number.isInteger(definition.version) || definition.version < 1) {
        throw new Error(`组件版本必须是正整数：${definition.id}@${definition.version}`);
      }
      const key = `${definition.id}@${definition.version}`;
      if (this.byVersion.has(key)) throw new Error(`重复组件定义：${key}`);
      const stored = Object.freeze({ ...definition });
      this.byVersion.set(key, stored);
      copy.push(stored);
    }
    this.definitions = Object.freeze(copy);
  }

  get(id: string, version: number): ComponentDefinition | undefined {
    return this.byVersion.get(`${id}@${version}`);
  }

  list(): readonly ComponentDefinition[] {
    return this.definitions;
  }
}

export function createComponentRegistry(
  definitions: readonly ComponentDefinition[]
): ComponentRegistry {
  return new ImmutableComponentRegistry(definitions);
}

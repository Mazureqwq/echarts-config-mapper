/** 按点分路径写入 option 覆盖层（数字段自动建数组） */
export function setPath(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let node: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const cur = node[k];
    if (cur === null || cur === undefined || typeof cur !== "object") {
      node[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

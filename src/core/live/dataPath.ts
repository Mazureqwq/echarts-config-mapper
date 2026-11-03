export function resolveDataPath(data: unknown, path?: string): unknown {
  if (path === undefined || path === "") return data;
  let current: unknown = data;
  for (const key of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** 按路径读写嵌套对象（"series.0.lineStyle.width" 或 ["series", 0, "lineStyle"]） */
export type PathInput = string | Array<string | number>;

const PATH_RE = /[^.[\]]+/g;

export function toPath(path: PathInput): Array<string | number> {
  if (Array.isArray(path)) return path;
  return (path.match(PATH_RE) ?? []).map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

export function getByPath(source: unknown, path: PathInput, fallback?: unknown): any {
  const segs = toPath(path);
  let cursor: any = source;
  for (const seg of segs) {
    if (cursor === null || cursor === undefined) return fallback;
    cursor = cursor[seg as any];
  }
  return cursor === undefined ? fallback : cursor;
}

export function hasPath(source: unknown, path: PathInput): boolean {
  const segs = toPath(path);
  let cursor: any = source;
  for (const seg of segs) {
    if (cursor === null || typeof cursor !== "object" || !(seg in cursor)) return false;
    cursor = cursor[seg as any];
  }
  return true;
}

/** 不可变写入：返回新对象，未变化的层级共享引用 */
export function setByPath<T>(source: T, path: PathInput, value: unknown): T {
  const segs = toPath(path);
  if (segs.length === 0) return value as T;

  const root: any = Array.isArray(source) ? [...(source as any)] : { ...((source ?? {}) as any) };
  let cursor = root;

  const cloneNode = (node: any, nextSeg: string | number): any => {
    if (Array.isArray(node)) return [...node];
    if (node && typeof node === "object") return { ...node };
    return typeof nextSeg === "number" ? [] : {};
  };

  for (let i = 0; i < segs.length - 1; i += 1) {
    const key = segs[i] as any;
    cursor[key] = cloneNode(cursor[key], segs[i + 1]);
    cursor = cursor[key];
  }

  cursor[segs[segs.length - 1] as any] = value;
  return root as T;
}

/** 删除某个键（不可变） */
export function unsetByPath<T>(source: T, path: PathInput): T {
  const segs = toPath(path);
  if (segs.length === 0) return source;
  const parent = segs.length === 1 ? source : getByPath(source, segs.slice(0, -1));
  if (!parent || typeof parent !== "object") return source;
  const last = segs[segs.length - 1] as any;
  if (!(last in (parent as any))) return source;

  const clone = (node: any): any => {
    if (Array.isArray(node)) return [...node];
    if (node && typeof node === "object") return { ...node };
    return node;
  };

  const root = clone(source);
  let cursor = root;
  for (let i = 0; i < segs.length - 1; i += 1) {
    cursor[segs[i] as any] = clone(cursor[segs[i] as any]);
    cursor = cursor[segs[i] as any];
  }
  if (Array.isArray(cursor)) cursor.splice(last, 1);
  else delete cursor[last];
  return root as T;
}

/** 深拷贝（结构化克隆，兼容 Proxy 之外的普通数据） */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

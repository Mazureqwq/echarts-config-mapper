/**
 * 取数路径解析：
 *   a.b.c          逐层取值
 *   rows[0].value  数组下标（等价于 rows.0.value）
 *   rows[*].value  通配：把每项的该字段投影成扁平数组（缺失项自动跳过）
 * 任一层取不到时返回 undefined，由调用方转成人话错误。
 */

function tokenize(path: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === ".") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      continue;
    }
    if (ch === "[") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      const end = path.indexOf("]", i);
      if (end === -1) {
        // 语法不完整：把剩余部分整体当作一个键，取不到就是 undefined
        tokens.push(path.slice(i));
        return tokens;
      }
      tokens.push(path.slice(i + 1, end).trim());
      i = end;
      continue;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function walk(current: unknown, tokens: string[]): unknown {
  if (current === null || current === undefined) return undefined;
  if (!tokens.length) return current;

  const [head, ...rest] = tokens;

  if (head === "*") {
    if (!Array.isArray(current)) return undefined;
    const out: unknown[] = [];
    for (const item of current) {
      const value = walk(item, rest);
      if (value !== undefined) out.push(value);
    }
    return out;
  }

  if (typeof current !== "object") return undefined;
  const next = Array.isArray(current)
    ? /^\d+$/.test(head)
      ? current[Number(head)]
      : undefined
    : (current as Record<string, unknown>)[head];
  return walk(next, rest);
}

export function resolveDataPath(data: unknown, path?: string): unknown {
  if (path === undefined || path === "") return data;
  return walk(data, tokenize(path));
}

import { ImportError } from "./errors";
import { normalizeWorkspace } from "./schema";
import type { Workspace } from "./types";

export function migrate(raw: unknown): Workspace {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ImportError("不是有效的工作区 JSON");
  }
  const version = (raw as { version?: unknown }).version;
  if (version !== 1 && version !== 2) {
    throw new ImportError(`不支持的工作区版本：${String(version)}`);
  }
  return normalizeWorkspace(raw);
}

/** 保存白名单目录（dev 中间件与测试共用的纯函数，无 node 依赖） */
export const ALLOWED_DIRS = ["src/assets/library/", "src/assets/screens/"] as const;

/**
 * 校验相对保存路径：
 * 反斜杠归一为 /；拒绝绝对路径与 ".." 段；
 * 必须以 ALLOWED_DIRS 之一开头且以 .json 结尾；文件名段非空。
 */
export function isAllowedSavePath(relPath: string): boolean {
  const norm = relPath.replaceAll("\\", "/");
  if (norm.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(norm)) return false;
  const segs = norm.split("/");
  if (segs.some((seg) => seg === "" || seg === "..")) return false;
  if (!norm.endsWith(".json")) return false;
  return (ALLOWED_DIRS as readonly string[]).some((dir) => norm.startsWith(dir));
}

const ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/g;

/** 名称转文件名安全的 slug：空白转连字符、剔除路径非法字符、截断 40 字符；空结果返回 fallback */
export function slugifyName(name: string, fallback = "chart"): string {
  const slug = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(ILLEGAL_PATH_CHARS, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : fallback;
}

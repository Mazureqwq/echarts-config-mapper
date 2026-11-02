/** 时间格式化：支持 YYYY MM DD HH mm ss，不足两位补零；fmt 缺省 "YYYY-MM-DD HH:mm:ss" */
export function formatDateTime(date: Date, fmt: string = "YYYY-MM-DD HH:mm:ss"): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const map: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token] ?? token);
}

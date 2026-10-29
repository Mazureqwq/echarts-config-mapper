/** 图表实例注册表：用于导出 PNG / 编程式交互 */
const instances = new Map<string, any>();

export function registerChart(id: string, instance: any): void {
  instances.set(id, instance);
}

export function unregisterChart(id: string): void {
  instances.delete(id);
}

export function getChart(id: string): any {
  return instances.get(id);
}

export function clearCharts(): void {
  instances.clear();
}

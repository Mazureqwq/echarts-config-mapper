import type { EChartsOptionLike } from "../types/chart";
import { setByPath } from "../utils/object";

/** 按 "a.0.b" 逐段取值；任一段缺失返回 undefined */
export function pickByPath(obj: unknown, path: string): unknown {
  const segs = path.split(".").filter((seg) => seg.length > 0);
  let cursor: unknown = obj;
  for (const seg of segs) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

export interface Poller {
  start(): void;
  stop(): void;
}

/**
 * API 数据源轮询执行器：start 立即执行一次 fetcher，成功则回调 onOk；
 * intervalSec>0 时按周期执行；任何异常吞掉（不打断轮询、不调用 onOk）；
 * stop 清理定时器；重复 start 前自动 stop。
 */
export function createPoller(
  fetcher: () => Promise<unknown>,
  onOk: (data: unknown) => void,
  intervalSec: number,
): Poller {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    try {
      const data = await fetcher();
      onOk(data);
    } catch {
      // 吞掉异常：不打断轮询、不调用 onOk
    }
  };

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    running = false;
  };

  const start = (): void => {
    if (running) stop();
    running = true;
    void tick();
    if (intervalSec > 0) {
      timer = setInterval(() => void tick(), intervalSec * 1000);
    }
  };

  return { start, stop };
}

/** 把 API 数据写入 option 的 optionPath（默认 series.0.data），不可变返回新 option */
export function applyApiData(
  option: EChartsOptionLike,
  data: unknown,
  optionPath: string,
): EChartsOptionLike {
  return setByPath(option, optionPath || "series.0.data", data);
}

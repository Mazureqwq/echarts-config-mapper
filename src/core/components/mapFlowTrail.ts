/**
 * T13-a：OD 飞线「真实流动拖尾」控制器（工作台侧）。
 *
 * ── 为什么不用 MapLibre 的 line-dasharray ────────────────────────────────
 * MapLibre 没有 SVG `stroke-dashoffset` 这样的相位平移能力，唯一能表达
 * 「沿航线推进的单个光点」的写法是逐帧改写 `line-dasharray`（形如
 * `[0, off, on, PERIOD]`）。但实测该路径不可用：
 *
 * 1. **dash 纹理图集会被逐帧改写耗尽**：MapLibre 把每种 dasharray 编成
 *    `LineAtlas(256, 512)` 里的一行纹理（key = dasharray.join(",")），
 *    逐帧改写 dasharray ⇒ 每帧新增一行 ⇒ 约 8 秒后报
 *    "LineAtlas out of space"，整条飞线**直接消失**（实测第 4 秒可见、
 *    第 13 秒已不可见）。
 * 2. **超长周期会让亮斑细于一个像素**：dash 图案被压缩进 256px 宽的纹理，
 *    `PERIOD` 越大，亮斑占的纹素越少，最终不可见。
 * 3. **每帧 `setPaintProperty` 会让 geojson source 每帧 reload**，
 *    `map.loaded()` 永远为 false，帧率从 60 掉到 30。
 * 4. `line-gradient` 也不行：`interpolate` 的输入必须是字面量，
 *    无法用 `feature-state` 推动渐变带的位置。
 *
 * ── 本模块的做法 ────────────────────────────────────────────────────────
 * 在 MapLibre 画布之上叠一层**同尺寸的 2D 覆盖层**（`pointer-events: none`），
 * 用 Canvas2D 直接绘制彗星：一条渐隐拖尾 + 一个带辉光的流光头。
 * 这样：
 * - 不触碰任何 MapLibre 图层的 paint 属性 ⇒ 不触发 source reload，
 *   `map.loaded()` 保持为 true，帧率保持 60；
 * - 不使用 dasharray ⇒ 没有图集耗尽问题；
 * - 工作台与离线 runtime 使用**完全相同**的算法与常量（离线侧有一份等价实现）。
 *
 * 语义（与 spec `2026-11-15-chartforge-map-od-flow-trail.md` 一致）：
 * - 推进距离 `s` 以**像素/秒**恒定推进（`FLOW_TRAIL_SPEED`），
 *   周期 = 该图层内最长航线在屏幕上的像素长度 ⇒ 彗星严格走完「起点 → 终点」后归零；
 * - 归零回绕时相位落在周期两端，`flowTrailFade` 把彗星淡出 / 淡入，回跳不可见；
 * - 拖尾长度固定 `FLOW_TRAIL_LENGTH` px，起点处退化为 `[0, s)`。
 */

import { FLOW_HEAD_LENGTH, FLOW_TRAIL_LENGTH, FLOW_TRAIL_SPEED } from "./mapScene";

/** 一条 OD 航线（经纬度） */
export interface FlowTrailRoute {
  from: [number, number];
  to: [number, number];
  name?: string;
}

/** 一个带动画的飞线图层 */
export interface FlowTrailLayerSpec {
  /** 图层 id（与 MapLibre 的 `cf-flow-<id>` 对应） */
  id: string;
  /** 航线颜色 */
  color: string;
  /** 航线不透明度（0..1） */
  opacity: number;
  /** 底稿线宽（px），用于推导拖尾宽度与光头半径 */
  width: number;
  /** 该图层的所有航线 */
  routes: FlowTrailRoute[];
}

/** 控制器需要的地图能力（便于单测 mock） */
export interface FlowTrailMap {
  project(point: [number, number]): { x: number; y: number };
}

/** 覆盖层控制器 */
export interface FlowTrailOverlay {
  /** 替换动画目标（样式 / 数据重建后调用） */
  refresh(specs?: FlowTrailLayerSpec[]): void;
  /** 停止动画并移除覆盖层（必须调用） */
  stop(): void;
  /** 测试钩子：各图层当前的归一化相位（0..1） */
  getPhases(): Record<string, number>;
}

/** 周期两端的淡入 / 淡出：彗星归零回绕时恰好处于全透明，回跳不可见。 */
export function flowTrailFade(phase: number): number {
  const fadeIn = smoothstep(0, 0.08, phase);
  const fadeOut = 1 - smoothstep(0.92, 1, phase);
  return fadeIn * fadeOut;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 相位（0..1）：推进距离 / 周期长度 */
export function flowTrailPhase(travelled: number, travel: number): number {
  if (travel <= 0) return 0;
  return (travelled % travel) / travel;
}

/** 推进距离（px）：按恒定像素速度累加，周期 = 最长航线像素长度 */
export function flowTrailTravelled(elapsedMs: number, speed: number, travel: number): number {
  if (travel <= 0) return 0;
  return (elapsedMs / 1000) * speed % travel;
}

/** 彗星在一条航线上的几何（屏幕像素坐标） */
export interface FlowTrailGeometry {
  headX: number;
  headY: number;
  tailX: number;
  tailY: number;
  /** 该航线是否已走完（彗星越过终点） */
  finished: boolean;
}

/**
 * 计算某条航线上的彗星位置。
 * @param from 起点屏幕坐标
 * @param to 终点屏幕坐标
 * @param position 推进距离（px，沿航线方向）
 * @param trailLength 拖尾长度（px）
 */
export function flowTrailGeometry(
  from: { x: number; y: number },
  to: { x: number; y: number },
  position: number,
  trailLength: number,
): FlowTrailGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    return { headX: from.x, headY: from.y, tailX: from.x, tailY: from.y, finished: true };
  }
  const ux = dx / length;
  const uy = dy / length;
  const headX = from.x + ux * position;
  const headY = from.y + uy * position;
  const tail = Math.min(trailLength, Math.max(0, position));
  return {
    headX,
    headY,
    tailX: headX - ux * tail,
    tailY: headY - uy * tail,
    finished: position > length,
  };
}

/** 把 #rgb / #rrggbb / rgb() 解析成 rgba 分量；无法解析时退回白色 */
export function parseFlowColor(color: string): { r: number; g: number; b: number } {
  const value = (color ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const raw = hex[1];
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }
  return { r: 255, g: 255, b: 255 };
}

export function rgba(color: { r: number; g: number; b: number }, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;
}

/** 拖尾宽度（px） */
export function flowTrailWidth(width: number): number {
  return Math.max(2, width * 2);
}

/** 流光头辉光半径（px）：至少 FLOW_HEAD_LENGTH 的一半，随底稿线宽放大 */
export function flowTrailHeadRadius(width: number): number {
  return Math.max(FLOW_HEAD_LENGTH / 2, width * 3);
}

/**
 * 创建覆盖层控制器。
 *
 * @param map 仅需 `project`
 * @param container MapLibre 的容器元素（覆盖层作为其子节点，覆盖在地图画布之上）
 * @param specs 带动画的飞线图层
 */
export function createFlowTrailOverlay(
  map: FlowTrailMap,
  container: HTMLElement,
  specs: FlowTrailLayerSpec[],
  options: { trailLength?: number; speed?: number; now?: () => number } = {},
): FlowTrailOverlay {
  const trailLength = options.trailLength ?? FLOW_TRAIL_LENGTH;
  const speed = options.speed ?? FLOW_TRAIL_SPEED;
  const now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));

  let current = specs.filter((spec) => spec.routes.length > 0);
  let stopped = false;
  let frame = 0;
  let start = now();
  const phases: Record<string, number> = {};

  const canvas = document.createElement("canvas");
  canvas.className = "cf-flow-trail-overlay";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "1";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { refresh: () => undefined, stop: () => undefined, getPhases: () => ({}) };
  }

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return false;
    const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };

  const draw = () => {
    if (stopped) return;
    if (!resize()) {
      frame = requestAnimationFrame(draw);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = now() - start;
    for (const spec of current) {
      const color = parseFlowColor(spec.color);
      const opacity = spec.opacity;
      const tailWidth = flowTrailWidth(spec.width);
      const headRadius = flowTrailHeadRadius(spec.width);
      // 该图层最长航线的屏幕像素长度 = 彗星走完一圈的周期
      let travel = 0;
      const projected: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
      for (const route of spec.routes) {
        const from = map.project(route.from);
        const to = map.project(route.to);
        projected.push({ from, to });
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length > travel) travel = length;
      }
      if (travel <= 1) {
        phases[spec.id] = 0;
        continue;
      }
      const position = flowTrailTravelled(elapsed, speed, travel);
      const phase = flowTrailPhase(position, travel);
      phases[spec.id] = phase;
      const alpha = flowTrailFade(phase) * opacity;
      if (alpha <= 0.002) continue;
      for (const segment of projected) {
        const geometry = flowTrailGeometry(segment.from, segment.to, position, trailLength);
        if (geometry.finished) continue;
        // 拖尾：尾部透明 → 头部实色
        const gradient = ctx.createLinearGradient(geometry.tailX, geometry.tailY, geometry.headX, geometry.headY);
        gradient.addColorStop(0, rgba(color, 0));
        gradient.addColorStop(0.45, rgba(color, 0.4 * alpha));
        gradient.addColorStop(1, rgba(color, alpha));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = tailWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(geometry.tailX, geometry.tailY);
        ctx.lineTo(geometry.headX, geometry.headY);
        ctx.stroke();
        // 流光头：白热核心 + 航线色辉光
        const glow = ctx.createRadialGradient(
          geometry.headX,
          geometry.headY,
          0,
          geometry.headX,
          geometry.headY,
          headRadius,
        );
        glow.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, alpha));
        glow.addColorStop(0.35, rgba(color, 0.85 * alpha));
        glow.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(geometry.headX, geometry.headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  // 测试钩子：e2e 读取覆盖层相位，验证彗星确实在推进
  (canvas as unknown as { __cfFlowTrail?: unknown }).__cfFlowTrail = {
    kind: "flow-trail-overlay",
    getPhases: () => ({ ...phases }),
  };

  return {
    refresh(next?: FlowTrailLayerSpec[]) {
      if (next) current = next.filter((spec) => spec.routes.length > 0);
      // 重建样式后周期长度可能变化 ⇒ 相位重新计时，避免跳变
      start = now();
    },
    stop() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      current = [];
      canvas.remove();
    },
    getPhases() {
      return { ...phases };
    },
  };
}

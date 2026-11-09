export interface SnapCandidate {
  axis: "x" | "y";
  moving: number;
  static: number;
}

export interface SnapGuide {
  axis: "x" | "y";
  position: number;
}

export interface SpacingHint {
  axis: "x" | "y";
  side: "before" | "after";
  from: number;
  to: number;
  cross: number;
  distance: number;
}

export interface SnapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export const SNAP_THRESHOLD = 6;
export const SNAP_SCREEN_THRESHOLD = 8;

export function snapThresholdForZoom(zoomPercent: number): number {
  const safeZoom = Number.isFinite(zoomPercent)
    ? Math.max(25, Math.min(400, zoomPercent))
    : 100;
  return SNAP_SCREEN_THRESHOLD / (safeZoom / 100);
}

export function snapDelta(
  delta: { dx: number; dy: number },
  candidates: SnapCandidate[],
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  const result: SnapResult = { dx: delta.dx, dy: delta.dy, guides: [] };
  const axes: Array<{ axis: "x" | "y"; base: number }> = [
    { axis: "x", base: delta.dx },
    { axis: "y", base: delta.dy },
  ];
  for (const { axis, base } of axes) {
    let best: { correction: number; guide: SnapGuide } | null = null;
    for (const c of candidates) {
      if (c.axis !== axis) continue;
      const correction = c.static - (c.moving + base);
      if (
        Math.abs(correction) <= threshold &&
        (best === null || Math.abs(correction) < Math.abs(best.correction))
      ) {
        best = { correction, guide: { axis, position: c.static } };
      }
    }
    if (best) {
      if (axis === "x") {
        result.dx = base + best.correction;
      } else {
        result.dy = base + best.correction;
      }
      const guide = best.guide;
      if (!result.guides.some((g) => g.axis === guide.axis && g.position === guide.position)) {
        result.guides.push(guide);
      }
    }
  }
  return result;
}

export function snapDeltaToGrid(
  delta: { dx: number; dy: number },
  bounds: { x: number; y: number; w: number; h: number },
  gridSize: number,
  preferGuides: ReadonlySet<"x" | "y"> = new Set()
): { dx: number; dy: number } {
  if (
    !Number.isFinite(gridSize) ||
    gridSize <= 0 ||
    ![delta.dx, delta.dy, bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)
  ) return { ...delta };

  const result = { ...delta };
  if (!preferGuides.has("x")) {
    const x = bounds.x + result.dx;
    result.dx += Math.round(x / gridSize) * gridSize - x;
  }
  if (!preferGuides.has("y")) {
    const y = bounds.y + result.dy;
    result.dy += Math.round(y / gridSize) * gridSize - y;
  }
  return result;
}

export function buildEqualSpacingCandidates(moving: SnapRect, statics: SnapRect[]): SnapCandidate[] {
  if (![moving.x, moving.y, moving.w, moving.h].every(Number.isFinite) || moving.w <= 0 || moving.h <= 0) {
    return [];
  }
  const fixed = statics.filter((frame) =>
    [frame.x, frame.y, frame.w, frame.h].every(Number.isFinite) && frame.w > 0 && frame.h > 0
  );
  const candidates: SnapCandidate[] = [];
  const overlap = (aStart: number, aSize: number, bStart: number, bSize: number): number =>
    Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart);

  for (let i = 0; i < fixed.length; i += 1) {
    for (let j = i + 1; j < fixed.length; j += 1) {
      const first = fixed[i]!;
      const second = fixed[j]!;
      if (overlap(moving.y, moving.h, first.y, first.h) > 0 && overlap(moving.y, moving.h, second.y, second.h) > 0) {
        const [left, right] = first.x <= second.x ? [first, second] : [second, first];
        const gap = right.x - (left.x + left.w);
        if (gap >= 0) {
          candidates.push(
            { axis: "x", moving: moving.x, static: right.x + right.w + gap },
            { axis: "x", moving: moving.x + moving.w, static: left.x - gap }
          );
          const innerGap = (gap - moving.w) / 2;
          if (innerGap >= 0) {
            candidates.push({ axis: "x", moving: moving.x, static: left.x + left.w + innerGap });
          }
        }
      }

      if (overlap(moving.x, moving.w, first.x, first.w) > 0 && overlap(moving.x, moving.w, second.x, second.w) > 0) {
        const [top, bottom] = first.y <= second.y ? [first, second] : [second, first];
        const gap = bottom.y - (top.y + top.h);
        if (gap >= 0) {
          candidates.push(
            { axis: "y", moving: moving.y, static: bottom.y + bottom.h + gap },
            { axis: "y", moving: moving.y + moving.h, static: top.y - gap }
          );
          const innerGap = (gap - moving.h) / 2;
          if (innerGap >= 0) {
            candidates.push({ axis: "y", moving: moving.y, static: top.y + top.h + innerGap });
          }
        }
      }
    }
  }
  return candidates;
}

export function findNearestSpacingHints(
  moving: SnapRect,
  statics: SnapRect[],
  maxDistance: number = Number.POSITIVE_INFINITY
): SpacingHint[] {
  if (![moving.x, moving.y, moving.w, moving.h].every(Number.isFinite) || moving.w <= 0 || moving.h <= 0) {
    return [];
  }
  const limit = Number.isFinite(maxDistance) && maxDistance >= 0 ? maxDistance : Number.POSITIVE_INFINITY;
  const nearest = new Map<string, SpacingHint>();
  const keepNearest = (hint: SpacingHint): void => {
    if (hint.distance < 0 || hint.distance > limit) return;
    const key = `${hint.axis}:${hint.side}`;
    const current = nearest.get(key);
    if (!current || hint.distance < current.distance) nearest.set(key, hint);
  };

  for (const fixed of statics) {
    if (![fixed.x, fixed.y, fixed.w, fixed.h].every(Number.isFinite) || fixed.w <= 0 || fixed.h <= 0) continue;
    const overlapY = Math.min(moving.y + moving.h, fixed.y + fixed.h) - Math.max(moving.y, fixed.y);
    if (overlapY > 0) {
      const cross = Math.max(moving.y, fixed.y) + overlapY / 2;
      if (fixed.x + fixed.w <= moving.x) {
        keepNearest({ axis: "x", side: "before", from: fixed.x + fixed.w, to: moving.x, cross, distance: moving.x - fixed.x - fixed.w });
      } else if (fixed.x >= moving.x + moving.w) {
        keepNearest({ axis: "x", side: "after", from: moving.x + moving.w, to: fixed.x, cross, distance: fixed.x - moving.x - moving.w });
      }
    }

    const overlapX = Math.min(moving.x + moving.w, fixed.x + fixed.w) - Math.max(moving.x, fixed.x);
    if (overlapX > 0) {
      const cross = Math.max(moving.x, fixed.x) + overlapX / 2;
      if (fixed.y + fixed.h <= moving.y) {
        keepNearest({ axis: "y", side: "before", from: fixed.y + fixed.h, to: moving.y, cross, distance: moving.y - fixed.y - fixed.h });
      } else if (fixed.y >= moving.y + moving.h) {
        keepNearest({ axis: "y", side: "after", from: moving.y + moving.h, to: fixed.y, cross, distance: fixed.y - moving.y - moving.h });
      }
    }
  }

  return ["x:before", "x:after", "y:before", "y:after"].flatMap((key) => {
    const hint = nearest.get(key);
    return hint ? [hint] : [];
  });
}

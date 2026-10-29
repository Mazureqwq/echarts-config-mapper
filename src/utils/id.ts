let seed = 0;

/** 生成稳定、可读的短 id（不依赖 crypto，node/jsdom 都能跑） */
export function createId(prefix = "chart"): string {
  seed += 1;
  return `${prefix}_${Date.now().toString(36)}_${seed.toString(36)}`;
}

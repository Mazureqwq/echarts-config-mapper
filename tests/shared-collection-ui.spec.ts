import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("shared collection UI", () => {
  const charts = read("views/ChartsView.vue");
  const screens = read("views/LibraryView.vue");

  it("uses one controlled filter bar for both collections", () => {
    for (const source of [charts, screens]) {
      expect(source).toContain("<CollectionFilterBar");
      expect(source).toContain('v-model:search="search"');
      expect(source).toContain('v-model:category="categoryFilter"');
      expect(source).toContain('v-model:active-tag="activeTag"');
      expect(source).not.toMatch(/class="(?:charts|library)__(?:filters|search|tags|tag)"/);
    }
    // Only charts need the optional leading selection control.
    expect(charts).toContain("<template #leading>");
    expect(screens).not.toContain("<template #leading>");
  });

  it("uses one empty-state shell while keeping each page's steps and actions", () => {
    for (const source of [charts, screens]) {
      expect(source).toContain("<EmptyState v-if=");
      expect(source).toContain("<EmptyState v-else-if=");
      expect(source).toContain('class="empty-state__steps"');
      expect(source).not.toMatch(/class="(?:charts|library)__(?:empty|steps|empty-ops)/);
    }
    expect(charts).toContain("新建第一张图表");
    expect(screens).toContain("新建大屏");
  });

  it("styles slotted step lists inside the shared empty-state component", () => {
    const source = read("shared/ui/EmptyState.vue");
    expect(source).toContain(":deep(.empty-state__steps)");
    expect(source).toContain('<slot name="actions" />');
  });
});
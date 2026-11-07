import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("shared collection card and interaction primitives", () => {
  const charts = read("views/ChartsView.vue");
  const screens = read("views/LibraryView.vue");
  const frame = read("shared/ui/CollectionCardFrame.vue");
  const styles = read("style/ui-primitives.css");

  it("uses one card frame and grid for both libraries", () => {
    for (const source of [charts, screens]) {
      expect(source).toContain("<CollectionCardFrame");
      expect(source).toContain("cf-collection-grid");
      expect(source).not.toMatch(/class="(?:charts|library)__(?:card|thumb|card-name|card-chips|chip|card-ops)/);
    }
    expect(charts).toContain("<template #selection>");
    expect(charts).toContain("draggable");
    expect(screens).toContain("<template #actions>");
  });

  it("keeps card slots while owning shared thumbnail, metadata and action layout", () => {
    expect(frame).toContain('<slot name="thumbnail-placeholder" />');
    expect(frame).toContain('<slot name="metadata" />');
    expect(frame).toContain('<slot name="actions" />');
    expect(frame).toContain(':deep(.collection-card__chip)');
    expect(frame).toContain("aspect-ratio: 16 / 9");
  });

  it("defines accessible shared button, control and collection-grid primitives", () => {
    expect(read("main.ts")).toContain('import "./style/ui-primitives.css"');
    for (const name of [".cf-button", ".cf-button--primary", ".cf-button--danger", ".cf-control", ".cf-control--compact", ".cf-collection-grid"]) {
      expect(styles).toContain(name);
    }
    expect(styles).toContain(":focus-visible");
  });
});

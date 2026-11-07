import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("shared app header", () => {
  it.each([
    ["views/ChartsView.vue", "charts"],
    ["views/LibraryView.vue", "screens"],
    ["views/SettingsView.vue", "settings"],
  ])("%s uses the common header and identifies %s as active", (path, active) => {
    const source = read(path);
    expect(source).toContain(`<AppHeader active="${active}">`);
    expect(source).not.toMatch(/<header class="(?:charts|library|settings)__header"/);
    expect(source).not.toMatch(/<(?:nav|button) class="(?:charts|library|settings)__nav/);
  });

  it("keeps navigation order and placement in one component", () => {
    const source = read("shared/ui/AppHeader.vue");
    const paths = [...source.matchAll(/<RouterLink to="([^"]+)"/g)].map((match) => match[1]);
    expect(paths).toEqual(["/charts", "/screens", "/settings"]);
    expect(source).toContain("grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)");
  });

  it("reserves a fixed header height so status/actions cannot change it", () => {
    const source = read("shared/ui/AppHeader.vue");
    expect(source).toContain("height: 68px");
    expect(source).toContain("min-height: 68px");
    expect(source).toContain("flex: 0 0 68px");
    expect(source).not.toContain("height: 130px"); // no viewport breakpoint changes the header height
  });
});
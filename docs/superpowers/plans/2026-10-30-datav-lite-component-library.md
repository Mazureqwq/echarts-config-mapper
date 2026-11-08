# DataV-lite Component Library Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the left-side Components page into a searchable, categorized DataV-style catalog and add three controlled components—progress list, section title, and corner frame—with consistent editor, preview, and offline-export support.

**Architecture:** Derive a read-only catalog from the existing chart and component registries plus the legacy basic-item creation flow. Add declarative, versioned Vue renderers for three new widgets and explicit static renderers in the offline runtime; reuse the existing document insertion, dataset snapshot, blueprint, and export interfaces.

**Tech Stack:** Vue 3.5, TypeScript 5.9, Vite 8, Pinia 3, ECharts 6, Vitest 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-datav-lite-component-library-design.md`

## Global Constraints

- Keep components compile-time registered with exact versions; no runtime-installed plugins.
- Do not change workspace schema, existing component IDs/versions, legacy chart/text/image/shape data, dataset binding semantics, or `buildPackagePayload` API.
- Use only local preview templates and registered renderers; never execute arbitrary user HTML, CSS, or code.
- Offline ZIP and single-file HTML must make no network requests and contain no external resources, `eval`, `new Function`, or `innerHTML`.
- Reuse the shared DatasetRuntime snapshot and existing `DESIGN_DND_MIME` / canvas item-drop flows.
- Keep user-defined text as text nodes and validate color values as `#RRGGBB`; allow only declared visual variants.

## Review Focus

1. Existing or imported component definitions that omit catalog metadata remain renderable and appear with a safe fallback entry — pinned in Task 1 catalog tests.
2. Search terms and labels containing HTML-like text are displayed as literal text and cannot create elements — pinned in Task 2 and Task 4 tests.
3. Unknown theme tokens and invalid imported/custom color values fall back safely; resetting returns to theme inheritance — pinned in Task 3 tests.
4. Progress rows with absent fields, empty data, non-finite/negative/over-limit values never produce invalid percentages or unsafe DOM — pinned in Task 3 tests.
5. Exported components with absent renderers, malicious text, stale datasets, or external URLs fail safely or use the last successful snapshot with a warning — pinned in Task 5 tests.

---

## File Structure

- Create `src/core/components/catalog.ts` for the pure catalog entry model, registry projection, and search/filter logic; it owns no renderers or persisted state.
- Extend `src/core/components/types.ts` and `builtins.ts` with optional catalog metadata and the three new versioned definitions.
- Create `src/workbench/components/ComponentCatalogPanel.vue` for catalog browsing and `src/workbench/catalogActions.ts` for the testable mapping from an entry to existing insert/drop protocols.
- Keep `ElementsPanel.vue`'s Materials view as the existing basic-item shortcut; replace the Charts view with the unified catalog. Remove only the duplicate registered-component list from `DesignLibraryPanel.vue`.
- Add the safe color/theme-token helper in `src/core/components/props.ts`; use it in `ComponentInspector.vue` and the Vue widget renderers.
- Create `ProgressListWidget.vue`, `SectionTitleWidget.vue`, and `CornerFrameWidget.vue`; extend `dataWidgets.ts` only with pure progress-row mapping.
- Extend `src/core/export/runtime.ts` with static renderers, `src/core/export/snapshot.ts` with the exact supported renderer IDs, and `src/core/export/artifact.ts` with local styles; do not alter package API or CSP.
- Add focused catalog, inspector/props, widget, and export tests; retain all existing tests.

## Task 1: Catalog metadata, projection, and search

**Files:**
- Create: `src/core/components/catalog.ts`
- Modify: `src/core/components/types.ts`, `src/core/components/builtins.ts`
- Test: `tests/component-catalog.spec.ts`

**Interfaces:**
- `componentCatalogEntries` includes Vue definitions without metadata using a generic safe preview; it excludes legacy adapters.
- `ComponentCatalogGroup = "chart" | "data" | "decoration" | "basic"`.
- `ComponentCatalogEntry` is a discriminated union with common `{ key: string; group: ComponentCatalogGroup; name: string; description: string; tags: readonly string[]; previewKey: string }` and source-specific fields: chart `{ source: "chart"; chartType: ChartType }`, component `{ source: "component"; componentId: string; componentVersion: number }`, basic `{ source: "basic"; itemKind: "text" | "image" | "shape" }`.
- `ComponentDefinition.catalog?` contains `{ group: "data" | "decoration"; description: string; tags: readonly string[]; previewKey: string }`; omitted metadata remains valid. `componentCatalogEntries(definitions: readonly ComponentDefinition[]): ComponentCatalogEntry[]` includes each Vue definition; missing metadata gets a safe `data`/`generic` fallback, while legacy adapters stay excluded.
- `getComponentCatalog(): readonly ComponentCatalogEntry[]` projects the six existing `chartRegistry` types, the Vue entries from `componentCatalogEntries(componentRegistry.list())`, and the existing basic item kinds.
- `filterComponentCatalog(entries: readonly ComponentCatalogEntry[], query: string, group: ComponentCatalogGroup | "all"): ComponentCatalogEntry[]` matches trimmed, case-insensitive name, description, or tags and preserves stable source order.

- [x] **Step 1: Write failing catalog tests** — `tests/component-catalog.spec.ts` asserts all six chart types appear once; registered definitions use exact `id@version`; a synthetic Vue definition without catalog metadata remains in the catalog with a safe generic fallback and registry lookup is unchanged; legacy adapters stay hidden; basic items appear once; search matches name/description/tag case-insensitively; group filtering and empty query return predictable results.
- [x] **Step 2: Run the focused test and confirm failure** — `npm test -- --run tests/component-catalog.spec.ts`; expect missing catalog types/functions.
- [x] **Step 3: Implement the pure catalog projection and optional metadata** — add chart labels from `ChartDescriptor.label`, register metadata for the existing data widgets, and make the pure filter operate only on compile-time entries.
- [x] **Step 4: Run the focused catalog and registry tests** — run `npm test -- --run tests/component-catalog.spec.ts` and `npm test -- --run tests/core-registry.spec.ts` separately; expect PASS.
- [x] **Step 5: Commit** — `feat: add component catalog metadata`.

## Task 2: Searchable catalog UI and single registered-component entry point

**Files:**
- Create: `src/workbench/components/ComponentCatalogPanel.vue`, `src/workbench/catalogActions.ts`, `tests/component-catalog-ui.spec.ts`
- Modify: `src/workbench/LeftPanel.vue`, `src/workbench/panels/DesignLibraryPanel.vue`
- Reuse: `src/workbench/ElementsPanel.vue`, `src/shared/dnd.ts`, `src/workbench/CanvasStage.vue`

**Interfaces:**
- `insertCatalogEntry(entry: ComponentCatalogEntry, actions: { addChart(type: ChartType): void; addComponent(id: string, version: number): void; addBasic(kind: "text" | "image" | "shape"): void }): void` calls exactly one existing insertion flow.
- `catalogDragPayload(entry: ComponentCatalogEntry): { mime: string; data: string }` uses the existing item MIME for chart/basic entries and `DESIGN_DND_MIME` with `{ kind: "component", id, version }` for registered components.
- `ComponentCatalogPanel` accepts no persisted filter state; search/category state is local to the panel.

- [x] **Step 1: Write failing catalog UI/action tests** — assert semantic search/category controls and grouped cards render; literal hostile-looking labels remain text; insertion maps chart/component/basic entries to the correct action; drag payloads match the existing canvas MIME contracts; empty results have an accessible message.
- [x] **Step 2: Run the focused UI/action test and confirm failure** — `npm test -- --run tests/component-catalog-ui.spec.ts`; expect the new panel/helper to be missing.
- [x] **Step 3: Implement the panel and route existing flows** — replace the Components/Charts panel body in `LeftPanel.vue` with the new catalog; preserve the Materials shortcut; remove the duplicate registered-component section from `DesignLibraryPanel.vue`; implement click/drag using the helper and allow-listed local preview keys.
- [x] **Step 4: Run focused catalog UI, left-panel, and design-library tests** — run `npm test -- --run tests/component-catalog-ui.spec.ts`, `npm test -- --run tests/workbench-layout.spec.ts`, and `npm test -- --run tests/design-library.spec.ts` separately; assert the Design Library no longer renders a registered-components section; expect PASS.
- [x] **Step 5: Commit** — `feat: add searchable component catalog`.

## Task 3: Safe color inheritance and data-bound progress-list widget

**Files:**
- Create: `src/core/components/props.ts`, `src/workbench/components/ProgressListWidget.vue`, `tests/component-props.spec.ts`, `tests/component-inspector.spec.ts`
- Modify: `src/core/components/types.ts`, `src/core/components/dataWidgets.ts`, `src/core/components/builtins.ts`, `src/workbench/components/ComponentInspector.vue`, `tests/data-widgets.spec.ts`

**Interfaces:**
- `ComponentThemeToken = "panel" | "text" | "muted" | "accent" | "border"`; `ComponentProp.type` adds `"color"` and optional `themeToken?: ComponentThemeToken`.
- `sanitizeHexColor(value: unknown): string | undefined` accepts only `#RRGGBB`.
- `resolveComponentColor(value: unknown, token: ComponentThemeToken, tokens: Pick<DesignTheme["tokens"], ComponentThemeToken>, fallback: string): string` returns a valid explicit color, otherwise the allow-listed theme token, otherwise the safe fallback.
- `buildProgressRows(rows: readonly Record<string, unknown>[], labelField: string, valueField: string, maxValue: number): Array<{ label: string; value: number; percent: number }>` accepts finite numbers/numeric strings, skips rows with unusable values, uses `—` for a missing label, clamps negative values to 0%, and clamps values above max to 100%; invalid/non-positive max is normalized to 100.
- Register `chartforge.progress-list@1` with `exportRendererId: "chartforge-progress-list-v1"`, catalog `{ group: "data", description: "将数据行映射为进度条", tags: ["进度", "比例", "数据"], previewKey: "progress-list" }`, and default frame `{ w: 520, h: 280 }`; defaults `labelField: "name"`, `valueField: "value"`, `maxValue: 100`, `showValue: true`; theme-inheriting `trackColor` (token `border`) and `fillColor` (token `accent`). Invalid/non-positive max falls back to 100; negative row values render at 0%, and values above max render at 100%.

- [x] **Step 1: Write failing color and progress-row tests** — cover valid/invalid hex, unknown token fallback, theme inheritance and explicit override, reset-to-theme action, empty rows, missing labels/values, numeric strings, non-finite values, negative values producing 0%, invalid max falling back to 100, and above-max values producing 100%.
- [x] **Step 2: Run the focused tests and confirm failure** — run `npm test -- --run tests/component-props.spec.ts` and `npm test -- --run tests/data-widgets.spec.ts` separately; expect missing helper/widget behavior.
- [x] **Step 3: Implement safe props, inspector controls, and the Vue progress widget** — show theme-resolved color in the color input without persisting an override until changed; provide a reset-to-theme action; render progress rows from `rows` only, using semantic progressbar attributes and safe text.
- [x] **Step 4: Run widget, inspector, and data-binding tests** — run `npm test -- --run tests/component-props.spec.ts`, `npm test -- --run tests/component-inspector.spec.ts`, `npm test -- --run tests/data-widgets.spec.ts`, and `npm test -- --run tests/item-view.spec.ts` separately; expect PASS.
- [x] **Step 5: Commit** — `feat: add data-bound progress list component`.

## Task 4: Registered title and corner-frame components

**Files:**
- Create: `src/workbench/components/SectionTitleWidget.vue`, `src/workbench/components/CornerFrameWidget.vue`, `tests/registered-visual-widgets.spec.ts`
- Modify: `src/core/components/builtins.ts`, `src/core/components/types.ts`, `tests/core-registry.spec.ts`
- Reuse: `src/core/components/props.ts`

**Interfaces:**
- Register `chartforge.section-title@1` with `exportRendererId: "chartforge-section-title-v1"`, catalog `{ group: "decoration", description: "大屏分区标题", tags: ["标题", "分区", "装饰"], previewKey: "section-title" }`, default frame `{ w: 520, h: 72 }`, defaults `{ title: "分区标题", subtitle: "", variant: "underline" }`, and props `{ title: string; subtitle: string; variant: "underline" | "bar" | "bracket"; accentColor: theme-inheriting color }`.
- Register `chartforge.corner-frame@1` with `exportRendererId: "chartforge-corner-frame-v1"`, catalog `{ group: "decoration", description: "大屏角标边框装饰", tags: ["边框", "角标", "装饰"], previewKey: "corner-frame" }`, default frame `{ w: 500, h: 300 }`, defaults `{ variant: "corner", thickness: 2, inset: 8 }`, and props `{ variant: "corner" | "outline" | "double"; color: theme-inheriting color; thickness: number clamped to 1–8; inset: number clamped to 0–32 }`.
- Both Vue renderers use `ComponentRenderProps`, contain no data fetch, use text nodes for title fields, and resolve missing/invalid style props to fixed defaults.

- [x] **Step 1: Write failing registration and SSR rendering tests** — assert exact IDs/versions/default frames/props/catalog metadata; section title renders hostile text literally; all declared variants render; invalid variants/colors resolve to safe defaults; corner frame adds no external resource.
- [x] **Step 2: Run the focused tests and confirm failure** — `npm test -- --run tests/registered-visual-widgets.spec.ts`; expect the new definitions/renderers to be missing.
- [x] **Step 3: Implement the two Vue renderers and compile-time definitions** — keep title and frame styling limited to declared variants, local CSS and theme tokens.
- [x] **Step 4: Run visual-widget, registry, and workbench item tests** — run `npm test -- --run tests/registered-visual-widgets.spec.ts`, `npm test -- --run tests/core-registry.spec.ts`, and `npm test -- --run tests/item-view.spec.ts` separately; expect PASS.
- [x] **Step 5: Commit** — `feat: add registered dashboard decorations`.

## Task 5: Offline static renderers for all new component versions

**Files:**
- Modify: `src/core/export/runtime.ts`, `src/core/export/snapshot.ts`, `src/core/export/artifact.ts`, `tests/export-e2e.spec.ts`, `tests/export-snapshot.spec.ts`, `tests/export-artifact.spec.ts`
- Reuse: `src/core/export/model.ts`

**Interfaces:**
- Extend the snapshot allow-list with `chartforge-progress-list-v1`, `chartforge-section-title-v1`, and `chartforge-corner-frame-v1`; extend the static `addComponent(item, screen)` dispatch for exactly `chartforge.progress-list@1`, `chartforge.section-title@1`, and `chartforge.corner-frame@1`; no dynamic renderer lookup from payload and no new network behavior.
- Offline progress mapping uses only `PackageDataset.rows`, applies the existing dataset/global-variable filter, and rerenders after allow-listed blueprint variable changes.
- Static renderers use `createElement`, `textContent`, validated colors, and local CSS classes; they accept no user-authored HTML/CSS.

- [ ] **Step 1: Write failing offline export tests** — extend E2E payload with all three components; assert progress rows respond to a blueprint filter using one snapshot; stale snapshots keep last-successful rows and warn; hostile titles/labels remain text; unknown component renderer still blocks export; ZIP and inline HTML contain no external resources or executable source.
- [ ] **Step 2: Run focused export tests and confirm failure** — run separately: `npm test -- --run tests/export-snapshot.spec.ts`, `npm test -- --run tests/export-artifact.spec.ts`, and `npm test -- --run tests/export-e2e.spec.ts`; expect unsupported new renderers/behavior.
- [ ] **Step 3: Implement the three static renderers in `RUNTIME_CODE`** — reuse existing package datasets, safe field handling, theme tokens, and blueprint rerender flow; preserve the restrictive CSP and existing `buildPackagePayload` API.
- [ ] **Step 4: Run all focused export tests** — run the three focused commands above; expect PASS for stale warnings, unsafe input, ZIP and inline artifacts.
- [ ] **Step 5: Commit** — `feat: export progress and decoration components offline`.

## Task 6: Full acceptance and plan close-out

**Files:**
- Modify: `docs/superpowers/plans/2026-10-30-datav-lite-component-library.md`
- Verify: catalog, widget, registry, migration, export and full Vitest suites

- [ ] **Step 1: Run typecheck** — `npm run typecheck`; expect no TypeScript errors.
- [ ] **Step 2: Run full tests** — `npm test -- --run`; expect all test files and tests PASS, including legacy migration and existing table/KPI/export behavior.
- [ ] **Step 3: Run production build** — `npm run build`; expect successful Vite production output.
- [ ] **Step 4: Review security and diff** — run `git diff --check`; confirm new renderers have no `eval`, `new Function`, `innerHTML`, external URLs or runtime fetches.
- [ ] **Step 5: Mark acceptance checks complete and commit** — `feat: polish DataV-lite component library`.

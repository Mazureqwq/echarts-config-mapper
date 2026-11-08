# DataV-lite Layout Background Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark monitor design-library pack with two slot-aligned layout backgrounds and three reusable decorative assets, inserted as local bottom-layer groups without changing canvas settings or persisted schema.

**Architecture:** A compile-time catalog owns stable layout/asset IDs, local previews, and factories that emit existing `ScreenItem` shapes and registered decorations. Layout factories reuse `templateSlots("main-side" | "grid-2x2", canvas)`; store actions group and insert generated items at the bottom of the current screen. The design-library UI and canvas drop handler share one allow-listed drag payload; exports reuse existing shape and component renderers.

**Tech Stack:** Vue 3.5, TypeScript 5.9, Vite 8, Pinia 3, ECharts 6, Vitest 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-datav-layout-background-library-design.md`

## Global Constraints

- Only the “监控大屏 · 深色” style is in scope: layouts `main-side` and `grid-2x2`, plus panel-frame, title-band, and corner-accent assets.
- Keep canvas background setting/default (`#12161d`) independent from inserted layout/decoration items.
- Do not add persisted schema fields, migrations, or change `buildPackagePayload` API; use existing `ScreenItem`, `groupId`, `ShapeItem`, and registered decoration versions.
- Reuse `templateSlots`, `DESIGN_DND_MIME`, existing screen insertion and offline renderers; no new dependencies.
- All IDs and preview keys are compile-time allow-listed; no network assets, user HTML/CSS/scripts, runtime plugins, `eval`, `new Function`, or `innerHTML`.
- Preserve the existing worktree modifications in `src/core/design/library.ts`, `src/core/model/schema.ts`, `src/style/index.css`, `tests/core-model.spec.ts`, and `tests/design-library.spec.ts`; each task commit stages only its listed files.

## Review Focus

1. Unknown layout/asset IDs, missing screen, or malformed drag payload must be a safe no-op with no partial insertion — test in Tasks 1–3.
2. Tiny, zero, negative, or non-finite canvas dimensions must not create invalid item frames — test in Task 1.
3. Applying a layout must insert a grouped bottom layer and preserve every existing item's frame and relative order — test in Task 2.
4. Layout and asset cards must serialize only the declared design MIME/kinds and retain accessible click actions — test in Task 3.
5. Exported layouts must contain only supported local shapes/registered components, with no network references — test in Task 4.

---

## File Structure

- Create `src/core/design/layoutBackgrounds.ts` for stable entry metadata and safe factories for two layout compositions and three independent assets; it reuses existing theme tokens, screen template slots, and component definitions.
- Create `src/workbench/layoutBackgroundActions.ts` for the shared allow-listed click/drag payload mapping.
- Create `src/workbench/components/LayoutBackgroundCatalog.vue` for local preview cards and accessible click/drag controls.
- Modify `src/stores/documentStore.ts` with `insertLayoutBackground` and `insertLayoutAsset`; these are the only mutations of screen items.
- Modify `src/workbench/panels/DesignLibraryPanel.vue` to mount the catalog, and `src/workbench/CanvasStage.vue` to route validated drop payloads to the store.
- Create `tests/design-layouts.spec.ts`, `tests/design-layout-insertion.spec.ts`, and `tests/layout-background-ui.spec.ts`; extend `tests/export-snapshot.spec.ts` and `tests/export-e2e.spec.ts` for offline behavior.
- Do not modify `src/core/model/templates.ts`, `src/core/model/schema.ts`, `src/core/export/runtime.ts`, or the package API unless a test proves the approved design cannot be met without it; stop and revise the plan/spec before broadening that scope.

## Task 1: Compile-time layout and asset recipes

**Files:**
- Create: `src/core/design/layoutBackgrounds.ts`
- Test: `tests/design-layouts.spec.ts`
- Reuse: `src/core/model/templates.ts`, `src/core/design/library.ts`, `src/core/components/builtins.ts`

**Interfaces:**
- `LayoutBackgroundEntry` exposes `{ id, kind, name, description, previewKey }`, where `kind` is `"layout" | "asset"` and `previewKey` is a local union, not a URL.
- Export `LAYOUT_BACKGROUND_ENTRIES`, `listLayoutBackgroundEntries(): readonly LayoutBackgroundEntry[]`, `createLayoutBackgroundItems(id: string, canvas: ScreenCanvas): ScreenItem[]`, and `createLayoutAssetItems(id: string, canvas: ScreenCanvas, position?: { x: number; y: number }): ScreenItem[]`.
- Stable IDs: `monitor-main-side`, `monitor-grid-2x2`, `monitor-panel-frame`, `monitor-title-band`, `monitor-corner-accent`. Unknown IDs or unusable geometry return `[]` without partial results.
- Layout factories use existing template slots and the `monitor-dark` theme tokens; component items may use only `chartforge.section-title@1` and `chartforge.corner-frame@1`.

- [ ] **Step 1: Write the failing recipe tests** — assert exactly two layouts and three assets; metadata uses only local preview keys; `main-side` has one main and two side panels and `grid-2x2` has four panels at 1920×1080 and 1280×720; emitted frames are finite and within the canvas; tiny positive dimensions either yield no items or only finite, positive, in-canvas frames; zero, negative, or non-finite dimensions and unknown IDs return no items; asset factories work centered and at a supplied point.
- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run tests/design-layouts.spec.ts`
Expected: FAIL because the recipe module/exports are not implemented.

- [ ] **Step 3: Implement the compile-time entries and item factories** — create only existing shape and registered decoration items; compute panels from `templateSlots`, use fixed theme-token colors and local preview keys, and return no partial result on invalid input.
- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run tests/design-layouts.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit the recipe module and tests**

```bash
git add src/core/design/layoutBackgrounds.ts tests/design-layouts.spec.ts
git commit -m "feat: add DataV layout background recipes"
```

## Task 2: Safe document-store insertion and bottom-layer grouping

**Files:**
- Modify: `src/stores/documentStore.ts`
- Create: `tests/design-layout-insertion.spec.ts`
- Consume: `createLayoutBackgroundItems`, `createLayoutAssetItems` from Task 1

**Interfaces:**
- `insertLayoutBackground(id: string): string[]` creates a full-canvas composition for the current screen.
- `insertLayoutAsset(id: string, position?: { x: number; y: number }): string[]` inserts one decorative asset at the drop point or centered when clicked.
- Both methods return inserted item IDs; with no current screen, unknown IDs, or empty factory results they return `[]`, do not commit, and do not partially mutate the screen.

- [ ] **Step 1: Write failing store tests** — assert missing-screen/unknown-ID no-ops; valid layout inserts all items with one fresh `groupId` at the beginning of `screen.items`; existing items retain the same object data, frame, and relative order; 1280×720 layout frames fit that canvas; standalone asset click/drop placement works; repeated insertion produces unique item IDs and group IDs.
- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run tests/design-layout-insertion.spec.ts`
Expected: FAIL because the store actions are not implemented.

- [ ] **Step 3: Implement the two store actions** — obtain the current screen, call the Task 1 factory, assign fresh IDs/group ID, clamp generated frames, insert new items before current items so they render behind them, then commit once.
- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run tests/design-layout-insertion.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit the store behavior and tests**

```bash
git add src/stores/documentStore.ts tests/design-layout-insertion.spec.ts
git commit -m "feat: insert grouped layout backgrounds"
```

## Task 3: Design-library cards and validated click/drag paths

**Files:**
- Create: `src/workbench/layoutBackgroundActions.ts`
- Create: `src/workbench/components/LayoutBackgroundCatalog.vue`
- Modify: `src/workbench/panels/DesignLibraryPanel.vue`, `src/workbench/CanvasStage.vue`
- Test: `tests/layout-background-ui.spec.ts`
- Consume: Task 1 entries and Task 2 store methods

**Interfaces:**
- `layoutBackgroundDragPayload(entry: unknown): { mime: typeof DESIGN_DND_MIME; data: string } | null` validates both `id` and `kind` against `LAYOUT_BACKGROUND_ENTRIES` before serializing only `{ kind: "layout-background" | "layout-asset", id }`.
- `parseLayoutBackgroundDragPayload(raw: string): { kind: "layout-background" | "layout-asset"; id: string } | null` catches malformed JSON and validates the kind/ID pair against that same compile-time list.
- The panel emits a single local entry on card click; the parent calls the matching Task 2 store action. Canvas drop dispatch accepts only validated parser results and calls the same store methods; layout drops always scale to the full canvas, while asset drops use the pointer position.

- [ ] **Step 1: Write failing UI/action tests** — SSR shows “布局底板” with two cards and “背景素材” with three cards; previews are local allow-listed keys; cards are semantic buttons with accessible names and click events; payload MIME/data are exact; malformed JSON and mismatched/unknown kind-ID pairs return `null` and do not dispatch; hostile-looking labels render as escaped text; no-screen state reuses the existing prompt; existing themes/blocks/local image section remains present.
- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run tests/layout-background-ui.spec.ts`
Expected: FAIL because the catalog/actions are absent.

- [ ] **Step 3: Implement catalog actions and the panel** — render static preview templates from the local key allow-list, add the two sections to `DesignLibraryPanel`, and make click/drag share the typed entry mapping.
- [ ] **Step 4: Route canvas drops through the same validated store actions** — preserve existing `component`, `block`, and `design-asset` drop behavior; ignore malformed/unknown new payloads without throwing.
- [ ] **Step 5: Run focused UI and existing workbench tests**

Run: `npm test -- --run tests/layout-background-ui.spec.ts tests/workbench-layout.spec.ts`
Expected: PASS; existing design-library sections and resource-rail behavior remain.

- [ ] **Step 6: Commit the UI and drop-path work**

```bash
git add src/workbench/layoutBackgroundActions.ts src/workbench/components/LayoutBackgroundCatalog.vue src/workbench/panels/DesignLibraryPanel.vue src/workbench/CanvasStage.vue tests/layout-background-ui.spec.ts
git commit -m "feat: add layout background library UI"
```

## Task 4: Offline export and full acceptance

**Files:**
- Modify: `tests/export-snapshot.spec.ts`, `tests/export-e2e.spec.ts`
- Modify: `docs/superpowers/plans/2026-10-30-datav-layout-background-library.md`
- Reuse: existing snapshot allow-list and static renderers; no runtime changes expected.

- [ ] **Step 1: Add failing export coverage** — build a screen using both layout recipes and independent assets; assert package snapshot preserves local shape/component IDs, frames, and safe colors; run the offline runtime and assert panels/title/frame display; assert ZIP and inline HTML contain no external resources/network code and unknown renderer blocking remains.
- [ ] **Step 2: Run focused export tests and confirm the new coverage fails**

Run: `npm test -- --run tests/export-snapshot.spec.ts tests/export-e2e.spec.ts`
Expected: FAIL on missing layout coverage/expected rendered items, not due to unrelated baseline failures.

- [ ] **Step 3: Make the minimum export compatibility adjustment only if needed** — prefer reusing the existing shape and registered component export paths; do not add runtime renderer lookup or change package schema/API. If an approved item type is not already supported, stop and revise the spec before adding a renderer.
- [ ] **Step 4: Run focused export tests and all project verification**

Run: `npm test -- --run tests/export-snapshot.spec.ts tests/export-e2e.spec.ts`
Expected: PASS.

Run: `npm run typecheck && npm test -- --run && npm run build && git diff --check`
Expected: typecheck/build exit 0, all tests PASS, and no whitespace errors. Record exact test-file/test totals in the plan.

- [ ] **Step 5: Mark acceptance complete and commit only this task's files**

```bash
git add tests/export-snapshot.spec.ts tests/export-e2e.spec.ts docs/superpowers/plans/2026-10-30-datav-layout-background-library.md
git commit -m "feat: complete DataV layout background library"
```

### Task 5: Final review and branch handoff

- [ ] **Step 1: Review the diff against the approved spec** — check exact ID allow-lists, group/order behavior, no-schema-change guarantee, local-only previews, and that previous uncommitted background/scrollbar changes are still present but not committed by this feature.
- [ ] **Step 2: Review code and security** — check `git diff --check`; scan new code for external URLs, network APIs, `eval`, `new Function`, and `innerHTML`; record any reviewer-tool limitation instead of claiming an independent review that did not run.
- [ ] **Step 3: Commit plan close-out if any plan-only edits remain** — do not merge or push; ask the user how they want to integrate the current branch.

## Execution

User previously selected **Native** execution and the current branch (`feature/chartforge-datav-lite`). After approving this plan, implement task-by-task with `superpowers:executing-plans`; do not create a worktree, merge, or push without the user's choice.

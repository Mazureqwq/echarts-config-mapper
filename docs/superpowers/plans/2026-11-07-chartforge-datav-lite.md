# ChartForge DataV-lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved “经营概览” vertical slice with a DataV-inspired, application-wide low-code builder experience: versioned built-in components, one shared static/HTTP dataset for a table and KPI, declarative blueprint interactions, a small design library, offline export, and legacy-workspace compatibility. The approved application-wide UI/layout foundation (Task 1.5) is implemented before continuing to dataset Task 2.

**Architecture:** Keep existing chart/text/image/shape item formats and renderers; add a versioned compile-time component registry for new widgets. Establish a shared application shell and DataV-inspired workbench information architecture before dataset editing; persist datasets at workspace scope and blueprints with each screen, feed all component consumers from a shared dataset runtime, and export data snapshots plus statically registered renderer behavior. The first release uses only allow-listed nodes and built-in code—no workspace-provided executable code.

**Tech Stack:** Vue 3.5, TypeScript 5.9, Vite 8, Pinia 3, ECharts 6, Vitest 3; reuse the existing live-data pipeline, storage, image compression, and export infrastructure.

**Spec:** `docs/superpowers/specs/2026-11-07-chartforge-datav-lite-design.md`

## Global Constraints

- Runtime package versions remain Vue `^3.5.30`, TypeScript `~5.9.3`, Vite `^8.0.1`, Pinia `^3.0.4`, ECharts `^6.0.0`, and Vitest `^3.2.4`; no package upgrades are part of this slice.
- The product is for front-end/data developers and is an offline-deliverable, extensible low-code visualization builder.
- First phase is DataV-lite; defer 3D, AI generation, collaboration, database connections, and a plugin market.
- Components are registered and reused by developers; do not add per-screen arbitrary code.
- Reference DataV for application information architecture and authoring workflow, not as an exact visual/brand clone; preserve ChartForge naming, existing data behavior, and offline constraints.
- First-release components are statically/build-time registered and controlled; do not add runtime upload/installation of executable plugins.
- First-release data sources are static data and HTTP API; reuse existing request settings, processing, and persistence where possible.
- Keep editor, preview, presentation, and export behavior/version aligned; old workspaces must continue to open.
- Exported zip and single-file HTML must work offline, have no external dependencies, and not use `eval`, `new Function`, or workspace-supplied scripts.
- Continue using the existing Vue/TypeScript/Vite/Pinia/ECharts/Vitest stack; do not add a runtime dependency for the vertical slice.

## Review Focus

1. A version-1 workspace missing fields introduced by this feature still loads, normalizes, and saves without losing chart/text/image/shape items — pin the migration/default tests in Tasks 2, 4 and 5.
2. An unknown component ID/version remains visible as an explicit missing-component placeholder and blocks export with a useful error; it must not crash or silently disappear — pin in Tasks 1 and 6.
3. Two consumers of one HTTP dataset cause one request per refresh; a later request failure reports stale/error while retaining the last good rows — pin in Task 2.
4. A blueprint with unknown node kinds, dangling edges, or a cycle is rejected with a readable validation result and executes no partial side effects — pin in Task 4.
5. User-controlled labels, cell values, asset content, and URLs cannot inject script or cause an external request in the exported artifact — pin in Tasks 5 and 6.
6. The desktop builder keeps assets/layers discoverable on the left, the canvas central, and contextual configuration/data/interaction on the right; narrow layouts collapse panels cleanly and navigation exposes no dead links — pin in Task 1.5 and the owning feature tasks.

---

## File Map

- `src/core/model/types.ts`, `schema.ts`, `migrate.ts`: serializable component/workspace and dataset/design-asset shapes plus backward-compatible normalization; dataset fields enter in Task 2, blueprint fields in Task 4, and design assets/theme references in Task 5.
- `src/core/components/types.ts`, `registry.ts`, `builtins.ts`: compile-time component contracts and version-keyed registry; old item kinds remain on their current path.
- `src/core/data/datasetRuntime.ts`: static/HTTP dataset subscription, processing, snapshots, and consumer fan-out over existing `LiveExecutor`/pipeline.
- `src/stores/workspaceStore.ts`, `src/stores/documentStore.ts`: component item creation/update, then dataset/design-resource persistence and screen-level blueprint/theme references in their owning tasks.
- `src/workbench/ItemView.vue`, `CanvasStage.vue`, `ElementsPanel.vue`, `InspectorPanel.vue`, `LeftPanel.vue`, `WorkbenchView.vue`: integrate components, data binding, blueprints and design library with the existing workbench.
- `src/shared/ui/AppHeader.vue`, `src/views/LibraryView.vue`, `ChartsView.vue`, `src/workbench/TopBar.vue`, `src/style/index.css`: establish the shared app shell, consistent resource-page navigation, and workbench design tokens in Task 1.5.
- `src/workbench/components/DataTableWidget.vue`, `KpiWidget.vue`, `ComponentInspector.vue`: first registered widget implementations and schema-driven settings.
- `src/core/blueprint/types.ts`, `validate.ts`, `runner.ts`: JSON graph, allow-listed node/action contracts, validation and deterministic execution.
- `src/workbench/BlueprintEditor.vue`: node/edge editing UI backed only by the serializable blueprint model.
- `src/core/design/types.ts`, `library.ts`, `assets.ts`: built-in themes/blocks/assets and workspace asset validation.
- `src/workbench/panels/DatasetPanel.vue`: create/edit/preview shared datasets; `DesignLibraryPanel.vue`: browse/apply/insert assets, components, blocks and themes.
- `src/core/export/model.ts`, `snapshot.ts`, `runtime.ts`, `artifact.ts`: package component/dataset snapshots, statically registered export renderers, safe offline runtime and publish validation.
- Tests are added to the existing `tests/*.spec.ts` Vitest structure; no parallel test framework.

## Task 1: Versioned component contract and backward-compatible workspace model

**Files:**
- Create: `src/core/components/types.ts`, `src/core/components/registry.ts`, `src/core/components/builtins.ts`
- Modify: `src/core/model/types.ts`, `src/core/model/schema.ts`, `src/core/model/migrate.ts`, `src/workbench/ItemView.vue`, `src/core/export/snapshot.ts`
- Test: `tests/core-registry.spec.ts`, `tests/core-model.spec.ts`, `tests/core-migrate.spec.ts`, `tests/item-view.spec.ts`, `tests/export-snapshot.spec.ts`

**Interfaces:**
- `ComponentItem`: `{ kind: "component"; id: string; name: string; frame: Frame; componentId: string; componentVersion: number; props: Record<string, unknown>; dataBinding?: DatasetBinding }`.
- `ComponentProp` is `{ key: string; label: string; type: "string" | "number" | "boolean" | "select"; defaultValue: unknown; options?: readonly string[] }`; `ComponentEvent` is `{ name: string; payloadFields: Readonly<Record<string, "string" | "number" | "boolean" | "object">> }`; `ComponentAction` is `{ name: string; payloadFields: Readonly<Record<string, "string" | "number" | "boolean" | "object">> }` (same JSON-safe field schema as events, so object-valued `setProps` payloads are representable).
- `ComponentDefinition` (with `import type { Component } from "vue"`): `{ id: string; version: number; name: string; category: string; defaultFrame: Frame; defaults: Record<string, unknown>; props: readonly ComponentProp[]; events: readonly ComponentEvent[]; actions: readonly ComponentAction[]; renderer: { kind: "vue"; view: Component } | { kind: "legacy"; itemKind: "chart" | "text" | "image" | "shape" }; exportRendererId: string }`. `builtins.ts` registers four `legacy.*@1` adapters pointing at existing item kinds; these and the table/KPI definitions declare `setVisibility` and `setProps` action ports.
- `createComponentItem(definition: ComponentDefinition, frame?: Partial<Frame>): ComponentItem` clones the registered defaults and combines `DEFAULT_FRAME`, the definition default frame, and caller overrides.
- `createComponentRegistry(definitions: readonly ComponentDefinition[]): ComponentRegistry`; `ComponentRegistry.get(id: string, version: number): ComponentDefinition | undefined`; `ComponentRegistry.list(): readonly ComponentDefinition[]`. Duplicate `(id, version)` registration throws; the registry is immutable after construction.
- `DatasetBinding` is `{ datasetId: string; fields?: { category?: string; value?: string; seriesField?: string }; filterBy?: { field: string; globalVariable: string } }`; `fields` supports legacy chart adapters and `filterBy` is resolved from screen variables.
- Keep the workspace format unchanged in this task; do not make the component-registry task depend on dataset, blueprint, or design-library types that arrive in later tasks.

- [x] **Step 1: Write failing contract and compatibility tests** — assert duplicate registration throws; exact-version lookup is stable; all four legacy adapter IDs resolve; `createComponentItem` copies defaults and frame; old item kinds survive a normalize/migrate round-trip; `ItemView` renders a named placeholder for an unknown component version; export snapshot rejects component items without an export renderer.
- [x] **Step 2: Run the focused tests** — `npm test -- --run tests/core-registry.spec.ts tests/core-model.spec.ts tests/core-migrate.spec.ts tests/item-view.spec.ts tests/export-snapshot.spec.ts`; expect failures for missing component contracts/fields.
- [x] **Step 3: Implement registry and model normalization** — add the contracts and immutable registry, register legacy-kind adapters without converting stored items, and add `ComponentItem` and `createComponentItem` without changing existing item discriminators; keep missing component instances so the view can show the placeholder. Until an export renderer contract is implemented in Task 6, reject component items in `snapshot.ts` rather than serializing them as shapes.
- [x] **Step 4: Integrate registry resolution in `ItemView.vue`** — route old item kinds through their `legacy` adapter while preserving existing render branches; resolve generic component items by exact ID/version and render registered `renderer.view`, otherwise show the placeholder with component ID/version and no throw.
- [x] **Step 5: Re-run focused tests and existing model/migration tests** — expect all PASS, including factory/default-copy, legacy item round-trip, placeholder rendering, and export rejection.
- [x] **Step 6: Commit** — `feat: add versioned component model and registry` (commit `27ce17d`).

## Task 1.5: DataV-inspired application shell and workbench information architecture (approved; complete in `57f9802`)

This UI foundation is deliberately inserted between completed Task 1 and Task 2 without renumbering the approved feature tasks. It makes the whole application feel like a coherent low-code builder while leaving DataV branding/assets out of scope. Dataset, blueprint and design-library entries become active only when their owning tasks provide working views.

**Files:**
- Modify: `src/shared/ui/AppHeader.vue`, `src/views/LibraryView.vue`, `src/views/ChartsView.vue`, `src/views/WorkbenchView.vue`, `src/workbench/TopBar.vue`, `src/workbench/LeftPanel.vue`, `src/workbench/InspectorPanel.vue`, `src/style/index.css`
- Test: `tests/workbench-layout.spec.ts`, `tests/app-header.spec.ts`, `tests/shared-collection-ui.spec.ts`

**Layout contract:**
- Shared application shell gives existing screen/chart/settings pages a consistent brand, active navigation, page header and resource controls; do not show links to unimplemented routes.
- The workbench uses a compact top action bar, a narrow left tool rail with a contextual panel (components/assets/layers now; datasets and variables in their owning tasks), a centered canvas, and a right inspector with `配置 / 数据 / 交互` sections. Existing configuration and data controls remain reachable; no user capability is removed.
- Blueprint editing later reuses the same shell and gets an explicit canvas/blueprint mode switch in Task 4. Dataset and design-library surfaces are attached to the established panel/navigation slots in Tasks 2 and 5.
- Use dark neutral editor chrome and consistent tokens; keep the actual screen theme/background on the canvas. Resource pages may use a light content surface but share the same navigation, typography, cards and controls.
- At desktop widths keep both side panels and the canvas usable; at narrower widths allow panels to collapse without covering or clipping the canvas. Preview/presentation hide editor chrome.

- [x] **Step 1: Write failing UI-contract tests** — assert active top-level navigation, editor region landmarks, contextual panel tabs, resource-page header consistency, keyboard labels/focus, and collapsed-panel behavior at narrow widths.
- [x] **Step 2: Run focused UI tests** — `npm test -- --run tests/workbench-layout.spec.ts tests/app-header.spec.ts tests/shared-collection-ui.spec.ts`; expect the new layout assertions to fail before the refactor.
- [x] **Step 3: Implement the shared workbench shell** — refactor `WorkbenchView`, `TopBar`, `LeftPanel` and `InspectorPanel` into the layout contract while retaining existing interactions and keeping dataset/blueprint/design-library entries disabled or hidden until their routes/panels work.
- [x] **Step 4: Align whole-app navigation and resource pages** — update `AppHeader`, `LibraryView` and `ChartsView` to use the same navigation hierarchy, page header, filter bar and responsive tokens; do not change collection CRUD semantics.
- [x] **Step 5: Verify the existing editor flows** — check that chart/text/image/shape insertion, selection, frame/style editing, data editing, save, preview and export controls remain available; run focused UI and existing collection tests.
- [x] **Step 6: Run `npm run typecheck`, `npm test -- --run` and `npm run build`** — expect all existing and new tests to pass.
- [x] **Step 7: Commit** — `feat: establish DataV-inspired application layout` (commit `57f9802`).

## Task 2: Shared static/HTTP dataset runtime and workspace editing

**Files:**
- Create: `src/core/data/datasetRuntime.ts`, `src/workbench/panels/DatasetPanel.vue`, `tests/dataset-runtime.spec.ts`
- Modify: `src/core/model/types.ts`, `src/core/model/schema.ts`, `src/core/live/pipeline.ts`, `src/stores/workspaceStore.ts`, `src/workbench/LeftPanel.vue`
- Test: `tests/data-hub.spec.ts`, `tests/pipeline.spec.ts`, `tests/stores.spec.ts`

**Interfaces:**
- Define `DatasetPipeline = Pick<LiveSource, "filter" | "select" | "sort" | "limit">` in `src/core/model/types.ts`; change `runPipeline(raw: unknown, pipeline?: DatasetPipeline): PipelineResult` so existing `LiveSource` callers remain structurally compatible.
- `DatasetDefinition`: `{ id: string; name: string; source: { kind: "static"; data: unknown } | { kind: "http"; live: Omit<LiveSource, "filter" | "select" | "sort" | "limit" | "map"> }; parameters?: Record<string, string>; pipeline?: DatasetPipeline }`. Persist it as `Workspace.datasets: DatasetDefinition[]`; set `Workspace.version` to 2 and make `migrate()` accept both v1 and v2, defaulting missing datasets in either input version to `[]`.
- `DatasetSnapshot`: `{ status: "idle" | "loading" | "success" | "stale" | "error"; rows: Row[]; error?: string; updatedAt?: number }`.
- `DatasetRuntime.subscribe(datasetId: string, consumerId: string, listener: (snapshot: DatasetSnapshot) => void): () => void`; `setParameters(datasetId: string, parameters: Record<string, string>): void`; `setFilter(datasetId: string, filter: LiveSource["filter"]): void`; `refresh(datasetId: string): Promise<void>`; `dispose(): void`. HTTP requests merge `DatasetDefinition.parameters` over source query values. Blueprint filter actions resolve their global variable and pass a typed equality filter to `setFilter`.
- Reuse `DataHub`/`LiveExecutor` and `runPipeline`; one runtime subscription per dataset, then fan out the processed rows to consumers. Static datasets emit immediately. HTTP failure retains last successful rows and reports stale/error.

- [x] **Step 1: Write failing runtime tests** — `shares_one_http_request_between_consumers`, `retains_last_successful_rows_after_failure`, `emits_static_rows_without_fetch`, and `applies_dataset_pipeline_before_fanout`; assert both listeners see the same processed rows and request count is one.
- [x] **Step 2: Run `npm test -- --run tests/dataset-runtime.spec.ts`** — expect missing-module failures.
- [x] **Step 3: Implement dataset model and `DatasetRuntime`** — bump persisted workspace format to 2, migrate v1 and v2 inputs while preserving old items, default missing datasets to `[]`, adapt existing `LiveExecutor` updates into one dataset snapshot, and use the existing pipeline for filtering/select/sort/limit. Keep one runtime per workspace/presentation session and dispose it at teardown.
- [x] **Step 4: Add workspace-store dataset CRUD and `DatasetPanel.vue`** — create/edit/delete static and HTTP datasets, reuse request settings and live-source validation, show response preview plus loading/success/stale/error state, and persist through existing workspace save/import/export.
- [x] **Step 5: Run focused and regression tests** — `npm test -- --run tests/dataset-runtime.spec.ts tests/data-hub.spec.ts tests/pipeline.spec.ts tests/stores.spec.ts`; expect PASS with no regressions.
- [x] **Step 6: Commit** — `feat: add reusable workspace datasets` (`f200e78`).

## Task 3: Registered table/KPI widgets and field bindings

**Files:**
- Create: `src/workbench/components/DataTableWidget.vue`, `KpiWidget.vue`, `ComponentInspector.vue`, `tests/data-widgets.spec.ts`
- Modify: `src/core/components/builtins.ts`, `src/workbench/ItemView.vue`, `src/workbench/ElementsPanel.vue`, `src/workbench/InspectorPanel.vue`, `src/stores/documentStore.ts`, `src/stores/workspaceStore.ts`

**Interfaces:**
- Register `chartforge.data-table@1` and `chartforge.kpi@1`; both use `ComponentItem`, subscribe through `DatasetRuntime` using the item’s `dataBinding.datasetId`, and declare the `rowSelect`/`setVisibility`/`setProps` ports used by the blueprint runner.
- `ComponentRenderProps`: `{ item: ComponentItem; snapshot: DatasetSnapshot; rows: Row[]; variables: Readonly<Record<string, unknown>>; emitEvent(name: string, payload: unknown): void }`. `ItemView` subscribes to the item dataset and applies `dataBinding.filterBy` to rows using the screen runtime variables before rendering the registered view; it passes declared events through `emitEvent`. Add `buildChartDataFromRows(rows: Row[], map: PipelineMap | undefined, type: ChartType): ChartDataResult` and use it for bound legacy charts.
- Table props: `{ columns: Array<{ field: string; label: string; format: "text" | "number" | "percent"; width?: number; align?: "left" | "center" | "right" }>; rowKey?: string; striped?: boolean }`; emits the declared `rowSelect` event with `{ row: Row; index: number }`. The dataset filter uses `dataBinding.filterBy`, not an executable expression.
- KPI props: `{ valueField: string; label: string; format: "number" | "currency" | "percent"; aggregation: "first" | "sum" | "average" }`; binding supports optional `{ field: string; globalVariable: string }` filter. Add optional `dataBinding` to `ChartItem`; when present it takes precedence over legacy `spec.source` and uses `DatasetRuntime` plus `fields` mapping and the same global-variable filter. Without `dataBinding`, legacy chart data flow stays unchanged.
- `ComponentInspector` edits only registered `props` and declared data bindings; unknown/invalid props are ignored by normalizers, not executed.

- [ ] **Step 1: Write failing widget and binding tests** — assert table field mapping/order/format, row selection payload, KPI aggregation/format, and a chart bound to the same dataset updates with the KPI when the row-select blueprint variable changes.
- [ ] **Step 2: Run `npm test -- --run tests/data-widgets.spec.ts`** — expect the new behavior to fail before implementation.
- [ ] **Step 3: Implement both Vue widgets as pure renderers of props + dataset snapshot** — do not fetch from widgets; represent loading, stale, error and empty states consistently.
- [ ] **Step 4: Register the widgets and connect the elements/inspector flows** — create default frames/props, edit schema fields and dataset bindings for widgets/charts, preserve existing `DataTablePanel.vue` as the chart data editor, and unsubscribe widget listeners when items/datasets change or unmount.
- [ ] **Step 5: Run widget tests and relevant workbench/model tests** — expect all PASS; existing chart editor tests remain unchanged.
- [ ] **Step 6: Commit** — `feat: add registered table and KPI widgets`.

## Task 4: Declarative blueprint model, safe runner and node editor

**Files:**
- Create: `src/core/blueprint/types.ts`, `validate.ts`, `runner.ts`, `src/workbench/BlueprintEditor.vue`, `tests/blueprint.spec.ts`
- Modify: `src/core/model/types.ts`, `src/core/model/schema.ts`, `src/workbench/WorkbenchView.vue`, `src/workbench/CanvasStage.vue`, `src/workbench/components/DataTableWidget.vue`, `src/stores/documentStore.ts`

**Interfaces:**
- Add optional `Screen.blueprint: BlueprintGraph`; normalize missing values to `{ nodes: [], edges: [], variables: [] }` so migrated version-1 screens open unchanged. `BlueprintGraph`: `{ nodes: BlueprintNode[]; edges: Array<{ id: string; from: { nodeId: string; port: string }; to: { nodeId: string; port: string } }>; variables: Array<{ name: string; type: "string" | "number" | "boolean" | "object"; initialValue: unknown }> }`. `ValueRef` is `{ source: "literal"; value: unknown } | { source: "event"; path: string } | { source: "variable"; name: string }`. `BlueprintNode` is the union: `{ id: string; kind: "componentEvent"; componentId: string; componentVersion: number; event: string }`; `{ id: string; kind: "setVariable"; name: string; value: ValueRef }`; `{ id: string; kind: "condition"; left: ValueRef; op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains"; right: ValueRef }`; `{ id: string; kind: "fieldTransform"; input: ValueRef; op: "toNumber" | "toString" | "uppercase" | "lowercase"; outputVariable: string }`; `{ id: string; kind: "datasetAction"; action: "filter"; datasetId: string; field: string; globalVariable: string } | { id: string; kind: "datasetAction"; action: "setParams"; datasetId: string; params: Record<string, ValueRef> } | { id: string; kind: "datasetAction"; action: "refresh"; datasetId: string }`; `{ id: string; kind: "componentAction"; action: "setVisibility"; componentId: string; componentVersion: number; visible: boolean } | { id: string; kind: "componentAction"; action: "setProps"; componentId: string; componentVersion: number; props: Record<string, unknown> }`; `{ id: string; kind: "navigateScreen"; screenId: string }`. Event nodes accept only declared component events; condition output ports are `true` and `false`; other nodes use `next`.
- `validateBlueprint(graph: BlueprintGraph, registry: ComponentRegistry): { ok: true } | { ok: false; errors: string[] }`; component action nodes must match action names and payload schemas declared by the exact registered component version. `runBlueprint(graph: BlueprintGraph, trigger: { componentId: string; componentVersion: number; event: string; payload: unknown }, context: BlueprintContext): Promise<BlueprintResult>` first validates the entire graph, then executes its reachable nodes in deterministic topological order using fixed operators/actions only. `BlueprintContext` methods: `getVariable(name: string): unknown`, `setVariable(name: string, value: unknown): void`, `setDatasetFilter(datasetId: string, field: string, value: unknown): void`, `setDatasetParameters(datasetId: string, parameters: Record<string, string>): void`, `refreshDataset(datasetId: string): Promise<void>`, `setComponentVisibility(componentId: string, componentVersion: number, visible: boolean): void`, `setComponentProps(componentId: string, componentVersion: number, props: Record<string, unknown>): void`, and `navigateScreen(screenId: string): void`; it never evaluates strings as code.

- [ ] **Step 1: Write failing graph tests** — cover table `rowSelect` → `setVariable` → dataset filter; condition true/false branches; field transform; refresh/parameter action; component visibility/config action; unknown kind, unknown event/action, dangling edge, and cycle rejection with zero effects.
- [ ] **Step 2: Run `npm test -- --run tests/blueprint.spec.ts`** — expect missing APIs or validation failures.
- [ ] **Step 3: Implement typed graph validation and runner** — reject invalid graphs before executing any node; use a fixed operator/action switch and never `eval`/`Function`.
- [ ] **Step 4: Add the blueprint canvas UI** — node palette, connect/disconnect edges, edit typed node settings and variables, validate before save; include only the node kinds defined above.
- [ ] **Step 5: Connect component events and runtime actions** — keep per-screen runtime variables in a reactive workbench record initialized from graph defaults; dispatch table selection through the declared versioned event port and apply runner variable/dataset/component updates to that record and workspace.
- [ ] **Step 6: Run blueprint tests and workbench tests** — expect PASS, including legacy screens with no blueprint.
- [ ] **Step 7: Commit** — `feat: add safe blueprint interactions`.

## Task 5: Design library, themes, blocks and bounded assets

**Files:**
- Create: `src/core/design/types.ts`, `library.ts`, `assets.ts`, `src/workbench/panels/DesignLibraryPanel.vue`, `tests/design-library.spec.ts`
- Modify: `src/core/model/types.ts`, `src/core/model/schema.ts`, `src/workbench/LeftPanel.vue`, `src/workbench/CanvasStage.vue`, `src/stores/workspaceStore.ts`, `src/core/export/snapshot.ts`

**Interfaces:**
- Add normalized `Workspace.designAssets: DesignAsset[]` (default `[]`) and optional `Screen.themeId`; define `ThemeKit` and `ComponentBlock` in `src/core/design/types.ts`, with `ComponentBlock.items` typed as `ScreenItem[]`. `ThemeKit`: `{ id: string; name: string; tokens: { canvas: string; panel: string; text: string; accent: string; chartPalette: string[]; titleStyle: Record<string, string>; borderStyle: Record<string, string> } }`; applying one persists `Screen.themeId` and applies tokens to the canvas, widgets and chart palette as defaults without changing item geometry or overriding explicit item styles.
- Define `DesignAsset` in `src/core/model/types.ts` as `{ id: string; name: string; mime: "image/svg+xml" | "image/png" | "image/webp"; dataUrl: string; bytes: number }`; maximum 2 MiB per asset and 20 MiB total per workspace; sanitize SVG before storage and reuse current raster compression where applicable.
- Persist design assets in the normalized workspace; inserting one creates an `ImageItem` with `src` set to its sanitized data URL and `sourceDesignAssetId` set to the library ID. Add optional `ImageItem.sourceDesignAssetId?: string`. Define `ComponentBlock` as `{ id: string; name: string; version: number; items: ScreenItem[] }`; inserting a block clones item IDs and offsets frames; it does not overwrite existing items.
- Ship two built-in themes (`monitor-dark`, `business-light`) and two blocks (a title/panel block and a KPI group). Package only assets referenced by the exported screen; no external URLs.

- [ ] **Step 1: Write failing design-library tests** — assert both theme IDs/tokens exist, block insertion creates unique IDs, oversized/unsupported assets are rejected, SVG script/event attributes, `foreignObject`, external href/src and CSS `url()` references are removed, and unreferenced assets are not packaged.
- [ ] **Step 2: Run `npm test -- --run tests/design-library.spec.ts`** — expect missing library APIs.
- [ ] **Step 3: Implement library types, built-ins, asset sanitizer and quota validation** — add the workspace `designAssets` default without another schema-version bump; use data URLs for workspace-local assets and existing compression utilities for raster images.
- [ ] **Step 4: Add design library UI** — expose assets, registered components, blocks and themes; apply a theme to the selected screen, insert a block, and drag/click assets or components into the canvas through existing item-creation flows.
- [ ] **Step 5: Run design tests and existing image/storage tests** — expect PASS; invalid assets fail with a user-readable message without altering workspace state.
- [ ] **Step 6: Commit** — `feat: add themes and reusable design blocks`.

## Task 6: Offline package/runtime integration and vertical-slice acceptance

**Files:**
- Modify: `src/core/export/model.ts`, `snapshot.ts`, `runtime.ts`, `artifact.ts`, `src/core/export/index.ts`, `src/workbench/WorkbenchView.vue`
- Test: `tests/export-snapshot.spec.ts`, `tests/export-artifact.spec.ts`, `tests/export-e2e.spec.ts`, `tests/core-migrate.spec.ts`

**Interfaces:**
- Add `PackageDataset: { id: string; rows: Row[] }` (never include source URL, request headers, body or parameters), `PackageComponentItem: { kind: "component"; id: string; name: string; frame: Frame; opacity: number; componentId: string; componentVersion: number; props: Record<string, unknown>; dataBinding?: DatasetBinding }`, and `PackageScreen.blueprint?: BlueprintGraph`; add only selected-screen referenced entries to `PackagePayload.datasets: PackageDataset[]`. Extend `PackagePayload` with normalized dataset row snapshots and versioned component records; export the last successful rows for stale datasets and add a warning when stale data is used. Add optional `dataBinding` to `PackageChartItem`; for bound charts, package `dataBinding` and the style/config template with the same snapshot; the offline runtime re-filters/remaps rows and calls ECharts `setOption` after blueprint variables change, rather than freezing only the initial chart option.
- Preserve the existing `buildPackagePayload(workspace: Workspace, screenIds: string[], options: ExportOptions = {}): PackagePayload` API; add `datasetSnapshots?: ReadonlyMap<string, DatasetSnapshot>` to `ExportOptions`. The builder rejects missing component renderer versions and records only referenced sanitized local assets (assets are embedded through the corresponding image item; unused workspace assets are omitted).
- `RUNTIME_CODE` statically registers table/KPI renderers and blueprint actions; DOM output uses safe node creation and `textContent`, and runtime asset/data URLs are filtered. No request is made by an offline artifact.

- [ ] **Step 1: Write failing export tests** — assert table selection in offline HTML updates KPI and bound-chart views through the same dataset snapshot; stale snapshot warning; no source URL/header/token/body is included; missing component version blocks export; unbound legacy chart/text/image/shape export remains unchanged; no external asset URL or executable user source.
- [ ] **Step 2: Run focused export tests** — `npm test -- --run tests/export-snapshot.spec.ts tests/export-artifact.spec.ts tests/export-e2e.spec.ts`; expect failures for component/dataset packages.
- [ ] **Step 3: Extend snapshot model and package builder** — serialize current component versions, datasets, blueprint state and only referenced sanitized assets; preserve existing export format handling and clear errors.
- [ ] **Step 4: Implement static offline widget rendering** — add table/KPI rendering, bound-chart row filtering/mapping and allow-listed blueprint effects to `RUNTIME_CODE`; update charts with ECharts `setOption`; use DOM APIs and text nodes only, with no eval/new Function/innerHTML and no external requests.
- [ ] **Step 5: Run full acceptance suite** — `npm run typecheck && npm test -- --run && npm run build`; expect clean type-check, all tests PASS and successful production build.
- [ ] **Step 6: Verify exported artifacts** — run the E2E test against both zip and single-file HTML; assert rendering works without network access and output contains neither `eval(` nor `new Function` nor external resource references. For these offline modes, reject or replace external HTTP image/background URLs with a visible warning; do not retain an external URL even for legacy items.
- [ ] **Step 7: Commit** — `feat: export DataV-lite screens for offline use`.

## Vertical-Slice Acceptance Checklist

- [ ] Static and HTTP datasets can be created and previewed; one HTTP dataset is requested once and shared by the table, KPI and dataset-bound chart.
- [ ] Table fields/formatting and KPI aggregation are configurable; selecting a table row changes a global variable and filters the KPI/chart through the blueprint.
- [ ] The monitor-dark or business-light theme and one/two reusable blocks can be applied to the example screen.
- [ ] Editing, preview, presentation, zip export and single-file HTML use the same component versions and data snapshot.
- [ ] A legacy workspace containing chart/text/image/shape items opens and exports without data loss.
- [ ] All five Review Focus cases have automated tests.

# ChartForge 第二阶段（大屏拼装）· Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task（本环境无子代理，由主会话按任务顺序执行）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按《图表工作台-第二阶段方案》把大屏拼装补齐：图表资产库（保存/检索/拖拽源）、大屏内多图表副本、图表聚焦编辑、对齐与等距分布、图表类型切换、视图快捷键，并保持旧数据兼容。

**Architecture:** 复用现有数据模型 `Workspace.assets`（图表资产）+ `Workspace.screens`（大屏），只给 `ChartAsset` 补可选元信息字段；不新增集合、不改 localStorage key、不做资产→大屏强引用（一律深拷贝副本）。

**Tech Stack:** Vue 3.5 + TypeScript 5.9 + Vite 8 + Pinia 3 + Element Plus + ECharts 6 + Vitest 3（沿用，不新增依赖；界面中文）。

**Spec:** `docs/图表工作台-第二阶段方案.md`

## Global Constraints

- 不新增依赖；图片压缩继续用 `src/core/storage/imageCompress.ts`。
- `localStorage` key `chartforge.workspace.v1` 不变；`Workspace.version` 仍为 `1`；旧数据必须能打开。
- 除补充可选字段外，不改 `Screen` / `ScreenItem` / `ChartSpec` 结构。
- 图表项一律深拷贝副本，不写 `assetId` 强引用；可选 `sourceName` 仅展示。
- 大屏提交到当前分支 `feature/major-update`；`src/assets/screens/`（无关未跟踪产物）不纳入提交。
- 质量门：`pnpm typecheck`、`pnpm test`、`pnpm build` 全过后才提交。

## Review Focus

1. **资产元信息兼容**：既存 `assets` 无 `category/tags/defaultSize` 时 `normalizeWorkspace` 不报错、筛选「未分类」正常。→ T1 用例。
2. **副本语义**：拖入后修改大屏内图表，`assets` 中的 source 不得变化（深拷贝断言）。→ T2 用例。
3. **越界与缩画布**：拖入落在画布边缘时被 clamp；缩小画布两种策略结果可断言。→ 既有用例 + T2 新增。
4. **命名冲突**：同名图表重复拖入生成「副本2/3」而非覆盖。→ T2 用例。
5. **演示与编辑隔离**：`/play/:id` 不渲染任何编辑 UI；退出后编辑状态保留。→ T7 手动清单。

---

## File Structure

| 文件 | 变化 | 职责 |
|---|---|---|
| `src/core/model/types.ts` | 改 | `ChartAsset` 增 `category?/tags?/defaultSize?` |
| `src/core/model/schema.ts` | 改 | `normalizeWorkspace` 兜底新字段；`DEFAULT_ASSET_NAME` 常量 |
| `src/stores/documentStore.ts` | 改 | `saveChartAsAsset`、`placeAsset(id, frame?)`、`renameWithSuffix`、`restoreChartType` |
| `src/stores/workspaceStore.ts` | 改 | `duplicateAsset` / `removeAsset` / `updateAssetMeta` |
| `tests/stores.spec.ts`、`tests/core-model.spec.ts` | 改 | 资产元信息、副本语义、命名与越界用例 |
| `src/views/ChartsView.vue` | 新建 | 图表资产库页（列表/筛选/编辑信息/复制/删除） |
| `src/router/index.ts` | 改 | 新增 `/charts` 路由 |
| `src/workbench/panels/AssetLibraryPanel.vue` | 新建 | 左栏「图表库」tab：搜索 + 筛选 + 缩略图拖拽源 |
| `src/workbench/LeftPanel.vue` | 改 | 四个 tab：图表类型 / 图表库 / 素材 / 图层 |
| `src/workbench/CanvasStage.vue` | 改 | 接受 `chart-asset` 拖放载荷；双击进入聚焦编辑 |
| `src/workbench/InspectorPanel.vue` | 改 | 图表头部类型下拉（`changeChartType`）、「保存到图表库」入口、聚焦态样式 |
| `src/workbench/panels/ChartConfigPanel.vue` | 改 | 类型下拉联动 spec 重建 |
| `src/shared/ui/AlignToolbar.vue` | 新建 | 多选对齐 / 等距分布工具条 |
| `src/stores/documentStore.ts` | 改 | `alignItems` / `distributeItems` |
| `src/workbench/TopBar.vue` | 改 | 「保存到大屏库」按钮与快捷键提示 |
| `src/views/PlayView.vue` | 改 | 大屏多图表渲染核对（应无需改动，仅走查） |

---

### Task 1: 数据层——图表资产元信息与规范化

**Files:** Modify `src/core/model/types.ts`、`src/core/model/schema.ts`；Test `tests/core-model.spec.ts`。

**Interfaces:**
- `ChartAsset { ...; category?: string; tags?: string[]; defaultSize?: { w: number; h: number } }`
- `normalizeWorkspace` 对 `assets[].category/tags/defaultSize` 兜底（缺失 → `undefined`；`tags` 过滤非字符串）

- [ ] **Step 1: 写失败测试**
  ```ts
  it("normalizeWorkspace 解析资产元信息，缺失时为空", () => {
    const ws = normalizeWorkspace({
      version: 1, screens: [],
      assets: [
        { id: "a", name: "销售趋势", spec: { type: "line" }, category: "折线图", tags: ["销售", 1], defaultSize: { w: 800, h: 400 } },
        { id: "b", name: "无元信息", spec: { type: "bar" } },
      ],
    });
    expect(ws.assets[0].category).toBe("折线图");
    expect(ws.assets[0].tags).toEqual(["销售"]);
    expect(ws.assets[0].defaultSize).toEqual({ w: 800, h: 400 });
    expect(ws.assets[1].category).toBeUndefined();
    expect(ws.assets[1].tags).toBeUndefined();
  });
  ```
- [ ] **Step 2: 跑测试确认失败** — Run `run_tests`(`tests/core-model.spec.ts`) → Expected: FAIL（字段未定义）
- [ ] **Step 3: 实现** — `types.ts` 增三个可选字段；`schema.ts` 在 `normalizeAsset` 中按既有 `normalizeScreen` 同风格兜底（`defaultSize` 需 `w/h ≥ 1` 且为有限数，否则丢弃）
- [ ] **Step 4: 跑测试通过** — Run `run_tests` → Expected: 全 PASS
- [ ] **Step 5: Commit** — `git add src/core/model tests/core-model.spec.ts; git commit -m "feat: 图表资产元信息（分类/标签/默认尺寸）与规范化"`

---

### Task 2: 数据层——保存图表为资产与放置副本

**Files:** Modify `src/stores/documentStore.ts`、`src/stores/workspaceStore.ts`；Test `tests/stores.spec.ts`。

**Interfaces:**
- `saveChartAsAsset(itemId: string, meta: { name: string; category?: string; tags?: string[]; thumbnail?: string }): string | null`
- `placeAsset(assetId: string, frame?: Partial<Frame>): string`（返回新 item id；缺省取 `defaultSize` 居中）
- `renameWithSuffix(base: string, existing: string[]): string`（`X` → `X 副本2` → `X 副本3`）
- `workspaceStore.duplicateAsset(id)` / `updateAssetMeta(id, meta)` / `removeAsset(id)`

- [ ] **Step 1: 写失败测试**
  ```ts
  it("saveChartAsAsset 保存当前图表为资产且之后互不影响", () => {
    const { doc, screen } = seedScreen();
    const id = doc.addChart("line");
    const assetId = doc.saveChartAsAsset(id, { name: "销售趋势", category: "折线图", tags: ["销售"] });
    expect(assetId).toBeTruthy();
    const asset = useWorkspaceStore().workspace.assets.find((a) => a.id === assetId)!;
    expect(asset.spec).not.toBe(screen.items[0].spec);   // 深拷贝
    (screen.items[0] as ChartItem).spec.type = "bar";
    expect(asset.spec.type).toBe("line");
  });

  it("placeAsset 生成副本、重名追加副本序号、并落在画布内", () => {
    const { doc, screen } = seedScreen();
    doc.addChart("line");
    const assetId = doc.saveChartAsAsset(screen.items[0].id, { name: "销量" })!;
    const a = doc.placeAsset(assetId);
    const b = doc.placeAsset(assetId, { x: 1800, y: 1000 });
    const placed = screen.items.filter((i) => i.id === a || i.id === b);
    expect(placed).toHaveLength(2);
    expect(new Set([a, b]).size).toBe(2);
    expect(placed.map((i) => i.name)).toEqual(["销量 副本2", "销量 副本3"]);
    for (const item of placed) {
      expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(screen.canvas.width);
      expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(screen.canvas.height);
    }
  });
  ```
- [ ] **Step 2: 跑测试确认失败** — Expected: FAIL（方法不存在）
- [ ] **Step 3: 实现** — 深拷贝用现有 `deepClone`；`placeAsset` 复用 `addItem`（自带 clamp 与选中）；命名用 `renameWithSuffix`
- [ ] **Step 4: 跑测试通过** + `pnpm typecheck`
- [ ] **Step 5: Commit** — `git commit -m "feat: 图表保存为资产与资产放置为副本"`

---

### Task 3: 图表资产库页（`/charts`）

**Files:** Create `src/views/ChartsView.vue`；Modify `src/router/index.ts`。

**Interfaces:** 消费 T1/T2 的 `workspaceStore.duplicateAsset/updateAssetMeta/removeAsset`、`exportJson`；产出路由 `charts`。

- [ ] **Step 1: 实现**
  - 卡片网格：缩略图（无则显示图表类型名）、名称、类型、分类/标签 chips。
  - 工具栏：「搜索」（名称/标签包含匹配，大小写不敏感）、「分类」select（全部 + 6 类 + 未分类）、标签 chips 筛选。
  - 卡片操作：编辑信息（名称/分类/标签）、复制、导出 JSON、删除（`ConfirmDialog` 确认）。
  - 空态：「还没有图表资产，先在某个大屏里做一张图再保存到图表库」。
  - 拖拽源：卡片 `draggable`，`dragover` 时设置 `dataTransfer.setData("application/x-chartforge-asset", asset.id)`。
- [ ] **Step 2: 验证** — `pnpm typecheck` + `pnpm build`；手动：搜索、筛选、复制、改名、删除均生效；`/charts` 直达刷新不 404（hash 路由）。
- [ ] **Step 3: Commit** — `git commit -m "feat: 图表资产库页面（/charts）——检索、编辑信息、复制、删除、拖拽源"`

---

### Task 4: 编辑页左栏「图表库」tab（拖入画布生成副本）

**Files:** Create `src/workbench/panels/AssetLibraryPanel.vue`；Modify `src/workbench/LeftPanel.vue`、`src/workbench/CanvasStage.vue`。

**Interfaces:** 消费 `doc.placeAsset(assetId, frame)`；`DROP_MIME_ASSET = "application/x-chartforge-asset"`。

- [ ] **Step 1: 实现**
  - `LeftPanel` TABS 增 `{ key: "assets", label: "图表库" }`，顺序：图表类型 / 图表库 / 素材 / 图层。
  - `AssetLibraryPanel`：搜索框 + 分类/标签筛选 + 紧凑列表（缩略图 48×48 + 名称 + 类型），`dragstart` 写 `DROP_MIME_ASSET`，双击 = 居中放置。
  - `CanvasStage.onDrop`：识别 `DROP_MIME_ASSET` → 以落点为中心换算 frame → `doc.placeAsset(id, frame)`；拖拽中显示半透明预览（沿用现有预览层）。
- [ ] **Step 2: 验证** — 手动：拖入 3 个资产分别落位正确、落点靠边被 clamp、撤销可回退；`pnpm typecheck` + `pnpm build`。
- [ ] **Step 3: Commit** — `git commit -m "feat: 左栏图表库 tab 与拖入大屏生成图表副本"`

---

### Task 5: 图表聚焦编辑与类型切换

**Files:** Modify `src/workbench/CanvasStage.vue`、`src/workbench/InspectorPanel.vue`、`src/workbench/panels/ChartConfigPanel.vue`。

**Interfaces:** 消费 `doc.changeChartType(id, type)`（已存在、当前无调用方）、`ui.focusItemId`（新增 UI 状态）。

- [ ] **Step 1: 实现**
  - `uiStore` 增 `focusItemId: string | null` 与 `setFocusItem(id)`。
  - 双击图表项 → `setFocusItem(id)`：该图表 z-index 提升、其余元素 `opacity: .35` 且 `pointer-events: none`；点击空白或 `Esc` 清空。
  - Inspector 图表头部增类型下拉（6 类），`change` 时 `doc.changeChartType(id, type)` 并保留 `frame`；有二次确认（会重置参数与数据）。
- [ ] **Step 2: 验证** — 手动：聚焦后右栏只显示该图表参数；切类型后尺寸不变、数据重置；Esc 退出后选中态保留；`pnpm typecheck` + `pnpm build`。
- [ ] **Step 3: Commit** — `git commit -m "feat: 图表聚焦编辑与图表类型切换"`

---

### Task 6: 对齐与等距分布工具

**Files:** Create `src/shared/ui/AlignToolbar.vue`；Modify `src/stores/documentStore.ts`（`alignItems/distributeItems`）、`src/workbench/CanvasStage.vue`（挂载工具条）；Test `tests/stores.spec.ts`。

**Interfaces:**
- `alignItems(ids: string[], mode: "left"|"hcenter"|"right"|"top"|"vcenter"|"bottom"): void`
- `distributeItems(ids: string[], axis: "h"|"v"): void`（<3 个时 no-op）

- [ ] **Step 1: 写失败测试**
  ```ts
  it("alignItems 左对齐并以最左元素为准", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", { x: 100, y: 100, w: 200, h: 100 });
    const b = createItem("shape", { x: 500, y: 300, w: 100, h: 100 });
    screen.items.push(a, b);
    doc.alignItems([a.id, b.id], "left");
    expect(a.frame.x).toBe(100);
    expect(b.frame.x).toBe(100);
  });

  it("distributeItems 水平等距且不动两端元素", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", { x: 0, y: 0, w: 100, h: 100 });
    const b = createItem("shape", { x: 300, y: 0, w: 100, h: 100 });
    const c = createItem("shape", { x: 900, y: 0, w: 100, h: 100 });
    screen.items.push(a, b, c);
    doc.distributeItems([a.id, b.id, c.id], "h");
    expect(a.frame.x).toBe(0);
    expect(c.frame.x).toBe(900);
    expect(b.frame.x).toBe(400);
  });
  ```
- [ ] **Step 2: 跑测试确认失败** → Expected: FAIL
- [ ] **Step 3: 实现** — 对齐/分布后统一 `clampFrameToCanvas` 并 `commit()`；工具条仅在选择 ≥2 时出现，按钮 `title` 用中文说明
- [ ] **Step 4: 跑测试通过** + `pnpm typecheck`
- [ ] **Step 5: Commit** — `git commit -m "feat: 多选对齐与等距分布工具"`

---

### Task 7: 视图快捷键与保存入口

**Files:** Modify `src/workbench/TopBar.vue`、`src/workbench/CanvasStage.vue`、`src/workbench/ShortcutsHelp.vue`。

- [ ] **Step 1: 实现**
  - `Ctrl+0` = 适配窗口（复用 `fitToWindow`）、`Ctrl+1` = 100%（`zoomAtStageCenter(100)`）、`Ctrl +/-` = 缩放档位。
  - 顶栏「保存到大屏库」调用 `doc.saveScreenSnapshot()`（若缺则用现有保存路径生成 thumbnail 后 `commit`），对话框填名称/分类/标签。
  - `ShortcutsHelp` 增补上述快捷键条目（中文）。
- [ ] **Step 2: 验证** — 手动：快捷键生效且不与 `Ctrl+Z`/`Ctrl+G` 冲突；保存后大屏库卡片出现新缩略图；`pnpm typecheck` + `pnpm build`。
- [ ] **Step 3: Commit** — `git commit -m "feat: 视图快捷键与大屏保存入口"`

---

### Task 8: 质量门、文档同步与全量提交

- [ ] **Step 1: 质量门** — `pnpm typecheck`（0 error）→ `run_tests`（全 PASS）→ `pnpm build`（成功产出 dist）。
- [ ] **Step 2: 手动走查清单**（桥浏览器）：
  1. 新建 1920×1080 大屏 → 拖入 3 个图表资产 + 1 个文本 → 对齐/分布 → 保存大屏；
  2. 刷新后内容与元信息完整；旧第一阶段数据可打开；
  3. 改大屏内图表，资产库同源图表不变；
  4. 缩小画布到 1280×720，分别验证「保留裁切」「等比适配」；
  5. 演示模式全屏展示并退出；
  6. `/charts` 搜索、筛选、复制、删除正常。
- [ ] **Step 3: 文档同步** — 将本计划复选框回填；更新方案 §10 待确认项为已定；如与实现有偏差，同步修订 `docs/图表工作台-第二阶段方案.md`。
- [ ] **Step 4: 提交** — `git add docs src tests; git commit -m "docs: 第二阶段方案与计划，同步实现进度"`（不含 `src/assets/screens/`）。
- [ ] **Step 5:** 桥 `finalize_changes`（一次）→ 中文执行总结（含验收对照表）。

---

## Self-Review（对照规格）

- **Spec coverage:** E 图表资产库 → T1/T2/T3；F 大屏拼装（多图表、拖入副本、对齐分布、聚焦编辑、视图）→ T2/T4/T5/T6/T7；G 大屏库 → 既有 + T7；H 兼容 → T1 + Global Constraints；§8 验收 1–7 → T8 走查与质量门。
- **Step scan:** 每个任务给出方法签名与断言值；UI 任务以「文案/交互定稿」列表描述，避免含糊。
- **Type consistency:** `saveChartAsAsset / placeAsset / renameWithSuffix / alignItems / distributeItems` 在 T2/T6 定义，T3/T4/T5/T6 引用，命名一致。
- **Review Focus:** 5 条分别落在 T1（元信息兼容）、T2（副本语义/命名/越界）、T8（演示走查）。

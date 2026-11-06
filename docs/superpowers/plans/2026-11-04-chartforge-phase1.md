# ChartForge 第一阶段补齐与对齐 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (本环境无子代理，由主会话按任务顺序执行)。Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按《图表工作台·第一阶段方案》把现有 ChartForge 代码补齐到第一阶段验收标准：画布尺寸可自定义、每画布单图表（UI 约束）、图表库（新建/搜索/分类/标签/演示/复制/导出/删除）、演示模式退出按钮、图片压缩核心化、隐藏导入与实时数据入口，并最小修订方案文档后全量提交。

**Architecture:** 兼容迁移：沿用现有 `Screen` 数据结构作为「图表独立画布」（与规格 6.3 Asset 同构：canvas+chart+decorations+thumbnail），**不改数据模型结构**，只做 UI 层改造；原「图表资产 ChartAsset / 实时数据 / 导入」代码全部保留，仅隐藏入口。核心逻辑（尺寸、元信息、单图约束、压缩）落在 core/stores 层并用 Vitest 覆盖。

**Tech Stack:** Vue 3.5 + TypeScript 5.9 + Vite 8 + Pinia 3 + ECharts 6 + Vitest 3（沿用现有，不新增依赖；界面中文）。

**Spec:** `docs/图表工作台-第一阶段方案.md`（唯一规格，本次实施不新增/不保留其他 plans/specs）。

## Global Constraints

- 技术栈沿用现有 package.json，不新增任何依赖；图片压缩用原生 Canvas。
- 数据模型不加硬校验：单图约束仅 UI 层（不删 `items` 多图能力；旧数据多图屏可继续打开）。
- 导入入口、实时数据入口、旧「图表资产」入口：仅隐藏/移除 UI，核心代码（`workspaceRepo.importJson`、`workspaceStore.importFrom`、`documentStore.saveAsAsset/upsertAsset`、`LifeSourcePanel.vue`、`core/live/*`）一律保留。
- 导出全部保留（单图 JSON、工作区 JSON、PNG@2x）。
- 界面语言：中文。既有 localStorage key `chartforge.workspace.v1` 不变，旧数据必须正常打开。
- 提交到当前分支 `feature/major-update`；`src/assets/screens/`（无关未跟踪改动）不纳入提交。
- 质量门：`pnpm typecheck`、`pnpm test`、`pnpm build` 全过后才提交。

## Review Focus

1. **画布尺寸极端输入**（新建对话框/ScreenPanel 输入 0、负数、超大值）：输入控件 min=320/max=7680；`normalizeScreen` 对非法尺寸回退默认。→ T1 测试用例 `normalizeScreen 非法画布尺寸回退 1920×1080`。
2. **localStorage 容量**（大图撑爆存储）：压缩后 JPEG dataURL ≤ 2MB，压缩在质量阶梯内必收敛。→ T3 测试 `encodeJpeg 输出不超过 maxBytes`（mock toDataURL 阶梯缩短）与 `targetSize 不放大只缩小`。
3. **旧数据兼容**（既存屏无 category/tags）：规范化后字段缺省 undefined，图表库筛选「未分类」正常。→ T1 测试 `normalizeWorkspace 无元信息 screen 保留且 category/tags 为空`。
4. **绕过单图约束的复制/粘贴/复制快捷键**（Ctrl+C/V、Ctrl+D 复制图表项造成双图）：paste/duplicate 在已有图表时过滤 chart 项；drop 图表被拒。→ T2 测试 `paste/duplicate 在已有图表时不新增图表项`。
5. **演示模式退出与资源泄漏**：退出按钮与 Esc 同路径返回；鼠标闲置 3s 隐藏的定时器与监听器在 onBeforeUnmount 清理。→ T6 手动清单（按钮退出/ Esc 退出/ 居中黑边/ 缩放）。

---

## File Structure

| 文件 | 变化 | 职责 |
|---|---|---|
| `src/core/model/types.ts` | 改 | `Screen` 增可选 `category?/tags?` |
| `src/core/model/schema.ts` | 改 | `createScreen(name, canvas?)`；`normalizeScreen` 解析元信息与非法尺寸兜底；默认名改「未命名图表」 |
| `src/stores/documentStore.ts` | 改 | `addScreen(name?, canvas?)` 默认名「图表N」；新增 `ensureChart/changeChartType/updateScreenMeta`；`paste/duplicate` 过滤图表项 |
| `src/core/storage/imageCompress.ts` | 新建 | `IMAGE_MAX_SIDE/IMAGE_MAX_BYTES/targetSize/encodeJpeg/compressImageFile` |
| `tests/core-image-compress.spec.ts` | 新建 | 压缩核心单测 |
| `tests/core-model.spec.ts`、`tests/stores.spec.ts` | 改 | 尺寸/元信息/单图约束测试 |
| `src/workbench/panels/StylePanel.vue` | 改 | 图片上传改用 `compressImageFile` |
| `src/views/LibraryView.vue` | 改 | 图表库页（新建对话框/搜索/分类/标签/卡片操作/文案；移除导入入口与旧资产 tab） |
| `src/views/WorkbenchView.vue` | 改 | 空库默认名「我的图表」 |
| `src/views/PlayView.vue` | 改 | 演示右上角退出按钮 |
| `src/workbench/LeftPanel.vue` | 改 | 左栏三 tab「图表类型/素材/图层」，移除资产 tab |
| `src/workbench/ElementsPanel.vue` | 改 | 按 section 渲染图表组/素材组；图表 chip 点击切换类型 |
| `src/workbench/CanvasStage.vue` | 改 | drop 拒绝第二个图表项 |
| `src/workbench/InspectorPanel.vue` | 改 | 移除两处 LiveSourcePanel；空选中头部「画布设置」 |
| `src/workbench/panels/DataTablePanel.vue` | 改 | 移除「保存为资产」按钮（store 代码保留） |
| `src/workbench/TopBar.vue` | 改 | 名称占位符与保存失败文案改「图表」 |
| `src/workbench/panels/ScreenPanel.vue` | 改 | 画布尺寸由固定文本改为可编辑宽高；文案「图表名称」 |
| `docs/图表工作台-第一阶段方案.md` | 改 | 3 处最小修订 |

---

### Task 1: 数据层——画布尺寸可定制与图表元信息

**Files:**
- Modify: `src/core/model/types.ts`（Screen 接口）
- Modify: `src/core/model/schema.ts`（createScreen/normalizeScreen/DEFAULT_SCREEN_NAME）
- Modify: `src/stores/documentStore.ts`（addScreen/updateScreenMeta）
- Test: `tests/core-model.spec.ts`、`tests/stores.spec.ts`

**Interfaces:**
- Consumes: `CANVAS_SIZE`（schema.ts 现有导出）、`useWorkspaceStore().workspace.screens`
- Produces:
  - `createScreen(name: string, canvas?: { width: number; height: number }): Screen`（缺省 CANVAS_SIZE）
  - `Screen { ...; category?: string; tags?: string[] }`
  - `addScreen(name?: string, canvas?: { width: number; height: number }): Screen`（缺省名 ``图表${screens.length+1}``）
  - `updateScreenMeta(id: string, meta: { name?: string; category?: string; tags?: string[] }): void`

- [x] **Step 1: 写失败测试**（追加到 `tests/core-model.spec.ts` 与 `tests/stores.spec.ts`）

```ts
// core-model.spec.ts 追加:
it("createScreen 支持自定义画布尺寸", () => {
  const s = createScreen("A", { width: 1280, height: 720 });
  expect(s.canvas.width).toBe(1280);
  expect(s.canvas.height).toBe(720);
});
it("normalizeScreen 非法画布尺寸回退 1920×1080", () => {
  const ws = normalizeWorkspace({ version: 1, screens: [{ id: "a", canvas: { width: -5, height: 0 } }] });
  expect(ws.screens[0].canvas).toEqual({ width: 1920, height: 1080, background: { kind: "color", color: "#FFFFFF" } });
});
it("normalizeWorkspace 解析 category/tags，缺失时为空", () => {
  const ws = normalizeWorkspace({
    version: 1,
    screens: [
      { id: "a", category: "柱状图", tags: ["销售", "2024", 1] },
      { id: "b" },
    ],
  });
  expect(ws.screens[0].category).toBe("柱状图");
  expect(ws.screens[0].tags).toEqual(["销售", "2024"]);
  expect(ws.screens[1].category).toBeUndefined();
  expect(ws.screens[1].tags).toBeUndefined();
});

// stores.spec.ts 追加:
it("addScreen 自定义画布尺寸并默认命名图表N", () => {
  const { doc } = seedScreen();
  const before = useWorkspaceStore().workspace.screens.length;
  const s = doc.addScreen(undefined, { width: 800, height: 600 });
  expect(useWorkspaceStore().workspace.screens).toHaveLength(before + 1);
  expect(s.name).toBe(`图表${before + 1}`);
  expect(s.canvas.width).toBe(800);
  expect(s.canvas.height).toBe(600);
});
it("updateScreenMeta 更新名称/分类/标签", () => {
  const { doc, screen } = seedScreen();
  doc.updateScreenMeta(screen.id, { name: "销量柱状图", category: "柱状图", tags: ["销售"] });
  expect(screen.name).toBe("销量柱状图");
  expect(screen.category).toBe("柱状图");
  expect(screen.tags).toEqual(["销售"]);
});
```

- [x] **Step 2: 跑测试确认失败**

Run: 桥 `run_tests`（`pnpm test`）
Expected: FAIL——`createScreen 支持自定义画布尺寸` 等 5 个用例报错（`category` 未定义 / 断言不匹配）。

- [x] **Step 3: 实现**
  - `types.ts`：`Screen` 增 `category?: string; tags?: string[];`
  - `schema.ts`：`DEFAULT_SCREEN_NAME` 改 `"未命名图表"`；`createScreen(name, canvas?)` 尺寸取 `{ width: canvas?.width ?? CANVAS_SIZE.width, height: canvas?.height ?? CANVAS_SIZE.height }`；`normalizeScreen` 增：
    ```ts
    const canvasW = canvasRaw.width;
    const width = typeof canvasW === "number" && canvasW >= 320 && canvasW <= 7680 ? canvasW : CANVAS_SIZE.width;
    // height 同理（320–7680，否则 CANVAS_SIZE.height）
    ...(typeof raw.category === "string" ? { category: raw.category } : {}),
    ...(Array.isArray(raw.tags) ? { tags: raw.tags.filter((t): t is string => typeof t === "string") } : {}),
    ```
  - `documentStore.ts`：`addScreen(name?, canvas?)` 传 canvas 给 `createScreen`，缺省名 `` `图表${ws.workspace.screens.length + 1}` ``；新增 `updateScreenMeta(id, meta)`：name 走 `setScreenName` 逻辑、category/tags 直接赋值，最后 `commit()`。
  - 修正既有失败断言：`core-model.spec.ts` 中「未命名大屏」断言改为「未命名图表」。

- [x] **Step 4: 跑测试确认通过**

Run: `run_tests` + 桥终端 `pnpm typecheck`（`cd E:\project\github-project\echarts-project` 处执行）
Expected: 全部 PASS、typecheck 0 错误。

- [x] **Step 5: Commit**

```bash
git add src/core/model/types.ts src/core/model/schema.ts src/stores/documentStore.ts tests/core-model.spec.ts tests/stores.spec.ts
git commit -m "feat: 画布尺寸可定制与图表元信息（分类/标签）"
```

---

### Task 2: 数据层——单图约束核心（ensureChart/changeChartType/复制粘贴过滤）

**Files:**
- Modify: `src/stores/documentStore.ts`
- Test: `tests/stores.spec.ts`

**Interfaces:**
- Consumes: `chartRegistry[type].defaultSpec()`（src/core/chart/registry.ts 现有）、`createItem`（schema）
- Produces:
  - `ensureChart(type: ChartType): string`——当前屏已有图表则切换其类型并返回其 id；否则新建图表项（frame `{ x: 24, y: 24, w: Math.max(100, canvas.width - 48), h: Math.max(100, canvas.height - 48) }`，spec 取 `chartRegistry[type].defaultSpec()`）、addItem 并返回新 id。
  - `changeChartType(id: string, type: ChartType): void`——`item.spec = chartRegistry[type].defaultSpec()`（保留 id/name/frame），`commit()`。
  - `paste()`/`duplicate()` 行为变更：若当前屏已有 `kind==="chart"` 项，则克隆列表过滤掉 chart 项（空列表则直接 return）。

- [x] **Step 1: 写失败测试**（追加 `tests/stores.spec.ts`）

```ts
it("ensureChart 首次添加、再次调用切换类型不产生第二个图表", () => {
  const { doc, screen } = seedScreen();
  doc.initHistory();
  const id1 = doc.ensureChart("line");
  const chartItems = () => screen.items.filter((i) => i.kind === "chart");
  expect(chartItems()).toHaveLength(1);
  const id2 = doc.ensureChart("bar");
  expect(id2).toBe(id1);
  expect(chartItems()).toHaveLength(1);
  expect((chartItems()[0] as ChartItem).spec.type).toBe("bar");
});
it("ensureChart 图表尺寸铺满画布留 24px 边距", () => {
  const { doc, screen } = seedScreen();
  screen.canvas.width = 1000;
  screen.canvas.height = 500;
  doc.ensureChart("pie");
  const c = screen.items[0];
  expect(c.frame).toMatchObject({ x: 24, y: 24, w: 952, h: 452 });
});
it("已有图表时 paste/duplicate 不新增图表项", () => {
  const { doc, screen } = seedScreen();
  const chart = createItem("chart") as ChartItem;
  const text = createItem("text") as ScreenItem;
  screen.items.push(chart, text);
  doc.selectedIds = [text.id];
  doc.copy();
  doc.paste(); // 剪贴板是 text，正常贴入
  expect(screen.items).toHaveLength(3);
  doc.selectedIds = [chart.id];
  doc.copy();
  doc.paste(); // 剪贴板是 chart，被拒
  expect(screen.items).toHaveLength(3);
  doc.duplicate(); // 选中 chart，被拒
  expect(screen.items).toHaveLength(3);
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `run_tests`
Expected: FAIL——`doc.ensureChart is not a function`。

- [x] **Step 3: 实现**（documentStore.ts 内，按 Interfaces 签名；`changeChartType`/`ensureChart` 内部复用 `addItem`/`commit` 既有动作）

- [x] **Step 4: 跑测试确认通过**

Run: `run_tests` + `pnpm typecheck`
Expected: 全部 PASS。

- [x] **Step 5: Commit**

```bash
git add src/stores/documentStore.ts tests/stores.spec.ts
git commit -m "feat: 单图约束核心——ensureChart 类型切换与复制粘贴过滤"
```

---

### Task 3: 核心——图片压缩（原生 Canvas，长边≤2048、JPEG≤2MB）

**Files:**
- Create: `src/core/storage/imageCompress.ts`
- Modify: `src/workbench/panels/StylePanel.vue`（删除内联 compressImage，改用核心函数）
- Test: `tests/core-image-compress.spec.ts`（沿用 `tests/core-thumbnail.spec.ts` 的 fakeFactory 手法）

**Interfaces:**
- Consumes: 无
- Produces:
  - `export const IMAGE_MAX_SIDE = 2048;`、`export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;`
  - `export function targetSize(w: number, h: number, maxSide?: number): { width: number; height: number }`——等比且**不放大**（scale = min(1, maxSide/max(w,h,1))），结果 ≥1px。
  - `export interface EncodeOptions { maxSide?: number; maxBytes?: number; createCanvas?: (w: number, h: number) => HTMLCanvasElement }`
  - `export function encodeJpeg(source: { width: number; height: number } | HTMLImageElement | HTMLCanvasElement, opts?: EncodeOptions): string`——按 targetSize 绘制一次，按 `[0.85, 0.7, 0.55, 0.4]` 质量阶梯 `toDataURL("image/jpeg", q)`，返回首个 ≤ maxBytes 的结果，否则返回最后一级（保证收敛）。
  - `export async function compressImageFile(file: File, opts?: EncodeOptions): Promise<string>`——`createImageBitmap(file)` → `encodeJpeg(bitmap, opts)`（UI 薄封装）。

- [x] **Step 1: 写失败测试**（新建 `tests/core-image-compress.spec.ts`）

```ts
import { describe, it, expect, vi } from "vitest";
import { IMAGE_MAX_SIDE, targetSize, encodeJpeg } from "../src/core/storage/imageCompress";

type Call = { w: number; h: number; quality: number };
function fakeFactory(calls: Call[], sizes: number[]) {
  return (w: number, h: number) => {
    let i = 0;
    const canvas = {
      width: w,
      height: h,
      getContext: () => ({ drawImage: vi.fn() }),
      toDataURL: (type?: string, quality?: number) => {
        calls.push({ w: canvas.width, h: canvas.height, quality: quality ?? 0 });
        return `data:${type};base64,` + "A".repeat(sizes[Math.min(i++, sizes.length - 1)]);
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  };
}

describe("storage/imageCompress", () => {
  it("targetSize 长边 2048 等比缩小且不放大", () => {
    expect(targetSize(4096, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(300, 900)).toEqual({ width: 300, height: 900 });
  });
  it("encodeJpeg 绘制一次输出 JPEG dataURL", () => {
    const calls: Call[] = [];
    const out = encodeJpeg({ width: 4096, height: 2048 } as HTMLCanvasElement, {
      createCanvas: fakeFactory(calls, [100, 100, 100, 100]),
    });
    expect(out.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ w: 2048, h: 1024, quality: 0.85 });
  });
  it("encodeJpeg 超过 maxBytes 时按质量阶梯降质直到达标", () => {
    const calls: Call[] = [];
    const maxBytes = 500;
    const out = encodeJpeg({ width: 2048, height: 1024 } as HTMLCanvasElement, {
      maxBytes,
      createCanvas: fakeFactory(calls, [3000, 1200, 400]),
    });
    expect(out.length).toBeLessThanOrEqual(maxBytes);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.7, 0.55]);
  });
  it("encodeJpeg 全部阶梯仍超限时返回最低质量结果", () => {
    const calls: Call[] = [];
    const out = encodeJpeg({ width: 2048, height: 1024 } as HTMLCanvasElement, {
      maxBytes: 10,
      createCanvas: fakeFactory(calls, [3000, 3000, 3000, 3000]),
    });
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.7, 0.55, 0.4]);
    expect(out.length).toBeGreaterThan(10);
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `run_tests`
Expected: FAIL——模块不存在。

- [x] **Step 3: 实现**（按 Interfaces；encodeJpeg 内 `const { width, height } = "naturalWidth" in source ? { width: source.naturalWidth, height: source.naturalHeight } : source;`）

- [x] **Step 4: 改 StylePanel.vue**：删内联 `compressImage`，改 `import { compressImageFile } from "@/core/storage/imageCompress";` 并在 `onPickImage` 中调用。

- [x] **Step 5: 跑测试确认通过**

Run: `run_tests` + `pnpm typecheck`
Expected: 全部 PASS。

- [x] **Step 6: Commit**

```bash
git add src/core/storage/imageCompress.ts src/workbench/panels/StylePanel.vue tests/core-image-compress.spec.ts
git commit -m "feat: 图片压缩核心化（长边2048、JPEG≤2MB、质量阶梯）"
```

---

### Task 4: UI——图表库页面改造（LibraryView）

**Files:**
- Modify: `src/views/LibraryView.vue`

**Interfaces:**
- Consumes: `doc.addScreen(name?, canvas?)`、`doc.ensureChart(type)`、`doc.updateScreenMeta(id, meta)`、`ws.duplicateScreen(id)`、`ws.exportAll`、`exportJson`（现有）
- Produces: 页面级行为，无对外接口。文案/交互定稿如下（按此实现）：
  - logo 标题「ChartForge 图表工作台」。
  - 删除「大屏/图表资产」tabs 与大屏分支，整页即图表库（数据源 `ws.screens`）。
  - 顶栏操作：「新建图表」（主按钮）、「导出全部」；删除「导入」按钮、导入对话框及脚本 `importOpen/importMode/importText/importError/openImport/pickFile/doImport` 与 `ImportError` 引用。
  - 筛选栏：搜索框（名称/标签包含匹配，大小写不敏感）、分类 select（选项：全部分类、未分类、折线图、柱状图、饼图、地图、散点图、雷达图）、标签 chips（来自全部屏 tags 去重，点击=筛选）。
  - 卡片：缩略图（无缩略图时显示 `` `${screen.canvas.width} × ${screen.canvas.height}` ``）、名称、分类/标签 chips；操作：编辑信息 / 演示(`/play/:id`) / 复制(`ws.duplicateScreen`) / 导出(`exportJson`) / 删除（ConfirmDialog 确认）。
  - 「新建图表」对话框：6 个图表类型 chips（单选，默认 line）、宽度/高度 number 输入（默认 1920/1080，min 320 max 7680）；确认后 `doc.addScreen(`` `图表${ws.screens.length + 1}` ``, { width, height })` → `doc.ensureChart(type)` → `doc.initHistory()` → `openWorkbench(id)`。
  - 「编辑信息」对话框：名称、分类 select（未分类+6 类）、标签文本（中文逗号/空格分隔，去空）。
  - 空态文案：「还没有图表，点击「新建图表」开始制作」。

- [x] **Step 1: 实现**（单文件改写；样式沿用既有 `.library__*` 类，新增筛选栏与对话框样式）
- [x] **Step 2: 验证**

Run: `pnpm typecheck` + `pnpm build`
然后手动走查（桥浏览器或本地 dev）：新建图表（选类型+尺寸→进入编辑且画布内已有对应类型图表）；搜索「销售」命中带该标签的卡片；分类筛选；复制生成「X 副本」；编辑信息保存后卡片显示 chips；演示进入全屏；导出下载 JSON；删除需确认；无导入按钮。

- [x] **Step 3: Commit**

```bash
git add src/views/LibraryView.vue
git commit -m "feat: 图表库页面——新建图表、搜索分类标签、卡片操作"
```

---

### Task 5: UI——编辑页对齐（左栏/面板文案/单图约束 UI）

**Files:**
- Modify: `src/workbench/LeftPanel.vue`、`src/workbench/ElementsPanel.vue`、`src/workbench/CanvasStage.vue`、`src/workbench/InspectorPanel.vue`、`src/workbench/panels/DataTablePanel.vue`、`src/workbench/TopBar.vue`、`src/workbench/panels/ScreenPanel.vue`、`src/views/WorkbenchView.vue`

**Interfaces:**
- Consumes: `doc.ensureChart/changeChartType`（T2）、`doc.setCanvas`、`doc.setScreenName`
- Produces: 无。改动定稿：
  - `LeftPanel.vue`: TABS 改 `[{key:"charts",label:"图表类型"},{key:"materials",label:"素材"},{key:"layers",label:"图层"}]`；移除 assets tab（`AssetsPanel.vue` 文件保留不删）；元素区渲染 `<ElementsPanel section="charts" />` / `<ElementsPanel section="materials" />`。
  - `ElementsPanel.vue`: 增 `defineProps<{ section: "charts" | "materials" }>()`；charts 组（6 chips，可拖拽，**点击=若已有图表则 `doc.changeChartType` 否则 `doc.ensureChart`**，已有图表时显示提示「画布只能有一个图表，点击类型直接切换」）；materials 组（文本/图片/形状 3 chips 拖拽，沿用现 DROP_MIME）。
  - `CanvasStage.vue` `onDrop`: 最前加 `if (payload.kind === "chart" && doc.items.some((i) => i.kind === "chart")) return;`
  - `InspectorPanel.vue`: 删除两处 `LiveSourcePanel` 挂载（聚焦编辑模板与单选 chart 模板中的「实时数据」分区）及 `import LiveSourcePanel`；空选中头部「大屏设置」→「画布设置」。
  - `DataTablePanel.vue`: 移除「保存为资产」按钮与 `saveAsAsset` 函数、`createChartAsset/renderChartThumbnail` 引用（`doc.saveAsAsset` 保留）。
  - `TopBar.vue`: 名称输入 placeholder「大屏名称」→「图表名称」；`saveText` 错误文案「删除部分大屏」→「删除部分图表」。
  - `ScreenPanel.vue`: 「画布尺寸」固定文本改为两个 number 输入（min 320 max 7680）→ `doc.setCanvas({ width, height })`；「大屏名称」→「图表名称」。
  - `WorkbenchView.vue`: 空库默认 `doc.addScreen("我的图表")`。

- [x] **Step 1: 实现**（逐文件小改）
- [x] **Step 2: 验证**

Run: `pnpm typecheck` + `pnpm build`
手动走查：左栏三 tab 正常；画布已有图表时拖第二个图表无效、点击类型 chip 切换类型且不新增；复制粘贴图表不产生双图（T2 已保）；右侧检查器无「实时数据」；数据面板无「保存为资产」；画布尺寸可改且舞台立即生效；顶部占位文案正确。

- [x] **Step 3: Commit**

```bash
git add src/workbench/LeftPanel.vue src/workbench/ElementsPanel.vue src/workbench/CanvasStage.vue src/workbench/InspectorPanel.vue src/workbench/panels/DataTablePanel.vue src/workbench/TopBar.vue src/workbench/panels/ScreenPanel.vue src/views/WorkbenchView.vue
git commit -m "feat: 编辑页对齐——单图约束 UI、面板文案、隐藏实时数据与资产入口"
```

---

### Task 6: UI——演示模式退出按钮（PlayView）

**Files:**
- Modify: `src/views/PlayView.vue`

**Interfaces:**
- Consumes: `router.push(\`/workbench/${props.id}\`)`（现有 Esc 逻辑）
- Produces: 无。

- [x] **Step 1: 实现**
  - 增 `const cursorHidden = ref(false);` 与 `let idleTimer: ReturnType<typeof setTimeout> | null = null;`
  - `onMouseMove()`：`cursorHidden=false`，重置 3s 定时器置 `cursorHidden=true`；onMounted 挂 `window.addEventListener("mousemove", onMouseMove)`，首次 3s 后隐藏。
  - 模板增右上角浮动按钮 `.play-view__exit`（`cursorHidden` 时加 `--hidden` 类，CSS `opacity:0; pointer-events:none; transition: opacity .3s`）文案「退出演示 (Esc)」，点击 `router.push(\`/workbench/${props.id}\`)`。
  - onBeforeUnmount 清理 `mousemove` 监听与定时器。
  - 保留 F11 提示与既有 fit 逻辑（等比缩放、居中、黑底已实现，不改）。

- [x] **Step 2: 验证**

Run: `pnpm typecheck` + `pnpm build`
手动走查：打开演示→黑底居中等比缩放；Esc 退出；右上角按钮点击退出；鼠标闲置 3s 按钮淡出、移动鼠标重现；退出后编辑状态保留。

- [x] **Step 3: Commit**

```bash
git add src/views/PlayView.vue
git commit -m "feat: 演示模式右上角退出按钮（鼠标闲置隐藏）"
```

---

### Task 7: 文档——方案文档最小修订（3 处）

**Files:**
- Modify: `docs/图表工作台-第一阶段方案.md`

- [x] **Step 1:** 桥 `read_file` 拿当前 version（作 expected_version）。
- [x] **Step 2:** `edit_file`（三处）
  1. §2.2 `- **导入导出**：后置。` → `- **导入**：后置（单图 JSON / 工作区 JSON 导出保留）。`
  2. §5.3 图表库操作行 → `| 图表库操作 | 卡片：打开编辑、演示、复制、导出（JSON）、编辑信息（名称/分类/标签）、删除（需确认） |`
  3. §7「待细化（建议）」块整体替换为：`**已确认定稿：** 退出方式：Esc 键或点击屏幕右上角浮动退出按钮（鼠标闲置约 3 秒自动隐藏）；画布等比缩放适配屏幕并居中，比例不一致时周围留黑边；不设播放控制。`
  4. §10 待跟进：1/2/3 项标注「已闭环（第一阶段实施完成）」；保留 4/5。
- [x] **Step 3:** `git diff docs/图表工作台-第一阶段方案.md` 核对仅上述变更。
- [x] **Step 4: Commit（随 T8 一起提交）**

---

### Task 8: 质量门与全量提交

**Files:**
- 无代码变更；涉及 `docs/superpowers/plans/*.md`（4 个已删，本计划新增）、`docs/图表工作台-第一阶段方案.md`。

- [x] **Step 1: 质量门**

Run: `pnpm typecheck` → Expected: 0 error
Run: `run_tests`（`pnpm test`） → Expected: 全 PASS
Run: `pnpm build` → Expected: 构建成功产出 dist

- [x] **Step 2: 提交（当前分支 feature/major-update；不含 `src/assets/screens/`）**

```bash
git add docs
git commit -m "docs: 第一阶段方案作为唯一规格并清除旧 plans/specs"
```

- [x] **Step 3:** 桥 `finalize_changes`（一次）→ 输出中文执行总结（含验收对照表）。

---

## Self-Review（对照规格）

- **Spec coverage:** A 图表配置（既有+T2 类型切换）、B 个性化（T1/T5 画布尺寸、单图约束、既有素材）、C 图表库（T4+T1 meta）、D 演示（T6）、6.2 图片压缩（T3）、6.4 本地存储提示（既有 TopBar 保存失败提示）、8.1 验收 1–6（T4/T5 走查覆盖 1/4，T1/T2 测试覆盖 5，既有覆盖 2/3，T8 覆盖 6）。无缺口。
- **Step scan:** 每个实现步骤给出精确签名与断言值；UI 任务以「文案/交互定稿」列表取代含糊描述。
- **Type consistency:** `ensureChart/changeChartType/updateScreenMeta/addScreen` 签名在 T1/T2 定义、T4/T5 引用，命名一致。
- **Review Focus:** 5 条分别落入 T1/T3/T1/T2/T6 的测试与走查清单。✔
- **比例:** 计划篇幅与规格相当，多为决策与断言而非代码誊写。✔

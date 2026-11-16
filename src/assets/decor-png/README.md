# 内置 PNG 装饰素材（T18）

大屏边框 / 标题框 / 背景框 / 装饰素材的**成品位图**。与 `src/core/design/decorations.ts`
里那 23 个矢量装饰并存，同一套分组筛选，矢量条目一个没删。

`src/core/design/decorPng.ts` 由 `scripts/sync-decor-png.mjs` 从本目录生成，
**不要手改生成的 ts**，加/换素材后重跑：

```bash
node scripts/sync-decor-png.mjs           # 重写 decorPng.ts
node scripts/sync-decor-png.mjs --check   # 校验是否同步（CI / 测试会用）
```

## 授权

做这套素材的前提是**必须能免费商用 + 允许再分发**（随本仓库一起分发）。
因此排除了视觉中国 / 千图 / 摄图 / 58pic / 包图 / Vecteezy 等商业图库——
它们要么带水印，要么禁止再分发。下表全部来自 **Pixabay 内容许可**
（Content License：可免费商用、可修改、可再分发，无需署名；仅禁止把素材
原样转售 / 重新分发为图库）。署名仍在此列出，以尊重原作者。

| 文件 | 作者 | 原图 | 说明 |
|---|---|---|---|
| `border-violet.png` | JLS-Creation | https://pixabay.com/illustrations/webcam-overlay-room-mask-twitch-7727377/ | 直播摄像头叠加框，裁去四周透明留白 |
| `border-azure.png` | JLS-Creation | https://pixabay.com/illustrations/webcam-mask-overlay-direct-room-7727392/ | 同上 |
| `border-carbon.png` | JLS-Creation | https://pixabay.com/illustrations/webcam-overlay-twitch-youtube-7765761/ | 同上 |
| `border-neon.png` | JLS-Creation | https://pixabay.com/illustrations/webcam-overlay-room-mask-direct-7719859/ | 同上 |
| `title-violet.png` | JLS-Creation | 由 `border-violet` 底部铭牌裁切（源图 x 60–1225 / y 598–676） | 同源派生 |
| `title-azure.png` | JLS-Creation | 由 `border-azure` 底部铭牌裁切（同上坐标） | 同源派生 |
| `panel-violet.png` | JLS-Creation | 由 `border-violet` 九宫格缩放得到，内边距 (150,150,70,110) → 520×300 | 同源派生，四角不拉伸 |
| `panel-azure.png` | JLS-Creation | 由 `border-azure` 九宫格缩放得到（同上） | 同源派生 |
| `orn-stars.png` | JLS-Creation | 由 `border-neon` 左上星簇裁切（0,0–150,130） | 同源派生 |
| `orn-sideline.png` | JLS-Creation | 由 `border-violet` 左侧光条裁切（80,260–135,450） | 同源派生 |
| `orn-ticks.png` | JLS-Creation | 由 `border-carbon` 左上刻度块裁切（0,0–175,80） | 同源派生 |

> 派生素材与源图是**同一套美术语言**：标题框 / 背景框 / 装饰和边框质感一致，
> 不是「边框很有质感、面板却是通平的矢量线」那种割裂感。

## 为什么只有这一家

试过但**不合格**的来源（记下来免得再走一遍）：

- **OpenGameArt**（CC0）：`ui-pack-sci-fi`（Kenney）、`SCIFI UI`（AR）、
  `Simple hud gui constraction kit`（Rawdanitsu）——技术上都合规，但要么是
  64×64 的扁平色块，要么是 33×26 的低分辨率碎片，放大到 1920 宽全是马赛克，
  质感还不如原来那 23 个矢量装饰。
- **Kenney 官网**：下载按钮走捐赠弹窗，直链取不到 zip（OGA 上的镜像倒是能下）。
- **Vecteezy / 中文图库**：水印或禁止再分发，直接排除。
- **Pixabay 的 HUD / futuristic frame 关键词**：命中基本是实拍照片或
  带人物的游戏截图（`fortnite-*` 系列全是不透明整图），不是免抠框。

## 素材规格

- 全部 RGBA（IHDR color type = 6，带 alpha 透明通道）——有测试守着，
  防止把「白底不透明图」当免抠素材混进来。
- 尺寸即 `DECOR_ENTRIES` 里的标称尺寸；大屏边框插入时铺满画布，其余按原生尺寸居中。
- 总量 ~446 KB，内联成 base64 后 ~600 KB。放主包是有意的取舍：装饰必须
  **零外链、可离线、导出即用**，根相对 URL 会让导出的单文件产物离开本站就丢图。

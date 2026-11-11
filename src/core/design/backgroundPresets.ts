import type { Background } from "@/core/model/types";

export interface BuiltInBackgroundPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly preview: string;
  readonly dataUrl: string;
}

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

const source: Array<Omit<BuiltInBackgroundPreset, "dataUrl"> & { svg: string }> = [
  {
    id: "blueprint-grid",
    name: "深海网格",
    description: "原创网格、测距环与冷色光晕，适合监控类看板。",
    preview: "radial-gradient(circle at 70% 20%, #123e5b 0, transparent 45%), #061321",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#0b2940"/><stop offset="1" stop-color="#050c18"/></linearGradient><radialGradient id="glow"><stop stop-color="#1478a1" stop-opacity=".28"/><stop offset="1" stop-color="#1478a1" stop-opacity="0"/></radialGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#4bb7d1" stroke-opacity=".12" stroke-width="1"/></pattern></defs><rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#glow)"/><rect width="1920" height="1080" fill="url(#grid)"/><circle cx="1480" cy="260" r="210" fill="none" stroke="#34c7e8" stroke-opacity=".14"/><circle cx="1480" cy="260" r="270" fill="none" stroke="#34c7e8" stroke-opacity=".08"/><path d="M0 760Q440 640 860 760T1920 710" fill="none" stroke="#39c4e2" stroke-opacity=".12" stroke-width="2"/></svg>`,
  },
  {
    id: "aurora-flow",
    name: "极光流线",
    description: "紫青渐层与流动曲线，适合运营分析与趋势大屏。",
    preview: "radial-gradient(circle at 15% 10%, #453c82 0, transparent 55%), linear-gradient(135deg, #10182c, #062b38)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#17172f"/><stop offset=".55" stop-color="#092535"/><stop offset="1" stop-color="#06101d"/></linearGradient><linearGradient id="flow"><stop stop-color="#9277ff" stop-opacity="0"/><stop offset=".48" stop-color="#55e5d2" stop-opacity=".24"/><stop offset="1" stop-color="#4b87ff" stop-opacity="0"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#bg)"/><path d="M-80 650C300 360 530 910 920 620S1500 280 2020 520" fill="none" stroke="url(#flow)" stroke-width="180"/><path d="M-50 820C420 560 580 960 1020 710S1540 430 1990 620" fill="none" stroke="#56d8d4" stroke-opacity=".13" stroke-width="2"/><path d="M-50 860C420 600 600 1000 1050 750S1550 470 1990 660" fill="none" stroke="#8f82ff" stroke-opacity=".18" stroke-width="2"/><circle cx="1510" cy="240" r="180" fill="none" stroke="#75dce3" stroke-opacity=".1"/><circle cx="1510" cy="240" r="240" fill="none" stroke="#75dce3" stroke-opacity=".06"/></svg>`,
  },
  {
    id: "orbit-contour",
    name: "轨道等高线",
    description: "低对比轨道环和细线弧面，适合空间感背景。",
    preview: "radial-gradient(ellipse at 78% 48%, #19456a, #091a2b 62%, #07111f)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="bg"><stop stop-color="#123c5b"/><stop offset="1" stop-color="#071321"/></radialGradient><pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#6fbcd2" fill-opacity=".22"/></pattern></defs><rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#dots)"/><g fill="none" stroke="#64c5df" stroke-opacity=".13"><ellipse cx="1370" cy="515" rx="400" ry="140" transform="rotate(-24 1370 515)"/><ellipse cx="1370" cy="515" rx="500" ry="185" transform="rotate(-24 1370 515)"/><ellipse cx="1370" cy="515" rx="610" ry="230" transform="rotate(-24 1370 515)"/><ellipse cx="1370" cy="515" rx="720" ry="280" transform="rotate(-24 1370 515)"/></g><path d="M0 890H1920" stroke="#50c6df" stroke-opacity=".1"/><path d="M0 920H1920" stroke="#50c6df" stroke-opacity=".06"/></svg>`,
  },
  {
    id: "minimal-night",
    name: "极简夜色",
    description: "克制暗底与稀疏点阵，突出图表和文字层级。",
    preview: "radial-gradient(circle at 50% 0%, #1d3048, transparent 65%), #0b111b",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" y2="1"><stop stop-color="#17263a"/><stop offset="1" stop-color="#090e16"/></linearGradient><pattern id="dots" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#8ca4bc" fill-opacity=".18"/></pattern><radialGradient id="spot"><stop stop-color="#4b88ae" stop-opacity=".12"/><stop offset="1" stop-color="#4b88ae" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#spot)"/><rect width="1920" height="1080" fill="url(#dots)"/><path d="M80 130H1840" stroke="#8ca4bc" stroke-opacity=".12"/><path d="M80 950H1840" stroke="#8ca4bc" stroke-opacity=".1"/></svg>`,
  },
  {
    id: "teal-depths",
    name: "青绿脉冲",
    description: "深青渐层、柔和等高线与微光节点，适合能源、环境和实时监控主题。",
    preview: "radial-gradient(circle at 74% 30%, #14635f 0, transparent 52%), linear-gradient(135deg, #071d28, #0a302e)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#092331"/><stop offset=".56" stop-color="#0b3635"/><stop offset="1" stop-color="#061821"/></linearGradient><radialGradient id="glow"><stop stop-color="#27b99f" stop-opacity=".2"/><stop offset="1" stop-color="#27b99f" stop-opacity="0"/></radialGradient><pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#65d9c5" fill-opacity=".14"/></pattern></defs><rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#glow)"/><rect width="1920" height="1080" fill="url(#dots)"/><g fill="none" stroke="#5ad8c2" stroke-opacity=".12"><path d="M-80 780C270 620 520 650 800 780s560 170 1200-80"/><path d="M-80 830C270 670 520 700 800 830s560 170 1200-80"/><path d="M-80 880C270 720 520 750 800 880s560 170 1200-80"/></g><circle cx="1500" cy="280" r="5" fill="#67e2cc"/><circle cx="1500" cy="280" r="28" fill="none" stroke="#67e2cc" stroke-opacity=".2"/></svg>`,
  },
  {
    id: "violet-matrix",
    name: "紫域矩阵",
    description: "靛紫暗底、稀疏矩阵网格和低对比光圈，适合科技与分析看板。",
    preview: "radial-gradient(circle at 76% 25%, #514078 0, transparent 50%), linear-gradient(145deg, #17162b, #0a1726)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#1b1830"/><stop offset=".58" stop-color="#10243a"/><stop offset="1" stop-color="#0a1221"/></linearGradient><radialGradient id="glow"><stop stop-color="#8768d4" stop-opacity=".2"/><stop offset="1" stop-color="#8768d4" stop-opacity="0"/></radialGradient><pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#9e88df" stroke-opacity=".1"/></pattern></defs><rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#glow)"/><rect width="1920" height="1080" fill="url(#grid)"/><g fill="none" stroke="#b19aff" stroke-opacity=".1"><circle cx="1450" cy="350" r="190"/><circle cx="1450" cy="350" r="250"/><circle cx="1450" cy="350" r="320"/></g><path d="M0 900H1920" stroke="#8d8add" stroke-opacity=".13"/><path d="M0 910C420 840 700 940 1080 880s560-20 840-90" fill="none" stroke="#8a79d8" stroke-opacity=".16" stroke-width="2"/></svg>`,
  },
  {
    id: "data-paper",
    name: "浅色数据纸",
    description: "暖白底色、细密辅助网格和淡蓝留白光斑，适合商务汇报。",
    preview: "radial-gradient(circle at 82% 18%, #d7eaff 0, transparent 48%), linear-gradient(135deg, #f8fbff, #eaf1f7)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#f8fbff"/><stop offset="1" stop-color="#eaf1f7"/></linearGradient><radialGradient id="glow"><stop stop-color="#a9d1f4" stop-opacity=".3"/><stop offset="1" stop-color="#a9d1f4" stop-opacity="0"/></radialGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#7194b2" stroke-opacity=".11"/></pattern></defs><rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#glow)"/><rect width="1920" height="1080" fill="url(#grid)"/><path d="M0 870C400 800 680 910 1040 850s570-20 880-100" fill="none" stroke="#5b94c2" stroke-opacity=".16" stroke-width="3"/><path d="M0 910C400 840 680 950 1040 890s570-20 880-100" fill="none" stroke="#5b94c2" stroke-opacity=".1" stroke-width="2"/></svg>`,
  },
  {
    id: "coastal-light",
    name: "海岸晨雾",
    description: "浅蓝雾面渐层、海平线与细弧纹理，让图表保持清晰层级。",
    preview: "radial-gradient(ellipse at 20% 5%, #ffffff 0, transparent 55%), linear-gradient(160deg, #dbeef7, #f5f8fb)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#e8f5fb"/><stop offset=".62" stop-color="#dcebf3"/><stop offset="1" stop-color="#f6f8fa"/></linearGradient><radialGradient id="light"><stop stop-color="#ffffff" stop-opacity=".86"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#bg)"/><ellipse cx="360" cy="120" rx="700" ry="420" fill="url(#light)"/><g fill="none" stroke="#5c9fbe" stroke-opacity=".13"><path d="M-60 650C260 570 470 620 760 680s560 60 1240-110"/><path d="M-60 700C260 620 470 670 760 730s560 60 1240-110"/><path d="M-60 750C260 670 470 720 760 780s560 60 1240-110"/></g><path d="M0 820H1920" stroke="#4d91b0" stroke-opacity=".1"/><circle cx="1560" cy="260" r="140" fill="none" stroke="#76aec6" stroke-opacity=".11"/><circle cx="1560" cy="260" r="200" fill="none" stroke="#76aec6" stroke-opacity=".08"/></svg>`,
  },
];

export const BUILT_IN_BACKGROUND_PRESETS: readonly BuiltInBackgroundPreset[] = Object.freeze(
  source.map(({ svg, ...preset }) => Object.freeze({ ...preset, dataUrl: svgDataUrl(svg) }))
);

export function getBuiltInBackgroundPreset(id: string): Background | null {
  const preset = BUILT_IN_BACKGROUND_PRESETS.find((entry) => entry.id === id);
  return preset ? { kind: "image", src: preset.dataUrl } : null;
}

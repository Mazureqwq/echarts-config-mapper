#!/usr/bin/env python3
"""从 src/assets/geo/china.json 生成简化后的 SVG 缩略图路径（快速样式预览用）。

投影：等距圆柱 + cos(平均纬度) 横向压缩，贴近常用中国地图比例。
简化：Douglas–Peucker（容差 0.35 个 viewBox 单位），保证 34 省路径体积可控。
输出：src/assets/geo/chinaPreview.ts（TS 模块，含路径、空洞与面积标度）。
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src/assets/geo/china.json")
DST = os.path.join(ROOT, "src/assets/geo/chinaPreview.ts")

W = 160.0
TOL = 0.35
PAD = 1.2


def perp(p, a, b):
    """点 p 到线段 a–b 的距离。"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    den = dx * dx + dy * dy
    if den == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den
    t = max(0.0, min(1.0, t))
    px, py = a[0] + t * dx, a[1] + t * dy
    return math.hypot(p[0] - px, p[1] - py)


def dp(points, tol):
    """Douglas–Peucker 折线简化（保留首尾）。"""
    if len(points) < 3:
        return points
    stack = [(0, len(points) - 1)]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    while stack:
        first, last = stack.pop()
        worst, index = 0.0, -1
        for i in range(first + 1, last):
            d = perp(points[i], points[first], points[last])
            if d > worst:
                worst, index = d, i
        if worst > tol and index > 0:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, k in zip(points, keep) if k]


def polygon_parts(geometry):
    """返回 [(outer_rings, hole_rings), ...]：每个可见外环一组，附带其空洞环。"""
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "Polygon":
        if not coords:
            return []
        return [([coords[0]], list(coords[1:]))]
    if kind == "MultiPolygon":
        parts = []
        for polygon in coords:
            if not polygon:
                continue
            parts.append(([polygon[0]], list(polygon[1:])))
        return parts
    return []


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    features = data["features"]
    lats = [f["properties"]["cp"][1] for f in features if f["properties"].get("cp")]
    mean_lat = sum(lats) / len(lats)
    k = math.cos(math.radians(mean_lat))

    pts = []

    def walk(coords):
        if isinstance(coords[0], (int, float)):
            pts.append(coords[:2])
        else:
            for c in coords:
                walk(c)

    for f in features:
        walk(f["geometry"]["coordinates"])

    min_x = min(p[0] for p in pts) * k
    max_x = max(p[0] for p in pts) * k
    min_y = min(p[1] for p in pts)
    max_y = max(p[1] for p in pts)
    span_x = max_x - min_x
    span_y = max_y - min_y
    height = W * span_y / span_x
    scale = (W - 2 * PAD) / span_x

    def project(lng, lat):
        return ((lng * k - min_x) * scale + PAD, (max_y - lat) * scale + PAD)

    def ring_path(ring):
        simplified = dp([project(c[0], c[1]) for c in ring], TOL)
        # 极小行政区（澳门等）简化后不足三点时保留原始折线，避免整省丢失。
        if len(simplified) < 3:
            simplified = [project(c[0], c[1]) for c in ring]
        if len(simplified) < 3:
            return None
        head = simplified[0]
        seg = "M{:.1f} {:.1f}".format(head[0], head[1])
        for x, y in simplified[1:]:
            seg += "L{:.1f} {:.1f}".format(x, y)
        return seg + "Z"

    out = []
    for f in features:
        props = f["properties"]
        name = props["name"]
        size = props.get("size")
        outer_paths = []
        hole_paths = []
        for outer_rings, hole_rings in polygon_parts(f["geometry"]):
            for ring in outer_rings:
                path = ring_path(ring)
                if path:
                    outer_paths.append(path)
            for ring in hole_rings:
                path = ring_path(ring)
                if path:
                    hole_paths.append(path)
        if not outer_paths:
            continue
        out.append({
            "name": name,
            "size": size,
            # 可见外环（多部件要素可能有多个，各自独立填充）
            "d": "".join(outer_paths),
            # 行政缺口等空洞：与外环同路径以 evenodd 规则挖空，不算独立可见区域
            "holes": "".join(hole_paths),
        })

    h = round(height, 1)
    lines = [
        "/**",
        " * 中国省界缩略图路径（由 china.json 经等距圆柱投影 + Douglas–Peucker 简化生成）。",
        " *",
        " * 用途：地图「快速样式」选择器的 3×2 缩略图预览——每个预设按自身色带",
        " * 对真实省界着色，所见即所得，且完全离线（无瓦片、无网络请求）。",
        " *",
        " * 生成脚本：scripts/build-china-preview.py（勿手改，改后重新生成）。",
        " */",
        "export interface ChinaPreviewRegion {",
        "  /** 省级行政区名称 */",
        "  name: string;",
        "  /** 源数据中的规模标度（用于预览着色的相对深浅） */",
        "  size: number;",
        "  /** 可见外环路径（viewBox 坐标系下的 SVG path） */",
        "  d: string;",
        "  /** 行政缺口等空洞路径（与外环一起以 evenodd 规则渲染） */",
        "  holes: string;",
        "}",
        "",
        "/** 预览画布尺寸（viewBox） */",
        "export const CHINA_PREVIEW_VIEWBOX = { width: %s, height: %s };" % (W, h),
        "",
        "/** 省级路径（按名称稳定排序，便于测试断言） */",
        "export const CHINA_PREVIEW_REGIONS: readonly ChinaPreviewRegion[] = [",
    ]
    for r in out:
        lines.append("  { name: %s, size: %s, d: %s, holes: %s }," % (
            json.dumps(r["name"], ensure_ascii=False), r["size"],
            json.dumps(r["d"]), json.dumps(r["holes"])))
    lines.append("];")
    lines.append("")

    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    size = os.path.getsize(DST)
    holes = sum(1 for r in out if r["holes"])
    print("regions=%d with_holes=%d viewBox=%sx%s bytes=%d" % (len(out), holes, W, h, size))
    if len(out) != 34:
        print("WARNING: expected 34 regions", file=sys.stderr)
        return 1
    if size > 120 * 1024:
        print("WARNING: preview module too large", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

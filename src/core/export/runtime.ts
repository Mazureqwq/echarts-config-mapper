/**
 * 产物运行时代码（纯 JavaScript，以字符串形式内联进产物）。
 *
 * 刻意做得很薄：option 在导出时已经算好，运行时只负责
 * 「读 payload → 建舞台 → setOption → 适配窗口 → 轮播」。
 * 因此这里没有任何业务逻辑复制，编辑器的 optionBuilder / pipeline 不会被悄悄分叉。
 * 约束：不得使用 eval / new Function / innerHTML（CSP 与安全清单要求）。
 */
export const RUNTIME_CODE = String.raw`
(function () {
  "use strict";
  var doc = document;
  var root = doc.getElementById("cf-root");
  var failed = false;

  function fail(message) {
    failed = true;
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var box = doc.createElement("div");
    box.className = "cf-error";
    var h = doc.createElement("h1");
    h.textContent = "大屏加载失败";
    var p = doc.createElement("p");
    p.textContent = message;
    var tip = doc.createElement("p");
    tip.className = "cf-error-tip";
    tip.textContent = "如果是文件被改动过，请用新版 ChartForge 重新导出。";
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(tip);
    root.appendChild(box);
  }

  var dataEl = doc.getElementById("cf-payload");
  if (!dataEl) { fail("缺少数据节点（cf-payload）"); return; }
  var payload;
  try {
    payload = JSON.parse(dataEl.textContent || "{}");
  } catch (e) {
    fail("数据解析失败：文件可能被截断或改写");
    return;
  }
  if (!payload || payload.schemaVersion !== 1) {
    fail("产物版本不受支持（schemaVersion=" + (payload && payload.schemaVersion) + "）");
    return;
  }
  var screens = payload.screens || [];
  if (!screens.length) { fail("这个大屏没有任何内容"); return; }

  if (payload.geo && payload.geo.china && window.echarts) {
    try { window.echarts.registerMap("china", payload.geo.china); } catch (e) { /* 地图注册失败不影响其它图表 */ }
  }

  doc.title = payload.title || doc.title;

  var stage = doc.createElement("div");
  stage.className = "cf-stage";
  stage.setAttribute("role", "group");
  root.appendChild(stage);

  var dots = doc.createElement("div");
  dots.className = "cf-dots";
  root.appendChild(dots);

  var charts = [];
  var current = 0;
  var timer = null;
  var paused = false;

  function clearStage() {
    for (var i = 0; i < charts.length; i++) {
      try { charts[i].dispose(); } catch (e) { /* 已销毁 */ }
    }
    charts = [];
    while (stage.firstChild) stage.removeChild(stage.firstChild);
  }

  function backgroundOf(screen) {
    var bg = screen.canvas.background || { kind: "color", color: "#0b1020" };
    if (bg.kind === "gradient") {
      return "linear-gradient(" + (bg.angle || 0) + "deg," + bg.from + "," + bg.to + ")";
    }
    if (bg.kind === "image") {
      return "transparent";
    }
    return bg.color || "#0b1020";
  }

  function place(el, item) {
    var f = item.frame || { x: 0, y: 0, w: 100, h: 100, rotate: 0 };
    el.style.left = f.x + "px";
    el.style.top = f.y + "px";
    el.style.width = f.w + "px";
    el.style.height = f.h + "px";
    if (f.rotate) el.style.transform = "rotate(" + f.rotate + "deg)";
    if (typeof item.opacity === "number" && item.opacity !== 1) {
      el.style.opacity = String(item.opacity);
    }
    el.setAttribute("data-item", item.id || "");
  }

  function addText(item) {
    var el = doc.createElement("div");
    el.className = "cf-item cf-text";
    place(el, item);
    el.style.fontSize = (item.fontSize || 16) + "px";
    el.style.color = item.color || "#ffffff";
    el.style.textAlign = item.align || "left";
    el.style.fontWeight = item.weight === "bold" ? "700" : "400";
    if (item.lineHeight) el.style.lineHeight = String(item.lineHeight);
    el.textContent = item.text == null ? "" : String(item.text);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", item.text ? String(item.text) : "文本");
    stage.appendChild(el);
  }

  function addImage(item) {
    var el = doc.createElement("img");
    el.className = "cf-item cf-image";
    place(el, item);
    el.src = item.src;
    el.alt = item.name || "图片";
    el.setAttribute("referrerpolicy", "no-referrer");
    el.style.objectFit = item.fit || "contain";
    stage.appendChild(el);
  }

  function addShape(item) {
    var el = doc.createElement("div");
    el.className = "cf-item cf-shape";
    place(el, item);
    if (item.shape === "line") {
      el.style.borderTop = (item.strokeWidth || 2) + "px solid " + (item.stroke || "#4f6ef7");
      el.style.height = "0px";
    } else {
      if (item.shape === "ellipse") el.style.borderRadius = "50%";
      else if (item.radius) el.style.borderRadius = item.radius + "px";
      el.style.background = item.fill || "transparent";
      if (item.stroke) el.style.border = (item.strokeWidth || 1) + "px solid " + item.stroke;
    }
    el.setAttribute("aria-hidden", "true");
    stage.appendChild(el);
  }

  function addChart(item) {
    var el = doc.createElement("div");
    el.className = "cf-item cf-chart";
    place(el, item);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", item.alt || item.name || "图表");
    stage.appendChild(el);
    if (!window.echarts) return;
    var chart = window.echarts.init(el, null, { renderer: "canvas" });
    chart.setOption(item.option || {}, true);
    charts.push(chart);
  }

  function render(index) {
    current = index;
    var screen = screens[index];
    if (!screen) return;
    clearStage();
    stage.style.width = screen.canvas.width + "px";
    stage.style.height = screen.canvas.height + "px";
    stage.style.background = backgroundOf(screen);
    var bg = screen.canvas.background || {};
    if (bg.kind === "image" && bg.src) {
      stage.style.backgroundImage = 'url("' + String(bg.src).replace(/"/g, "%22") + '")';
      stage.style.backgroundSize = "cover";
      stage.style.backgroundPosition = "center";
    }
    stage.setAttribute("aria-label", screen.name || "大屏");

    var items = screen.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.kind === "chart") addChart(item);
      else if (item.kind === "text") addText(item);
      else if (item.kind === "image") addImage(item);
      else if (item.kind === "shape") addShape(item);
    }
    paintDots();
    fit();
  }

  function paintDots() {
    while (dots.firstChild) dots.removeChild(dots.firstChild);
    if (screens.length < 2) return;
    for (var i = 0; i < screens.length; i++) {
      var dot = doc.createElement("span");
      dot.className = i === current ? "cf-dot cf-dot--on" : "cf-dot";
      dots.appendChild(dot);
    }
  }

  function fit() {
    var screen = screens[current];
    if (!screen) return;
    var w = screen.canvas.width;
    var h = screen.canvas.height;
    var scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    stage.style.transformOrigin = "top left";
    stage.style.left = Math.round((window.innerWidth - w * scale) / 2) + "px";
    stage.style.top = Math.round((window.innerHeight - h * scale) / 2) + "px";
    stage.style.transform = "scale(" + scale + ")";
    for (var i = 0; i < charts.length; i++) charts[i].resize();
  }

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* 老浏览器 */ }

  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function start() {
    var interval = Number(param("interval"));
    if (!interval || !isFinite(interval) || interval <= 0) interval = screens.length > 1 ? 15 : 0;
    if (screens.length < 2 || interval <= 0 || reduceMotion) return;
    timer = window.setInterval(function () {
      if (paused) return;
      render((current + 1) % screens.length);
    }, Math.max(3, interval) * 1000);
  }

  function go(delta) {
    if (screens.length < 2) return;
    render((current + delta + screens.length) % screens.length);
  }

  doc.addEventListener("keydown", function (e) {
    if (failed) return;
    if (e.key === "ArrowRight") { go(1); }
    else if (e.key === "ArrowLeft") { go(-1); }
    else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      paused = !paused;
      root.setAttribute("data-paused", paused ? "1" : "0");
    }
  });

  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);

  var startIndex = Number(param("screen"));
  render(isFinite(startIndex) && startIndex >= 0 && startIndex < screens.length ? startIndex : 0);
  start();
})();
`;

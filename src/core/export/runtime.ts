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
  var datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
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
  var stateByScreen = Object.create(null);

  function clearStage() {
    for (var i = 0; i < charts.length; i++) {
      try { charts[i].dispose(); } catch (e) { /* 已销毁 */ }
    }
    charts = [];
    while (stage.firstChild) stage.removeChild(stage.firstChild);
  }

  function stateFor(screen) {
    var state = stateByScreen[screen.id];
    if (state) return state;
    var variables = Object.create(null);
    var graph = screen.blueprint || {};
    (Array.isArray(graph.variables) ? graph.variables : []).forEach(function (variable) {
      if (variable && typeof variable.name === "string" && safeKey(variable.name)) variables[variable.name] = cloneData(variable.initialValue);
    });
    state = { variables: variables, filters: Object.create(null), props: Object.create(null), visibility: Object.create(null) };
    stateByScreen[screen.id] = state;
    return state;
  }

  function themeTokens(screen) {
    if (screen.themeId === "business-light") return { panel: "#ffffff", text: "#172b4d", muted: "#63758b", accent: "#3478f6", border: "#d8e1ed" };
    if (screen.themeId === "monitor-dark") return { panel: "#0d2234", text: "#e8f4ff", muted: "#89a8be", accent: "#29d3ff", border: "#214258" };
    return { panel: "#202a39", text: "#e8edf7", muted: "#a4afbf", accent: "#6c8cff", border: "#344054" };
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

  function safeImageData(value) {
    return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(String(value || ""));
  }

  function addImage(item) {
    if (!safeImageData(item.src)) return;
    var el = doc.createElement("img");
    el.className = "cf-item cf-image";
    place(el, item);
    el.src = item.src;
    el.alt = item.name || "图片";
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

  function cloneData(value) {
    if (value === undefined) return null;
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return {}; }
  }

  function safeKey(key) { return key !== "__proto__" && key !== "prototype" && key !== "constructor"; }
  function safeField(value, fallback) { return typeof value === "string" && value && safeKey(value) ? value : fallback; }
  function safeMerge() {
    var out = Object.create(null);
    for (var i = 0; i < arguments.length; i++) {
      var source = arguments[i];
      if (!source || typeof source !== "object") continue;
      Object.keys(source).forEach(function (key) { if (safeKey(key)) out[key] = source[key]; });
    }
    return out;
  }

  function datasetRows(binding, screen) {
    if (!binding || !binding.datasetId) return [];
    var entry = datasets.filter(function (dataset) { return dataset && dataset.id === binding.datasetId; })[0];
    var rows = entry && Array.isArray(entry.rows) ? entry.rows.slice() : [];
    var state = stateFor(screen);
    var globalFilter = state.filters[binding.datasetId];
    if (globalFilter && safeKey(globalFilter.field)) rows = rows.filter(function (row) { return String(row[globalFilter.field] == null ? "" : row[globalFilter.field]) === String(globalFilter.value == null ? "" : globalFilter.value); });
    var filter = binding.filterBy;
    if (filter && safeKey(filter.field) && Object.prototype.hasOwnProperty.call(state.variables, filter.globalVariable)) {
      var expected = state.variables[filter.globalVariable];
      rows = rows.filter(function (row) { return String(row[filter.field] == null ? "" : row[filter.field]) === String(expected == null ? "" : expected); });
    }
    return rows;
  }

  function asNumber(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && isFinite(Number(value))) return Number(value);
    return null;
  }

  function chartOption(item, screen) {
    var option = cloneData(item.option || {});
    if (!item.dataBinding) return option;
    var rows = datasetRows(item.dataBinding, screen);
    var fields = item.dataBinding.fields || {};
    var keys = rows.length ? Object.keys(rows[0]) : [];
    var category = safeField(fields.category, keys[0] || "name");
    var value = safeField(fields.value, keys[1] || "value");
    var seriesField = safeField(fields.seriesField, "");
    var seriesTemplate = Array.isArray(option.series) && option.series.length ? option.series[0] : {};
    if (item.type === "pie" || item.type === "map") {
      var points = rows.map(function (row) { return { name: row[category] == null ? "" : String(row[category]), value: asNumber(row[value]) || 0 }; });
      option.series = [Object.assign({}, seriesTemplate, { data: points })];
      return option;
    }
    if (item.type === "scatter") {
      var pointsXY = rows.map(function (row) { return [asNumber(row[category]) || 0, asNumber(row[value]) || 0]; });
      option.series = [Object.assign({}, seriesTemplate, { data: pointsXY })];
      return option;
    }
    if (item.type === "radar") {
      var radarCategories = []; var radarGroups = Object.create(null); var radarNames = [];
      rows.forEach(function (row) {
        var label = row[category] == null ? "" : String(row[category]);
        if (radarCategories.indexOf(label) < 0) radarCategories.push(label);
        var group = seriesField ? String(row[seriesField] == null ? "" : row[seriesField]) : (seriesTemplate.name || "数据");
        if (!radarGroups[group]) { radarGroups[group] = Object.create(null); radarNames.push(group); }
        radarGroups[group][label] = asNumber(row[value]) || 0;
      });
      var radarMax = rows.reduce(function (max, row) { return Math.max(max, asNumber(row[value]) || 0); }, 0);
      option.radar = Object.assign({}, option.radar || {}, { indicators: radarCategories.map(function (name) { return { name: name, max: radarMax > 0 ? Math.ceil(radarMax * 1.2) : 100 }; }) });
      option.series = [Object.assign({}, seriesTemplate, { type: "radar", data: radarNames.map(function (name) { return { name: name, value: radarCategories.map(function (label) { return radarGroups[name][label] || 0; }) }; }) })];
      return option;
    }
    var categories = [];
    var groups = Object.create(null);
    var groupNames = [];
    rows.forEach(function (row) {
      var label = row[category] == null ? "" : String(row[category]);
      if (categories.indexOf(label) < 0) categories.push(label);
      var group = seriesField ? String(row[seriesField] == null ? "" : row[seriesField]) : (seriesTemplate.name || "数据");
      if (!groups[group]) { groups[group] = Object.create(null); groupNames.push(group); }
      groups[group][label] = asNumber(row[value]) || 0;
    });
    var templates = Array.isArray(option.series) ? option.series : [];
    option.series = groupNames.map(function (name, index) {
      var template = templates[index] || templates[0] || {};
      return Object.assign({}, template, { name: name, data: categories.map(function (label) { return groups[name][label] || 0; }) });
    });
    if (!option.series.length) option.series = [Object.assign({}, seriesTemplate, { data: [] })];
    if (!option.xAxis || typeof option.xAxis !== "object") option.xAxis = {};
    option.xAxis.data = categories;
    return option;
  }

  function formatWidget(value, format) {
    if (value == null) return "—";
    var number = asNumber(value);
    if (format === "text" || number === null) {
      if (typeof value === "object") { try { return JSON.stringify(value); } catch (e) { return "[对象]"; } }
      return String(value);
    }
    try {
      if (format === "percent") return new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2 }).format(number);
      if (format === "currency") return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(number);
      return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number);
    } catch (e) { return String(number); }
  }

  function safeWidgetColor(value, fallback) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  function boundedWidgetNumber(value, fallback, minimum, maximum) {
    if (typeof value !== "number" || !isFinite(value)) return fallback;
    return Math.min(maximum, Math.max(minimum, value));
  }

  function widgetText(value, fallback) {
    if (value === null || value === undefined) return fallback;
    var text = formatWidget(value, "text");
    return text && text.trim() ? text : fallback;
  }

  function addProgressList(rootEl, props, rows, tokens) {
    rootEl.className += " cf-progress-list";
    var labelField = safeField(props.labelField, "name");
    var valueField = safeField(props.valueField, "value");
    var maximum = asNumber(props.maxValue);
    if (maximum === null || maximum <= 0) maximum = 100;
    var trackColor = safeWidgetColor(props.trackColor, tokens.border);
    var fillColor = safeWidgetColor(props.fillColor, tokens.accent);
    var progressRows = [];
    rows.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      var value = asNumber(row[valueField]);
      if (value === null) return;
      var labelValue = row[labelField];
      var label = labelValue === null || labelValue === undefined || (typeof labelValue === "string" && !labelValue.trim())
        ? "—" : widgetText(labelValue, "—").trim() || "—";
      var percent = Math.round(Math.min(100, Math.max(0, value / maximum * 100)) * 100) / 100;
      progressRows.push({ label: label, value: value, percent: percent });
    });
    if (!progressRows.length) { rootEl.textContent = "暂无可展示的数据"; return; }
    progressRows.forEach(function (row) {
      var rowEl = doc.createElement("div"); rowEl.className = "cf-progress-row";
      var heading = doc.createElement("div"); heading.className = "cf-progress-heading";
      var label = doc.createElement("span"); label.className = "cf-progress-label"; label.textContent = row.label;
      heading.appendChild(label);
      if (props.showValue !== false) {
        var valueEl = doc.createElement("span"); valueEl.className = "cf-progress-value"; valueEl.textContent = formatWidget(row.value, "number"); heading.appendChild(valueEl);
      }
      var track = doc.createElement("div"); track.className = "cf-progress-track";
      track.setAttribute("role", "progressbar"); track.setAttribute("aria-label", row.label);
      track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(row.percent)); track.setAttribute("aria-valuetext", formatWidget(row.value, "number"));
      track.style.backgroundColor = trackColor;
      var fill = doc.createElement("span"); fill.className = "cf-progress-fill";
      fill.style.width = row.percent + "%"; fill.style.backgroundColor = fillColor;
      track.appendChild(fill); rowEl.appendChild(heading); rowEl.appendChild(track); rootEl.appendChild(rowEl);
    });
  }

  function addSectionTitle(rootEl, props, tokens) {
    var variants = ["underline", "bar", "bracket"];
    var variant = variants.indexOf(props.variant) >= 0 ? props.variant : "underline";
    var accent = safeWidgetColor(props.accentColor, tokens.accent);
    rootEl.className += " cf-section-title cf-section-title--" + variant;
    rootEl.style.display = "flex"; rootEl.style.alignItems = "center"; rootEl.style.padding = "10px 18px";
    rootEl.style.overflow = "hidden";
    rootEl.style.borderBottom = variant === "underline" ? "1px solid " + safeWidgetColor(tokens.border, "#344054") : "none";
    var mark = doc.createElement("span"); mark.className = "cf-section-title__mark"; mark.setAttribute("aria-hidden", "true");
    mark.style.backgroundColor = variant === "bracket" ? "transparent" : accent;
    if (variant === "bracket") { mark.style.borderColor = accent; mark.style.borderStyle = "solid"; mark.style.borderWidth = "2px 0 0 2px"; }
    rootEl.appendChild(mark);
    var body = doc.createElement("div"); body.className = "cf-section-title__body";
    var title = doc.createElement("h2"); title.className = "cf-section-title__title"; title.textContent = widgetText(props.title, "分区标题");
    body.appendChild(title);
    if (typeof props.subtitle === "string" && props.subtitle) {
      var subtitle = doc.createElement("p"); subtitle.className = "cf-section-title__subtitle"; subtitle.textContent = props.subtitle; body.appendChild(subtitle);
    }
    rootEl.appendChild(body);
    if (variant === "bracket") {
      var endMark = doc.createElement("span"); endMark.className = "cf-section-title__bracket-end"; endMark.setAttribute("aria-hidden", "true");
      endMark.style.borderColor = accent; endMark.style.borderStyle = "solid"; endMark.style.borderWidth = "0 2px 2px 0"; rootEl.appendChild(endMark);
    }
  }

  function addCornerFrame(rootEl, props, tokens) {
    var variants = ["corner", "outline", "double"];
    var variant = variants.indexOf(props.variant) >= 0 ? props.variant : "corner";
    var color = safeWidgetColor(props.color, tokens.accent);
    var thickness = boundedWidgetNumber(props.thickness, 2, 1, 8);
    var inset = boundedWidgetNumber(props.inset, 8, 0, 32);
    rootEl.className += " cf-corner-frame cf-corner-frame--" + variant;
    rootEl.style.overflow = "visible"; rootEl.style.pointerEvents = "none"; rootEl.setAttribute("aria-hidden", "true");
    if (variant === "corner") {
      var positions = [
        { name: "top-left", top: inset, left: inset, width: thickness + "px 0 0 " + thickness + "px" },
        { name: "top-right", top: inset, right: inset, width: thickness + "px " + thickness + "px 0 0" },
        { name: "bottom-left", bottom: inset, left: inset, width: "0 0 " + thickness + "px " + thickness + "px" },
        { name: "bottom-right", right: inset, bottom: inset, width: "0 " + thickness + "px " + thickness + "px 0" },
      ];
      positions.forEach(function (position) {
        var corner = doc.createElement("span"); corner.className = "cf-corner-frame__corner cf-corner-frame__corner--" + position.name;
        corner.style.position = "absolute"; corner.style.boxSizing = "border-box"; corner.style.width = "22px"; corner.style.height = "22px";
        if (position.top !== undefined) corner.style.top = position.top + "px";
        if (position.right !== undefined) corner.style.right = position.right + "px";
        if (position.bottom !== undefined) corner.style.bottom = position.bottom + "px";
        if (position.left !== undefined) corner.style.left = position.left + "px";
        corner.style.borderStyle = "solid"; corner.style.borderColor = color; corner.style.borderWidth = position.width;
        rootEl.appendChild(corner);
      });
      return;
    }
    function appendOutline(offset, lineWidth) {
      var outline = doc.createElement("div"); outline.className = "cf-corner-frame__outline";
      outline.style.position = "absolute"; outline.style.boxSizing = "border-box";
      outline.style.top = offset + "px"; outline.style.right = offset + "px"; outline.style.bottom = offset + "px"; outline.style.left = offset + "px";
      outline.style.borderStyle = "solid"; outline.style.borderColor = color; outline.style.borderWidth = lineWidth + "px";
      rootEl.appendChild(outline);
    }
    appendOutline(variant === "outline" ? inset : 0, thickness);
    if (variant === "double") appendOutline(inset + 8, 1);
  }

  function addComponent(item, screen) {
    var state = stateFor(screen);
    var props = safeMerge(item.props || {}, state.props[item.componentId] || {});
    var rows = datasetRows(item.dataBinding, screen);
    var tokens = themeTokens(screen);
    var rootEl = doc.createElement("div");
    rootEl.className = "cf-item cf-component";
    rootEl.style.color = tokens.text;
    place(rootEl, item);
    rootEl.setAttribute("data-component", item.componentId);
    if (item.componentId === "chartforge.data-table" && item.componentVersion === 1) {
      rootEl.className += " cf-data-table";
      var columns = Array.isArray(props.columns) ? props.columns.filter(function (column) { return column && typeof column === "object" && safeField(column.field, ""); }) : [];
      if (columns.length) {
        var table = doc.createElement("table");
        var thead = doc.createElement("thead");
        var headRow = doc.createElement("tr");
        columns.forEach(function (column) { var th = doc.createElement("th"); th.textContent = String(column.label || column.field || ""); th.style.backgroundColor = tokens.panel; th.style.color = tokens.text; th.style.borderBottom = "1px solid " + tokens.border; if (["left", "center", "right"].indexOf(column.align) >= 0) th.style.textAlign = column.align; if (typeof column.width === "number" && column.width > 0) th.style.width = column.width + "px"; headRow.appendChild(th); });
        thead.appendChild(headRow); table.appendChild(thead);
        var tbody = doc.createElement("tbody");
        rows.forEach(function (row, index) {
          var tr = doc.createElement("tr");
          columns.forEach(function (column) { var td = doc.createElement("td"); td.textContent = formatWidget(row[column.field], column.format || "text"); td.style.borderBottom = "1px solid " + tokens.border; if (["left", "center", "right"].indexOf(column.align) >= 0) td.style.textAlign = column.align; if (typeof column.width === "number" && column.width > 0) td.style.width = column.width + "px"; tr.appendChild(td); });
          tr.addEventListener("click", function () { runBlueprint(item, screen, "rowSelect", { row: row, index: index }); });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody); rootEl.appendChild(table);
      } else { rootEl.textContent = "暂无可显示列"; }
    } else if (item.componentId === "chartforge.kpi" && item.componentVersion === 1) {
      rootEl.className += " cf-kpi";
      rootEl.style.backgroundColor = tokens.panel;
      rootEl.style.border = "1px solid " + tokens.border;
      var valueField = safeField(props.valueField, "value");
      var values = rows.map(function (row) { return asNumber(row[valueField]); }).filter(function (value) { return value !== null; });
      var aggregate = 0;
      if (values.length) aggregate = props.aggregation === "first" ? values[0] : values.reduce(function (sum, value) { return sum + value; }, 0) / (props.aggregation === "average" ? values.length : 1);
      var label = doc.createElement("span"); label.className = "cf-kpi-label"; label.style.color = tokens.muted; label.textContent = String(props.label || "指标");
      var valueEl = doc.createElement("strong"); valueEl.className = "cf-kpi-value"; valueEl.style.color = tokens.text; valueEl.textContent = formatWidget(aggregate, props.format || "number");
      rootEl.appendChild(label); rootEl.appendChild(valueEl);
    } else if (item.componentId === "chartforge.progress-list" && item.componentVersion === 1) {
      addProgressList(rootEl, props, rows, tokens);
    } else if (item.componentId === "chartforge.section-title" && item.componentVersion === 1) {
      addSectionTitle(rootEl, props, tokens);
    } else if (item.componentId === "chartforge.corner-frame" && item.componentVersion === 1) {
      addCornerFrame(rootEl, props, tokens);
    }
    stage.appendChild(rootEl);
  }

  function addChart(item, screen) {
    var el = doc.createElement("div");
    el.className = "cf-item cf-chart";
    place(el, item);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", item.alt || item.name || "图表");
    stage.appendChild(el);
    if (!window.echarts) return;
    var chart = window.echarts.init(el, null, { renderer: "canvas" });
    chart.setOption(chartOption(item, screen), true);
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
    if (bg.kind === "image" && safeImageData(bg.src)) {
      stage.style.backgroundImage = 'url("' + String(bg.src).replace(/"/g, "%22") + '")';
      stage.style.backgroundSize = "cover";
      stage.style.backgroundPosition = "center";
    }
    stage.setAttribute("aria-label", screen.name || "大屏");

    var items = screen.items || [];
    var state = stateFor(screen);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.hidden || state.visibility[item.componentId] === false) continue;
      if (item.kind === "chart") addChart(item, screen);
      else if (item.kind === "component") addComponent(item, screen);
      else if (item.kind === "text") addText(item);
      else if (item.kind === "image") addImage(item);
      else if (item.kind === "shape") addShape(item);
    }
    paintDots();
    fit();
  }

  function matchesVariable(screen, name, value) {
    var variable = (screen.blueprint && Array.isArray(screen.blueprint.variables) ? screen.blueprint.variables : []).filter(function (entry) { return entry && entry.name === name; })[0];
    if (!variable) return false;
    if (variable.type === "string") return typeof value === "string";
    if (variable.type === "number") return typeof value === "number" && isFinite(value);
    if (variable.type === "boolean") return typeof value === "boolean";
    return value === null || typeof value === "object";
  }

  function resolveRef(ref, payload, state) {
    if (!ref || typeof ref !== "object") return { ok: false };
    if (ref.source === "literal") return { ok: true, value: ref.value };
    if (ref.source === "variable") return Object.prototype.hasOwnProperty.call(state.variables, ref.name) ? { ok: true, value: state.variables[ref.name] } : { ok: false };
    if (ref.source === "event") {
      var value = payload;
      var parts = String(ref.path || "").split(".");
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i] || parts[i] === "__proto__" || parts[i] === "prototype" || parts[i] === "constructor" || value == null || !Object.prototype.hasOwnProperty.call(value, parts[i])) return { ok: false };
        value = value[parts[i]];
      }
      return { ok: true, value: value };
    }
    return { ok: false };
  }

  function compareValue(op, left, right) {
    if (op === "eq") return left === right;
    if (op === "ne") return left !== right;
    if (op === "contains") return typeof left === "string" && typeof right === "string" ? left.indexOf(right) >= 0 : Array.isArray(left) ? left.indexOf(right) >= 0 : false;
    if (typeof left !== typeof right || (typeof left !== "number" && typeof left !== "string")) return false;
    if (op === "gt") return left > right; if (op === "gte") return left >= right; if (op === "lt") return left < right; if (op === "lte") return left <= right;
    return false;
  }

  function runBlueprint(item, screen, eventName, eventPayload) {
    var graph = screen.blueprint;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return;
    var state = stateFor(screen);
    var roots = graph.nodes.filter(function (node) { return node.kind === "componentEvent" && node.componentId === item.componentId && node.componentVersion === item.componentVersion && node.event === eventName; });
    var queue = roots.map(function (node) { return { id: node.id, event: true }; });
    var byId = Object.create(null); graph.nodes.forEach(function (node) { if (node && typeof node.id === "string") byId[node.id] = node; });
    var visited = Object.create(null);
    var changed = false;
    while (queue.length && Object.keys(visited).length < 200) {
      var currentNode = queue.shift();
      if (!currentNode || visited[currentNode.id]) continue;
      visited[currentNode.id] = true;
      var node = byId[currentNode.id]; if (!node) continue;
      var port = "next";
      if (node.kind === "setVariable") {
        var resolved = resolveRef(node.value, eventPayload, state);
        if (resolved.ok && safeKey(node.name) && Object.prototype.hasOwnProperty.call(state.variables, node.name) && matchesVariable(screen, node.name, resolved.value)) { state.variables[node.name] = cloneData(resolved.value); changed = true; }
      } else if (node.kind === "condition") {
        var left = resolveRef(node.left, eventPayload, state); var right = resolveRef(node.right, eventPayload, state);
        port = left.ok && right.ok && compareValue(node.op, left.value, right.value) ? "true" : "false";
      } else if (node.kind === "fieldTransform") {
        var input = resolveRef(node.input, eventPayload, state); var value = input.value;
        if (input.ok && node.outputVariable && node.outputVariable !== "__proto__" && node.outputVariable !== "constructor") {
          if (node.op === "toString") value = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
          else if (node.op === "toNumber") value = asNumber(value);
          else if (node.op === "uppercase" && typeof value === "string") value = value.toUpperCase();
          else if (node.op === "lowercase" && typeof value === "string") value = value.toLowerCase();
          if (value !== null && Object.prototype.hasOwnProperty.call(state.variables, node.outputVariable) && matchesVariable(screen, node.outputVariable, value)) { state.variables[node.outputVariable] = value; changed = true; }
        }
      } else if (node.kind === "datasetAction" && node.action === "filter") {
        state.filters[node.datasetId] = { field: node.field, value: state.variables[node.globalVariable] }; changed = true;
      } else if (node.kind === "componentAction") {
        if (node.action === "setVisibility") state.visibility[node.componentId] = node.visible;
        else if (node.action === "setProps") state.props[node.componentId] = safeMerge(state.props[node.componentId] || {}, node.props || {});
        changed = true;
      } else if (node.kind === "navigateScreen") {
        var targetIndex = screens.findIndex(function (entry) { return entry.id === node.screenId; });
        if (targetIndex >= 0) current = targetIndex;
      }
      graph.edges.forEach(function (edge) { if (edge.from && edge.from.nodeId === node.id && edge.from.port === port && edge.to) queue.push({ id: edge.to.nodeId }); });
    }
    if (changed || current !== screens.indexOf(screen)) render(current);
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

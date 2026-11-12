/**
 * 产物运行时代码（纯 JavaScript，以字符串形式内联进产物）。
 *
 * 刻意做得很薄：option 在导出时已经算好，运行时主要负责
 * 「读 payload → 建舞台 → setOption → 适配窗口 → 轮播」。
 * 唯一的数据转换例外是受限的、字段映射驱动的离线地图绑定，以支持包内数据与蓝图筛选刷新。
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
    var fontFamilies = ["system-ui", "Arial", "Microsoft YaHei", "SimHei", "SimSun", "serif", "monospace"];
    var family = fontFamilies.indexOf(item.fontFamily) >= 0 ? item.fontFamily : "system-ui";
    var weights = ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
    var weight = weights.indexOf(String(item.weight)) >= 0 ? String(item.weight) : "normal";
    el.style.boxSizing = "border-box"; el.style.display = "flex"; el.style.flexDirection = "column";
    el.style.justifyContent = item.verticalAlign === "middle" ? "center" : item.verticalAlign === "bottom" ? "flex-end" : "flex-start";
    el.style.overflow = "hidden"; el.style.padding = boundedWidgetNumber(item.padding, 0, 0, 128) + "px";
    el.style.backgroundColor = safeWidgetColor(item.backgroundColor, "transparent");
    var borderWidth = boundedWidgetNumber(item.borderWidth, 0, 0, 16);
    if (borderWidth > 0) el.style.border = borderWidth + "px solid " + safeWidgetColor(item.borderColor, "#344054");
    if (boundedWidgetNumber(item.radius, 0, 0, 128) > 0) el.style.borderRadius = boundedWidgetNumber(item.radius, 0, 0, 128) + "px";
    var content = doc.createElement("span");
    content.style.display = item.overflow === "ellipsis" ? "-webkit-box" : "block";
    content.style.overflow = "hidden"; content.style.width = "100%";
    if (item.overflow === "ellipsis") {
      content.style.webkitBoxOrient = "vertical";
      content.style.webkitLineClamp = String(Math.round(boundedWidgetNumber(item.lineClamp, 2, 1, 30)));
      content.style.textOverflow = "ellipsis";
    }
    content.style.fontFamily = family;
    content.style.fontSize = boundedWidgetNumber(item.fontSize, 16, 1, 1000) + "px";
    content.style.fontStyle = ["normal", "italic", "oblique"].indexOf(item.fontStyle) >= 0 ? item.fontStyle : "normal";
    content.style.color = safeWidgetColor(item.color, "#ffffff");
    content.style.textAlign = ["left", "center", "right"].indexOf(item.align) >= 0 ? item.align : "left";
    content.style.fontWeight = weight;
    content.style.lineHeight = String(boundedWidgetNumber(item.lineHeight, 1.4, 0.5, 4));
    content.style.letterSpacing = boundedWidgetNumber(item.letterSpacing, 0, -16, 64) + "px";
    content.style.whiteSpace = "pre-wrap"; content.style.wordBreak = "break-word";
    if (item.shadow && typeof item.shadow === "object") {
      var shadowColor = safeWidgetColor(item.shadow.color, "#00cfff");
      var shadowX = boundedWidgetNumber(item.shadow.offsetX, 0, -64, 64);
      var shadowY = boundedWidgetNumber(item.shadow.offsetY, 0, -64, 64);
      var shadowBlur = boundedWidgetNumber(item.shadow.blur, 0, 0, 64);
      content.style.textShadow = shadowX + "px " + shadowY + "px " + shadowBlur + "px " + shadowColor;
    }
    content.textContent = item.text == null ? "" : String(item.text);
    el.appendChild(content);
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
    if (item.type === "geoScatter" || item.type === "geoHeatmap" || item.type === "geoFlow") {
      var mapping = fields.geo && typeof fields.geo === "object" ? fields.geo : {};
      function geoField(name) {
        var candidate = mapping[name];
        if (typeof candidate !== "string") return "";
        candidate = candidate.trim();
        return candidate && safeKey(candidate) ? candidate : "";
      }
      function geoCoordinate(row, longitudeKey, latitudeKey) {
        if (!longitudeKey || !latitudeKey) return null;
        var longitude = asNumber(row[longitudeKey]); var latitude = asNumber(row[latitudeKey]);
        if (longitude === null || latitude === null || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
        return [longitude, latitude];
      }
      function geoName(row, field) {
        if (!field) return "";
        var rawName = row[field];
        if (typeof rawName !== "string" && typeof rawName !== "number") return "";
        return String(rawName).trim();
      }
      var geoValueField = geoField("value");
      var geoData = [];
      if (item.type === "geoFlow") {
        var originLongitude = geoField("originLongitude"); var originLatitude = geoField("originLatitude");
        var destinationLongitude = geoField("destinationLongitude"); var destinationLatitude = geoField("destinationLatitude");
        rows.forEach(function (row) {
          var from = geoCoordinate(row, originLongitude, originLatitude);
          var to = geoCoordinate(row, destinationLongitude, destinationLatitude);
          var numericValue = geoValueField ? asNumber(row[geoValueField]) : null;
          if (!from || !to || (geoValueField && numericValue === null)) return;
          var flow = { coords: [from, to] };
          var flowName = geoName(row, geoField("name"));
          if (flowName) flow.name = flowName;
          if (numericValue !== null) flow.value = numericValue;
          geoData.push(flow);
        });
      } else {
        var longitudeField = geoField("longitude"); var latitudeField = geoField("latitude");
        rows.forEach(function (row) {
          var point = geoCoordinate(row, longitudeField, latitudeField);
          var numericValue = geoValueField ? asNumber(row[geoValueField]) : null;
          if (!point || (geoValueField && numericValue === null) || (item.type === "geoHeatmap" && numericValue === null)) return;
          if (item.type === "geoHeatmap") geoData.push([point[0], point[1], numericValue]);
          else {
            var scatter = { value: numericValue === null ? point : [point[0], point[1], numericValue] };
            var pointName = geoName(row, geoField("name"));
            if (pointName) scatter.name = pointName;
            geoData.push(scatter);
          }
        });
      }
      option.series = [Object.assign({}, seriesTemplate, { data: geoData })];
      return option;
    }
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
      option.radar = Object.assign({}, option.radar || {}, { indicator: radarCategories.map(function (name) { return { name: name, max: radarMax > 0 ? Math.ceil(radarMax * 1.2) : 100 }; }) });
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


  function cfMixHex(a, b, t) {
    function parse(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
    var pa = parse(a); var pb = parse(b);
    var tt = Math.min(1, Math.max(0, t));
    var out = "#";
    for (var i = 0; i < 3; i++) { var v = Math.round(pa[i] + (pb[i] - pa[i]) * tt); out += (v < 16 ? "0" : "") + v.toString(16); }
    return out;
  }
  function cfRampColor(colors, t) {
    var c = Math.min(1, Math.max(0, t));
    return c <= 0.5 ? cfMixHex(colors.min, colors.mid, c * 2) : cfMixHex(colors.mid, colors.max, (c - 0.5) * 2);
  }
  function cfSegmentPieces(colors, min, max, count) {
    var n = Math.min(10, Math.max(2, Math.round(count)));
    var span = max - min; var pieces = [];
    for (var k = 0; k < n; k++) {
      var color = k === 0 ? colors.min : k === n - 1 ? colors.max : cfRampColor(colors, k / (n - 1));
      var lo = min + span * k / n; var hi = min + span * (k + 1) / n;
      if (k === 0) pieces.push({ lte: hi, color: color });
      else if (k === n - 1) pieces.push({ gt: lo, color: color });
      else pieces.push({ gt: lo, lte: hi, color: color });
    }
    return pieces;
  }
  function cfFormatMapValue(value, fmt) {
    if (value === null || value === undefined || !isFinite(value)) return "\u2014";
    var decimals = fmt && typeof fmt.decimals === "number" ? Math.min(4, Math.max(0, Math.round(fmt.decimals))) : 0;
    var text = value.toFixed(decimals);
    return fmt && typeof fmt.suffix === "string" && fmt.suffix ? text + fmt.suffix : text;
  }
  var CF_CHINA_REGIONS = ["新疆维吾尔自治区", "西藏自治区", "内蒙古自治区", "青海省", "四川省", "黑龙江省", "甘肃省", "云南省", "广西壮族自治区", "湖南省", "陕西省", "广东省", "吉林省", "河北省", "湖北省", "贵州省", "山东省", "江西省", "河南省", "辽宁省", "山西省", "安徽省", "福建省", "浙江省", "江苏省", "重庆市", "宁夏回族自治区", "海南省", "台湾省", "北京市", "天津市", "上海市", "香港特别行政区", "澳门特别行政区"];
  function safeMapScene(item, rootEl, rows, props, screen) {
    var layerTypes = ["regionFill", "geoScatter", "geoHeatmap", "geoFlow"];
    var fallbackPresentation = item.componentId === "chartforge.map-scene-tilted" ? "tilted" : "flat";
    var presentation = props.presentation === "tilted" || props.presentation === "flat" ? props.presentation : fallbackPresentation;
        var rawView = props.view && typeof props.view === "object" ? props.view : {};
    var rawCenter = Array.isArray(rawView.center) ? rawView.center : [];
    var minZoom = boundedWidgetNumber(rawView.minZoom, 1, 0.5, 20);
    var maxZoom = boundedWidgetNumber(rawView.maxZoom, Math.max(minZoom, 8), minZoom, 20);
    var zoomFallback = Math.min(maxZoom, Math.max(minZoom, 1.05));
    var view = {
      center: [boundedWidgetNumber(rawCenter[0], 104.114129, -180, 180), boundedWidgetNumber(rawCenter[1], 35.550339, -90, 90)],
      zoom: boundedWidgetNumber(rawView.zoom, zoomFallback, minZoom, maxZoom), minZoom: minZoom, maxZoom: maxZoom,
      dragEnabled: typeof rawView.dragEnabled === "boolean" ? rawView.dragEnabled : true,
      zoomEnabled: typeof rawView.zoomEnabled === "boolean" ? rawView.zoomEnabled : true,
      showLabels: typeof rawView.showLabels === "boolean" ? rawView.showLabels : true,
      backgroundColor: safeWidgetColor(rawView.backgroundColor, "#081622")
    };
    var roam = view.dragEnabled && view.zoomEnabled ? true : view.dragEnabled ? "move" : view.zoomEnabled ? "scale" : false;
     var labelGroup = props.label && typeof props.label === "object" ? props.label : { show: true, color: "#e7fbff", size: 10 };
     var labelCfg = { show: view.showLabels && labelGroup.show !== false, color: safeWidgetColor(labelGroup.color, "#e7fbff"), fontSize: boundedWidgetNumber(labelGroup.size, 10, 8, 40) };
     if (typeof labelGroup.stroke === "string" && /^#[0-9a-fA-F]{6}$/.test(labelGroup.stroke)) { labelCfg.stroke = labelGroup.stroke; labelCfg.strokeWidth = boundedWidgetNumber(labelGroup.strokeWidth, 1, 0, 6); }
     if (typeof labelGroup.shadow === "string" && /^#[0-9a-fA-F]{6}$/.test(labelGroup.shadow)) { labelCfg.textShadowColor = labelGroup.shadow; labelCfg.textShadowBlur = boundedWidgetNumber(labelGroup.shadowBlur, 0, 0, 24); }
     var borderGroup = props.border && typeof props.border === "object" ? props.border : { color: "#c0f3fb", width: 1, type: "solid" };
     var emphasisCfg = props.emphasis && typeof props.emphasis === "object"
       ? { label: { color: safeWidgetColor(props.emphasis.labelColor, "#ffffff") }, itemStyle: { areaColor: safeWidgetColor(props.emphasis.areaColor, "#3a95fd"), borderColor: safeWidgetColor(props.emphasis.borderColor, "#ffffff") } }
       : { label: { color: "#ffffff" }, itemStyle: { areaColor: "rgba(0,254,233,0.6)" } };
     var tooltipCfg = props.tooltipStyle && typeof props.tooltipStyle === "object"
       ? { trigger: "item", backgroundColor: safeWidgetColor(props.tooltipStyle.background, "#07121d"), borderColor: safeWidgetColor(props.tooltipStyle.borderColor, "#1f2a3a"), textStyle: { color: safeWidgetColor(props.tooltipStyle.color, "#e7fbff"), fontSize: boundedWidgetNumber(props.tooltipStyle.fontSize, 12, 8, 32) } }
       : { trigger: "item" };
     var geoBase = { map: "china", center: view.center, zoom: view.zoom, roam: roam, scaleLimit: { min: view.minZoom, max: view.maxZoom }, label: labelCfg, itemStyle: { areaColor: { type: "linear", x: 1, y: 0, x2: 0, y2: 0, colorStops: [{ offset: 0, color: "rgba(3,27,78,0.88)" }, { offset: 1, color: "rgba(58,149,253,0.88)" }] }, borderColor: safeWidgetColor(borderGroup.color, "#c0f3fb"), borderWidth: boundedWidgetNumber(borderGroup.width, 1, 0, 8), borderType: borderGroup.type === "dashed" ? "dashed" : "solid", shadowColor: "#8cd3ef", shadowOffsetY: 10, shadowBlur: 28 }, emphasis: emphasisCfg };
     // Three purposeful underlays: deep base shadow, mid sidewall, and bright top rim.
      var DEFAULT_EXTRUSION = [{ offset: 3, areaColor: "rgba(5,21,35,0.12)", borderColor: "rgba(58,149,253,0.45)", shadowColor: "rgba(58,149,253,0.85)", shadowOffsetY: 10, shadowBlur: 8 }, { offset: 2, areaColor: "rgba(5,21,35,0.1)", borderColor: "rgba(58,149,253,0.68)", shadowColor: "rgba(65,214,255,0.72)", shadowOffsetY: 6, shadowBlur: 10 }, { offset: 1, areaColor: "#10273a", borderColor: "#b5f3ff", shadowColor: "#8cd3ef", shadowOffsetY: 4, shadowBlur: 10 }];
      var extrusionLayers = props.underlay && Array.isArray(props.underlay)
        ? DEFAULT_EXTRUSION.map(function (base, index) {
            var palette = props.underlay[index];
            return palette && typeof palette === "object"
              ? Object.assign({}, base, { areaColor: palette.areaColor || base.areaColor, borderColor: palette.borderColor || base.borderColor, shadowColor: palette.shadowColor || base.shadowColor })
              : base;
          })
        : DEFAULT_EXTRUSION;
     var geoLayers = presentation === "tilted" ? extrusionLayers.map(function (layer) { return Object.assign({}, geoBase, { layoutCenter: ["50%", (49 + layer.offset) + "%"], layoutSize: "150%", label: Object.assign({}, geoBase.label, { show: false }), roam: false, silent: true, emphasis: { disabled: true }, itemStyle: { areaColor: layer.areaColor, borderColor: layer.borderColor, borderWidth: 1, shadowColor: layer.shadowColor, shadowOffsetY: layer.shadowOffsetY, shadowBlur: layer.shadowBlur } }); }).concat([Object.assign({}, geoBase, { layoutCenter: ["50%", "49%"], layoutSize: "150%" })]) : geoBase;
     var geoIndex = presentation === "tilted" ? 3 : 0;
    var rawLayers = Array.isArray(props.layers) ? props.layers.slice(0, 50) : [];
    var layers = [];
    rawLayers.forEach(function (entry, index) {
      if (!entry || typeof entry !== "object" || layerTypes.indexOf(entry.type) < 0) return;
      var defaults = { regionFill: "区域填色", geoScatter: "地理散点", geoHeatmap: "点热力", geoFlow: "OD 飞线" };
      var style = entry.style && typeof entry.style === "object" ? entry.style : {};
      var layerColor = safeWidgetColor(style.color, entry.type === "geoHeatmap" ? "#ff6b6b" : entry.type === "geoScatter" ? "#ffcc66" : "#32d6ff");
      layers.push({
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 80) : "layer-" + (index + 1),
        type: entry.type,
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 48) : defaults[entry.type],
        visible: typeof entry.visible === "boolean" ? entry.visible : true,
        color: layerColor,
        opacity: boundedWidgetNumber(style.opacity, 0.85, 0, 1),
        size: boundedWidgetNumber(style.size, 12, 1, 100),
        border: style.border && typeof style.border === "object" ? {
          color: safeWidgetColor(style.border.color, "#5db9d2"),
          width: boundedWidgetNumber(style.border.width, 0.65, 0, 8),
          type: style.border.type === "dashed" ? "dashed" : "solid"
        } : null,
        label: style.label && typeof style.label === "object" ? {
          show: typeof style.label.show === "boolean" ? style.label.show : true,
          color: safeWidgetColor(style.label.color, "#e7fbff"),
          size: boundedWidgetNumber(style.label.size, 12, 1, 40),
          stroke: typeof style.label.stroke === "string" && /^#[0-9a-fA-F]{6}$/.test(style.label.stroke) ? style.label.stroke : ""
        } : null,
        animated: style.animated === true,
        minZoom: typeof entry.minZoom === "number" && isFinite(entry.minZoom) ? entry.minZoom : null,
        maxZoom: typeof entry.maxZoom === "number" && isFinite(entry.maxZoom) ? entry.maxZoom : null,
        colorMode: style.colorMode === "gradient" || style.colorMode === "segments" ? style.colorMode : "",
        colors: style.colors && typeof style.colors === "object" ? {
          min: safeWidgetColor(style.colors.min, "#102b3d"),
          mid: safeWidgetColor(style.colors.mid, "#1c5f8f"),
          max: safeWidgetColor(style.colors.max, layerColor),
          empty: safeWidgetColor(style.colors.empty, "#0d1a26")
        } : null,
        segments: typeof style.segments === "number" && isFinite(style.segments) ? Math.min(10, Math.max(2, Math.round(style.segments))) : 5,
        dataBinding: entry.dataBinding && typeof entry.dataBinding === "object" && typeof entry.dataBinding.datasetId === "string" && entry.dataBinding.datasetId.trim() ? entry.dataBinding : null
      });
    });
    rootEl.className += " cf-map-scene cf-map-scene--" + presentation;
    rootEl.style.overflow = "hidden";
    rootEl.style.perspective = "none";
    rootEl.style.backgroundColor = view.backgroundColor;
    rootEl.setAttribute("role", "img");
    rootEl.setAttribute("aria-label", presentation === "tilted" ? "2.5D 立体地图（矢量挤出）" : "平面地图（2D）");
    var plane = doc.createElement("div");
    plane.style.position = "absolute"; plane.style.inset = "0"; plane.style.overflow = "hidden";
    plane.style.transform = "none";
    plane.style.backgroundColor = view.backgroundColor;
    plane.style.boxShadow = presentation === "tilted" ? "inset 0 0 30px #26c5ff2b, 0 10px 18px #02080e88" : "inset 0 0 34px #1ca7cf24";
    var canvas = doc.createElement("div");
    canvas.setAttribute("data-item", item.id || "");
    canvas.style.position = "absolute"; canvas.style.inset = "0";
    plane.appendChild(canvas); rootEl.appendChild(plane);
    var title = doc.createElement("div"); title.className = "cf-map-scene__caption";
    title.textContent = presentation === "tilted" ? "立体地图 · 2.5D" : "平面地图 · 2D";
    title.style.position = "absolute"; title.style.zIndex = "2"; title.style.top = "10px"; title.style.left = "10px";
    title.style.padding = "5px 8px"; title.style.border = "1px solid #54bad744"; title.style.borderRadius = "4px"; title.style.background = "#061622c9"; title.style.color = "#b9e9f5"; title.style.fontSize = "11px";
    rootEl.appendChild(title);
    var visibleCount = layers.filter(function (layer) { return layer.visible; }).length;
    var badge = doc.createElement("div"); badge.textContent = visibleCount + " 个可见图层";
    badge.style.position = "absolute"; badge.style.zIndex = "2"; badge.style.right = "10px"; badge.style.bottom = "10px";
    badge.style.padding = "5px 8px"; badge.style.border = "1px solid #54bad744"; badge.style.borderRadius = "4px"; badge.style.background = "#061622c9"; badge.style.color = "#b9e9f5"; badge.style.fontSize = "11px";
    rootEl.appendChild(badge);
    var errors = []; var series = []; var visualMaps = [];
    var emptyColor = ""; var legendSource = null; var legendElRef = null;
    var containerFields = item.dataBinding && item.dataBinding.fields ? item.dataBinding.fields : {};
    function field(source, key) { return typeof source[key] === "string" && source[key].trim() && safeKey(source[key].trim()) ? source[key].trim() : ""; }
    function coordinate(row, lonField, latField) {
      if (!lonField || !latField) return null;
      var lon = asNumber(row[lonField]); var lat = asNumber(row[latField]);
      return lon !== null && lat !== null && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90 ? [lon, lat] : null;
    }
    layers.forEach(function (layer) {
      if (!layer.visible) return;
      var layerRows = layer.dataBinding ? datasetRows(layer.dataBinding, screen) : rows;
      var fields = layer.dataBinding ? (layer.dataBinding.fields || {}) : containerFields;
      var geo = fields.geo && typeof fields.geo === "object" ? fields.geo : {};
      if (layer.type === "regionFill") {
        var nameField = field(fields, "category"); var valueField = field(fields, "value");
        if (!nameField || !valueField) { errors.push(layer.name + "：区域填色需要配置区域名称与数值字段映射"); return; }
        if (layerRows.length && (!layerRows.some(function (row) { return Object.prototype.hasOwnProperty.call(row, nameField); }) || !layerRows.some(function (row) { return Object.prototype.hasOwnProperty.call(row, valueField); }))) {
          errors.push(layer.name + "：加工后数据缺少已映射的区域名称或数值列"); return;
        }
        var regionData = [];
        layerRows.forEach(function (row) {
          var nameValue = row[nameField]; var name = typeof nameValue === "string" || typeof nameValue === "number" ? String(nameValue).trim() : "";
          var value = asNumber(row[valueField]);
          if (name && value !== null) regionData.push({ name: name, value: value });
        });
        if (layerRows.length && !regionData.length) { errors.push(layer.name + "：没有有效的区域名称/数值行"); return; }
        if (regionData.length) {
          var mapSeriesIndex = series.length;
          var values = regionData.map(function (entry) { return entry.value; });
          var minimum = values.reduce(function (min, value) { return Math.min(min, value); }, Infinity);
          var maximum = values.reduce(function (max, value) { return Math.max(max, value); }, -Infinity);
          var regionBorder = layer.border || { color: "#5db9d2", width: 0.65, type: "solid" };
          series.push({ name: layer.name, type: "map", map: "china", geoIndex: geoIndex, data: regionData, itemStyle: { areaColor: layer.color, opacity: layer.opacity, borderColor: regionBorder.color, borderWidth: regionBorder.width, borderType: regionBorder.type } });
          var rampColors = layer.colors || { min: "#102b3d", mid: "#1c5f8f", max: layer.color, empty: "#0d1a26" };
          if (layer.colorMode === "segments") {
            visualMaps.push({ show: false, type: "piecewise", min: minimum, max: maximum || 1, seriesIndex: mapSeriesIndex, pieces: cfSegmentPieces(rampColors, minimum, maximum || 1, layer.segments || 5) });
          } else if (layer.colorMode === "gradient") {
            visualMaps.push({ show: false, type: "continuous", min: minimum, max: maximum || 1, seriesIndex: mapSeriesIndex, inRange: { colorStops: [{ offset: 0, color: rampColors.min }, { offset: 0.5, color: rampColors.mid }, { offset: 1, color: rampColors.max }] } });
          } else {
            visualMaps.push({ show: false, min: minimum, max: maximum || 1, seriesIndex: mapSeriesIndex, inRange: { color: ["#102b3d", layer.color] } });
          }
          if (layer.colors && layer.colors.empty && !emptyColor) emptyColor = layer.colors.empty;
          if (!legendSource) legendSource = { min: minimum, max: maximum, colors: rampColors, mode: layer.colorMode, segments: layer.segments };
        }
        return;
      }
      var data = [];
      var mappedGeoColumns = Object.keys(geo).map(function (key) { return field(geo, key); }).filter(function (column) { return !!column; });
      var absentGeoColumns = mappedGeoColumns.filter(function (column, index) {
        if (mappedGeoColumns.indexOf(column) !== index) return false;
        return !layerRows.some(function (row) { return Object.prototype.hasOwnProperty.call(row, column); });
      });
      if (layerRows.length && absentGeoColumns.length) {
        errors.push(layer.name + "：加工后缺少已映射的地理字段列：" + absentGeoColumns.join("、")); return;
      }
      if (layer.type === "geoFlow") {
        var fromLon = field(geo, "originLongitude"); var fromLat = field(geo, "originLatitude");
        var toLon = field(geo, "destinationLongitude"); var toLat = field(geo, "destinationLatitude");
        var flowValueField = field(geo, "value"); var flowNameField = field(geo, "name");
        if (!fromLon || !fromLat || !toLon || !toLat) { errors.push(layer.name + "：缺少必需的起点/终点经纬度映射"); return; }
        layerRows.forEach(function (row) {
          var from = coordinate(row, fromLon, fromLat); var to = coordinate(row, toLon, toLat);
          var value = flowValueField ? asNumber(row[flowValueField]) : null;
          if (!from || !to || (flowValueField && value === null)) return;
          var entry = { coords: [from, to] };
          if (flowNameField && row[flowNameField] != null) entry.name = String(row[flowNameField]).slice(0, 100);
          if (value !== null) entry.value = value;
          data.push(entry);
        });
        if (layerRows.length && !data.length) { errors.push(layer.name + "：没有可用的地理数据行，请检查经纬度范围与数值字段"); return; }
        series.push({ name: layer.name, type: "lines", coordinateSystem: "geo", geoIndex: geoIndex, data: data, lineStyle: { color: layer.color, width: Math.max(1, layer.size / 4), opacity: layer.opacity, curveness: 0.2 }, effect: layer.animated ? { show: true, trailLength: 0.4, symbol: "arrow", symbolSize: 4 } : { show: false } });
        return;
      }
      var lonField = field(geo, "longitude"); var latField = field(geo, "latitude"); var valueFieldGeo = field(geo, "value"); var pointNameField = field(geo, "name");
      if (!lonField || !latField || (layer.type === "geoHeatmap" && !valueFieldGeo)) { errors.push(layer.name + (layer.type === "geoHeatmap" ? "：缺少经度、纬度或热力值映射" : "：缺少经度/纬度映射")); return; }
      layerRows.forEach(function (row) {
        var point = coordinate(row, lonField, latField); var value = valueFieldGeo ? asNumber(row[valueFieldGeo]) : null;
        if (!point || (valueFieldGeo && value === null) || (layer.type === "geoHeatmap" && value === null)) return;
        if (layer.type === "geoHeatmap") data.push([point[0], point[1], value]);
        else { var pointData = { value: value === null ? point : [point[0], point[1], value] }; if (pointNameField && row[pointNameField] != null) pointData.name = String(row[pointNameField]).slice(0, 100); data.push(pointData); }
      });
      if (layerRows.length && !data.length) { errors.push(layer.name + "：没有可用的地理数据行，请检查经纬度范围与数值字段"); return; }
      if (layer.type === "geoHeatmap") series.push({ name: layer.name, type: "heatmap", coordinateSystem: "geo", geoIndex: geoIndex, data: data, pointSize: layer.size, blurSize: Math.max(layer.size, 12), itemStyle: { color: layer.color, opacity: layer.opacity } });
      else {
        var scatterSeries = { name: layer.name, type: "scatter", coordinateSystem: "geo", geoIndex: geoIndex, symbolSize: layer.size, data: data, itemStyle: { color: layer.color, opacity: layer.opacity } };
        if (layer.label) {
          scatterSeries.label = { show: layer.label.show, color: layer.label.color, fontSize: layer.label.size };
          if (layer.label.stroke) { scatterSeries.label.stroke = layer.label.stroke; scatterSeries.label.strokeWidth = 1; }
        }
        series.push(scatterSeries);
      }
    });
    var regionGeo = Array.isArray(geoLayers) ? geoLayers[geoLayers.length - 1] : geoLayers;
    if (emptyColor) {
      regionGeo.regions = CF_CHINA_REGIONS.map(function (regionName) { return { name: regionName, itemStyle: { areaColor: emptyColor } }; });
    }
    if (props.selected && typeof props.selected === "object") {
      regionGeo.selectedMode = "single";
      regionGeo.select = { itemStyle: { areaColor: safeWidgetColor(props.selected.areaColor, "#58d6ff"), borderColor: safeWidgetColor(props.selected.borderColor, "#ffffff") } };
    }
    var option = { backgroundColor: presentation === "tilted" ? "transparent" : view.backgroundColor, animation: false, tooltip: tooltipCfg, geo: geoLayers, series: series };
    if (visualMaps.length) option.visualMap = visualMaps;
    var renderedLayerIds = layers.filter(function (layer) { return layer.visible; }).map(function (layer) { return layer.id; });
    var seriesSnapshot = series.map(function (entry) { return entry.data; });
    var fillLayerId = "";
    for (var fl = 0; fl < layers.length; fl++) { if (layers[fl].type === "regionFill" && layers[fl].visible) { fillLayerId = layers[fl].id; break; } }
    function cfLayerById(id) { for (var i = 0; i < layers.length; i++) { if (layers[i].id === id) return layers[i]; } return null; }
    function cfLayerVisibleAt(layer, zoom) {
      if (!layer) return true;
      if (layer.minZoom !== null && layer.minZoom !== undefined && zoom < layer.minZoom) return false;
      if (layer.maxZoom !== null && layer.maxZoom !== undefined && zoom > layer.maxZoom) return false;
      return true;
    }
    function cfApplyZoomVisibility(zoom) {
      var changed = false;
      for (var i = 0; i < series.length; i++) {
        var visible = cfLayerVisibleAt(cfLayerById(renderedLayerIds[i]), zoom);
        var next = visible ? seriesSnapshot[i] : [];
        if (series[i].data !== next) { series[i].data = next; changed = true; }
      }
      return changed;
    }
    if (props.legend && props.legend.show && legendSource) {
      var legendEl = doc.createElement("div");
      legendElRef = legendEl;
      legendEl.className = "cf-map-legend";
      var legendPos = props.legend.position === "bottom-right" || props.legend.position === "bottom-left" ? props.legend.position : "top-right";
      legendEl.style.position = "absolute"; legendEl.style.zIndex = "3";
      legendEl.style.display = "flex"; legendEl.style.flexDirection = "column"; legendEl.style.gap = "3px";
      legendEl.style.padding = "5px 8px"; legendEl.style.border = "1px solid #54bad744"; legendEl.style.borderRadius = "4px";
      legendEl.style.background = "#061622c9"; legendEl.style.fontSize = "10px"; legendEl.style.pointerEvents = "none";
      if (legendPos === "top-right") { legendEl.style.top = "10px"; legendEl.style.right = "10px"; }
      else if (legendPos === "bottom-right") { legendEl.style.right = "10px"; legendEl.style.bottom = "34px"; }
      else { legendEl.style.left = "10px"; legendEl.style.bottom = "10px"; }
      if (!(props.legend.mode === "segments" || legendSource.mode === "segments")) {
        var legendRow = doc.createElement("span");
        legendRow.style.display = "flex"; legendRow.style.alignItems = "center"; legendRow.style.gap = "6px"; legendRow.style.color = "#b9e9f5";
        var legendBar = doc.createElement("i");
        legendBar.style.display = "inline-block"; legendBar.style.width = "96px"; legendBar.style.height = "8px"; legendBar.style.borderRadius = "3px";
        legendBar.style.border = "1px solid #54bad744";
        legendBar.style.background = "linear-gradient(90deg, " + legendSource.colors.min + ", " + legendSource.colors.mid + ", " + legendSource.colors.max + ")";
        legendRow.appendChild(legendBar);
        var legendRange = doc.createElement("span");
        legendRange.textContent = cfFormatMapValue(legendSource.min, props.valueFormat) + " \u2013 " + cfFormatMapValue(legendSource.max, props.valueFormat);
        legendRow.appendChild(legendRange);
        legendEl.appendChild(legendRow);
      } else {
        var segCount = legendSource.segments || 5;
        var segSpan = legendSource.max - legendSource.min;
        for (var seg = 0; seg < segCount; seg++) {
          var segRow = doc.createElement("span");
          segRow.style.display = "flex"; segRow.style.alignItems = "center"; segRow.style.gap = "5px"; segRow.style.color = "#b9e9f5";
          var segSwatch = doc.createElement("i");
          segSwatch.style.width = "9px"; segSwatch.style.height = "9px"; segSwatch.style.borderRadius = "2px";
          segSwatch.style.background = seg === 0 ? legendSource.colors.min : seg === segCount - 1 ? legendSource.colors.max : cfRampColor(legendSource.colors, seg / (segCount - 1));
          segRow.appendChild(segSwatch);
          var segLabel = doc.createElement("span");
          var segLo = legendSource.min + segSpan * seg / segCount;
          var segHi = legendSource.min + segSpan * (seg + 1) / segCount;
          segLabel.textContent = cfFormatMapValue(segLo, props.valueFormat) + " ~ " + cfFormatMapValue(segHi, props.valueFormat);
          segRow.appendChild(segLabel);
          legendEl.appendChild(segRow);
        }
      }
      rootEl.appendChild(legendEl);
    }
    if (window.echarts) {
      try { var chart = window.echarts.init(canvas, null, { renderer: "canvas" }); chart.setOption(option, true); if (typeof chart.on === "function" && typeof chart.getOption === "function") chart.on("georoam", function () { var geoOption = chart.getOption().geo; var geoList = Array.isArray(geoOption) ? geoOption : (geoOption ? [geoOption] : []); var zoomNow = null; if (geoList.length) { var lastGeo = geoList[geoList.length - 1]; if (lastGeo && typeof lastGeo.zoom === "number") zoomNow = lastGeo.zoom; } if (zoomNow !== null) { if (cfApplyZoomVisibility(zoomNow)) { chart.setOption({ series: series }, { notMerge: false, lazyUpdate: true, silent: true }); } if (legendElRef) { legendElRef.style.display = cfLayerVisibleAt(cfLayerById(fillLayerId), zoomNow) ? "" : "none"; } } if (presentation === "tilted" && geoList.length >= 2) { var topIndex = geoList.length - 1; var topGeo = geoList[topIndex]; if (!topGeo || !Array.isArray(topGeo.center) || typeof topGeo.zoom !== "number") return; var center = topGeo.center.slice(); var zoom = topGeo.zoom; var syncedGeo = geoList.map(function (geoLayer, index) { return Object.assign({}, geoLayer, { center: center.slice(), zoom: zoom, roam: index === topIndex ? geoLayer.roam : false }); }); chart.setOption({ geo: syncedGeo }, { notMerge: false, lazyUpdate: true, silent: true }); } }); charts.push(chart); }
      catch (e) { errors.push("地图渲染失败"); }
    } else errors.push("离线图表运行时不可用");
    if (errors.length) {
      var status = doc.createElement("div"); status.setAttribute("role", "status"); status.className = "cf-map-scene__status";
      status.textContent = errors.join("；"); status.style.position = "absolute"; status.style.zIndex = "3"; status.style.left = "50%"; status.style.bottom = "10px"; status.style.maxWidth = "75%"; status.style.transform = "translateX(-50%)";
      status.style.padding = "5px 8px"; status.style.borderRadius = "4px"; status.style.background = "#07121dd9"; status.style.color = "#ffd17b"; status.style.fontSize = "10px"; status.style.textAlign = "center";
      rootEl.appendChild(status);
    } else if (!layers.length) {
      var empty = doc.createElement("div"); empty.textContent = "本地离线底图 · 可从图层面板添加地图数据层"; empty.style.position = "absolute"; empty.style.left = "50%"; empty.style.bottom = "10px"; empty.style.transform = "translateX(-50%)"; empty.style.color = "#b9e9f5"; empty.style.fontSize = "10px"; rootEl.appendChild(empty);
    }
  }

  function addComponent(item, screen) {
    var state = stateFor(screen);
    var props = safeMerge(item.props || {}, state.props[item.componentId] || {});
    var rows = item.dataBinding ? datasetRows(item.dataBinding, screen) : (Array.isArray(item.sampleRows) ? item.sampleRows : []);
    var tokens = themeTokens(screen);
    var rootEl = doc.createElement("div");
    rootEl.className = "cf-item cf-component";
    rootEl.style.color = tokens.text;
    place(rootEl, item);
    rootEl.setAttribute("data-component", item.componentId);
    if (!item.dataBinding && Array.isArray(item.sampleRows) && item.sampleRows.length) {
      var sampleNotice = doc.createElement("p"); sampleNotice.className = "cf-sample-notice";
      sampleNotice.textContent = "示例数据 · 绑定数据集后自动替换";
      sampleNotice.style.margin = "0 0 8px"; sampleNotice.style.color = tokens.accent; sampleNotice.style.fontSize = "10px";
      rootEl.appendChild(sampleNotice);
    }
    if ((item.componentId === "chartforge.map-scene-flat" || item.componentId === "chartforge.map-scene-tilted") && item.componentVersion === 1) {
      safeMapScene(item, rootEl, rows, props, screen);
    } else if (item.componentId === "chartforge.data-table" && item.componentVersion === 1) {
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

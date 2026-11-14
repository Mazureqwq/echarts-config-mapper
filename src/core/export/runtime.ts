/**
 * 产物运行时代码（纯 JavaScript，以字符串形式内联进产物）。
 *
 * 刻意做得很薄：option 在导出时已经算好，运行时主要负责
 * 「读 payload → 建舞台 → setOption → 适配窗口 → 轮播」。
 * 唯一的数据转换例外是受限的、字段映射驱动的离线地图绑定，以支持包内数据与蓝图筛选刷新。
 * 约束：不得使用 eval / new Function / innerHTML（CSP 与安全清单要求）。
 */
export const RUNTIME_CODE = String.raw`
(async function () {
  "use strict";
  var doc = document;
  var root = doc.getElementById("cf-root");
  var failed = false;

  // MapLibre 源与 worker 以 JSON 数据标签内联；此处转 Blob 动态导入（单 HTML file:// 可用）。
  var maplibrePromise = (async function () {
    try {
      var mlEl = doc.getElementById("cf-maplibre");
      if (!mlEl) return null;
      var source = JSON.parse(mlEl.textContent || '""');
      if (typeof source !== "string" || !source) return null;
      var mod = await import(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
      var wkEl = doc.getElementById("cf-maplibre-worker");
      if (wkEl && mod && typeof mod.setWorkerUrl === "function") {
        try {
          var workerSource = JSON.parse(wkEl.textContent || '""');
          if (typeof workerSource === "string" && workerSource) {
            // file:// 下 module worker 因源限制不可用：剥离 ESM export 后以 classic worker 运行（内容等价）。
            var strippedWorker = workerSource.replace(/export\s*\{[^}]*\};?/, "");
            var classicWorkerUrl = URL.createObjectURL(new Blob([strippedWorker], { type: "text/javascript" }));
            var OrigWorker = window.Worker;
            window.__shimLog = [];
            window.Worker = function (workerUrl, workerOpts) {
              var u = String(workerUrl);
              var optsType = workerOpts && workerOpts.type;
              var isOurs = u === classicWorkerUrl;
              var isMaplibreDataModule = optsType === "module" && u.indexOf("data:") === 0 && u.indexOf("MapLibre") > -1;
              window.__shimLog.push({ url: u.slice(0, 70), opts: workerOpts ? JSON.stringify(workerOpts) : null, forced: Boolean(isOurs || isMaplibreDataModule) });
              if (isOurs || isMaplibreDataModule) return new OrigWorker(classicWorkerUrl);
              return new OrigWorker(workerUrl, workerOpts);
            };
            var probe = new OrigWorker(classicWorkerUrl);
            probe.onerror = function (probeErr) {
              window.__shimLog.push({ probeError: (probeErr && probeErr.message) || "empty", err: String(probeErr && probeErr.error ? probeErr.error : "") });
              try { probe.terminate(); } catch (e) {}
            };
            setTimeout(function () { try { probe.terminate(); } catch (e) {} }, 4000);
            mod.setWorkerUrl(classicWorkerUrl);
          }
        } catch (workerErr) { /* worker 配置失败不阻断地图渲染 */ }
      }
      return mod;
    } catch (loadErr) {
      return null;
    }
  })();

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
      Object.keys(source).forEach(function (key) {
        if (!safeKey(key)) return;
        var incoming = source[key];
        var current = out[key];
        if (incoming && typeof incoming === "object" && !Array.isArray(incoming) && current && typeof current === "object" && !Array.isArray(current)) {
          out[key] = safeMerge(current, incoming);
        } else {
          out[key] = incoming;
        }
      });
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
  function cfFormatMapValue(value, fmt) {
    if (value === null || value === undefined || !isFinite(value)) return "\u2014";
    var decimals = fmt && typeof fmt.decimals === "number" ? Math.min(4, Math.max(0, Math.round(fmt.decimals))) : 0;
    var text = value.toFixed(decimals);
    return fmt && typeof fmt.suffix === "string" && fmt.suffix ? text + fmt.suffix : text;
  }
  // 地理散点 / 点热力 / OD 飞线：与工作台 buildGeoChartDataFromRows 同源的字段校验与行转换
  var CF_GEO_FIELD_LABELS = {
    longitude: "\u7ecf\u5ea6", latitude: "\u7eac\u5ea6", name: "\u540d\u79f0", value: "\u6570\u503c",
    originLongitude: "\u8d77\u70b9\u7ecf\u5ea6", originLatitude: "\u8d77\u70b9\u7eac\u5ea6",
    destinationLongitude: "\u7ec8\u70b9\u7ecf\u5ea6", destinationLatitude: "\u7ec8\u70b9\u7eac\u5ea6"
  };
  function cfGeoField(mapping, key) {
    var value = mapping && typeof mapping === "object" ? mapping[key] : "";
    return typeof value === "string" ? value.trim() : "";
  }
  function cfGeoNumeric(value) {
    if (typeof value === "number") return isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") { var parsed = Number(value); return isFinite(parsed) ? parsed : null; }
    return null;
  }
  function cfGeoName(row, key) {
    if (!key) return "";
    var value = row[key];
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).trim();
  }
  function cfGeoRows(rows, mapping, type) {
    var required = type === "geoFlow"
      ? ["originLongitude", "originLatitude", "destinationLongitude", "destinationLatitude"]
      : (type === "geoHeatmap" ? ["longitude", "latitude", "value"] : ["longitude", "latitude"]);
    var missing = required.filter(function (key) { return !cfGeoField(mapping, key); });
    if (missing.length) {
      return { ok: false, message: "\u7f3a\u5c11\u5fc5\u9700\u7684\u5730\u7406\u5b57\u6bb5\u6620\u5c04\uff1a" + missing.map(function (key) { return CF_GEO_FIELD_LABELS[key]; }).join("\u3001"), rows: [] };
    }
    var result = [];
    if (rows.length > 0) {
      var mappedColumns = [];
      for (var mk in mapping) {
        if (!Object.prototype.hasOwnProperty.call(mapping, mk)) continue;
        var mapped = mapping[mk];
        if (typeof mapped === "string" && mapped.trim()) mappedColumns.push(mapped.trim());
      }
      var absent = mappedColumns.filter(function (column) {
        for (var r = 0; r < rows.length; r++) {
          if (rows[r] && Object.prototype.hasOwnProperty.call(rows[r], column)) return false;
        }
        return true;
      });
      if (absent.length) {
        return { ok: false, message: "\u52a0\u5de5\u540e\u7f3a\u5c11\u5df2\u6620\u5c04\u7684\u5730\u7406\u5b57\u6bb5\u5217\uff1a" + absent.join("\u3001"), rows: [] };
      }
    }
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      if (type === "geoFlow") {
        var fromLng = cfGeoNumeric(row[cfGeoField(mapping, "originLongitude")]);
        var fromLat = cfGeoNumeric(row[cfGeoField(mapping, "originLatitude")]);
        var toLng = cfGeoNumeric(row[cfGeoField(mapping, "destinationLongitude")]);
        var toLat = cfGeoNumeric(row[cfGeoField(mapping, "destinationLatitude")]);
        if (fromLng === null || fromLat === null || toLng === null || toLat === null) continue;
        if (fromLng < -180 || fromLng > 180 || toLng < -180 || toLng > 180) continue;
        if (fromLat < -90 || fromLat > 90 || toLat < -90 || toLat > 90) continue;
        result.push({ from: [fromLng, fromLat], to: [toLng, toLat], name: cfGeoName(row, cfGeoField(mapping, "name")) });
        continue;
      }
      var lng = cfGeoNumeric(row[cfGeoField(mapping, "longitude")]);
      var lat = cfGeoNumeric(row[cfGeoField(mapping, "latitude")]);
      if (lng === null || lat === null || lng < -180 || lng > 180 || lat < -90 || lat > 90) continue;
      var valueKey = cfGeoField(mapping, "value");
      var pointValue = valueKey ? cfGeoNumeric(row[valueKey]) : null;
      if (valueKey && pointValue === null) continue;
      if (type === "geoHeatmap") {
        if (pointValue === null) continue;
        result.push({ longitude: lng, latitude: lat, value: pointValue });
      } else {
        result.push({ longitude: lng, latitude: lat, name: cfGeoName(row, cfGeoField(mapping, "name")), value: pointValue === null ? undefined : pointValue });
      }
    }
    if (rows.length > 0 && !result.length) {
      return { ok: false, message: "\u6ca1\u6709\u53ef\u7528\u7684\u5730\u7406\u6570\u636e\u884c\uff0c\u8bf7\u68c0\u67e5\u7ecf\u5ea6\u5ea6\u4e0e\u6570\u503c\u5b57\u6bb5", rows: [] };
    }
    return { ok: true, message: "", rows: result };
  }
  function cfHexToRgba(hex, alpha) {
    var matched = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
    if (!matched) return "rgba(255, 255, 255, " + alpha + ")";
    var value = parseInt(matched[1], 16);
    return "rgba(" + ((value >> 16) & 255) + ", " + ((value >> 8) & 255) + ", " + (value & 255) + ", " + alpha + ")";
  }
  var CF_CHINA_REGIONS = ["新疆维吾尔自治区", "西藏自治区", "内蒙古自治区", "青海省", "四川省", "黑龙江省", "甘肃省", "云南省", "广西壮族自治区", "湖南省", "陕西省", "广东省", "吉林省", "河北省", "湖北省", "贵州省", "山东省", "江西省", "河南省", "辽宁省", "山西省", "安徽省", "福建省", "浙江省", "江苏省", "重庆市", "宁夏回族自治区", "海南省", "台湾省", "北京市", "天津市", "上海市", "香港特别行政区", "澳门特别行政区"];
  function safeMapSceneMaplibre(item, rootEl, rows, props, screen) {
    var fallbackPresentation = item.componentId === "chartforge.map-scene-tilted" ? "tilted" : "flat";
    var presentation = props.presentation === "tilted" || props.presentation === "flat" ? props.presentation : fallbackPresentation;
    var rawView = props.view && typeof props.view === "object" ? props.view : {};
    var rawCenter = Array.isArray(rawView.center) ? rawView.center : [];
    var minZoom = boundedWidgetNumber(rawView.minZoom, 1, 0.5, 20);
    var maxZoom = boundedWidgetNumber(rawView.maxZoom, Math.max(minZoom, 8), minZoom, 20);
    var zoomFallback = Math.min(maxZoom, Math.max(minZoom, 1.05));
    var rawOffset = rawView.offset && typeof rawView.offset === "object" ? rawView.offset : null;
    var viewOffset = rawOffset ? {
      x: boundedWidgetNumber(rawOffset.x, 0, -100, 100),
      y: boundedWidgetNumber(rawOffset.y, 0, -100, 100)
    } : null;
    var view = {
      center: [boundedWidgetNumber(rawCenter[0], 104.114129, -180, 180), boundedWidgetNumber(rawCenter[1], 35.550339, -90, 90)],
      zoom: boundedWidgetNumber(rawView.zoom, zoomFallback, minZoom, maxZoom), minZoom: minZoom, maxZoom: maxZoom,
      dragEnabled: typeof rawView.dragEnabled === "boolean" ? rawView.dragEnabled : true,
      zoomEnabled: typeof rawView.zoomEnabled === "boolean" ? rawView.zoomEnabled : true,
      showLabels: typeof rawView.showLabels === "boolean" ? rawView.showLabels : true,
      backgroundColor: safeWidgetColor(rawView.backgroundColor, "#081622"),
      offset: viewOffset
    };
    var pitch = presentation === "tilted" ? boundedWidgetNumber(props.pitch, 28, 0, 60) : 0;
    var labelGroup = props.label && typeof props.label === "object" ? props.label : { show: true, color: "#e7fbff", size: 10 };
    var labelShow = view.showLabels && labelGroup.show !== false;
    var labelMinZoom = typeof labelGroup.minZoom === "number" ? boundedWidgetNumber(labelGroup.minZoom, 1, 0.5, 20) : null;
    var labelColor = safeWidgetColor(labelGroup.color, "#e7fbff");
    var labelSize = boundedWidgetNumber(labelGroup.size, 10, 8, 40);
    var labelShadow = typeof labelGroup.shadow === "string" && /^#[0-9a-fA-F]{6}$/.test(labelGroup.shadow) ? labelGroup.shadow
      : (typeof labelGroup.stroke === "string" && /^#[0-9a-fA-F]{6}$/.test(labelGroup.stroke) ? labelGroup.stroke : "");
    var borderGroup = props.border && typeof props.border === "object" ? props.border : { color: "#c0f3fb", width: 1, type: "solid" };
    var borderColor = safeWidgetColor(borderGroup.color, "#c0f3fb");
    var borderWidth = boundedWidgetNumber(borderGroup.width, 1, 0, 8);
    var borderType = borderGroup.type === "dashed" ? "dashed" : "solid";
    var outlineGroup = borderGroup.outline && typeof borderGroup.outline === "object" ? borderGroup.outline : null;
    var outlineShow = outlineGroup ? outlineGroup.show === true : false;
    var outlineColor = outlineGroup ? safeWidgetColor(outlineGroup.color, "#bfe9ff") : "#bfe9ff";
    var outlineWidth = outlineGroup ? boundedWidgetNumber(outlineGroup.width, 2, 0, 12) : 2;
    var scaleBarGroup = props.scaleBar && typeof props.scaleBar === "object" ? props.scaleBar : null;
    var scaleBarShow = scaleBarGroup ? scaleBarGroup.show === true : false;
    var scaleBarPosition = scaleBarGroup && (scaleBarGroup.position === "top-left" || scaleBarGroup.position === "top-right" || scaleBarGroup.position === "bottom-left" || scaleBarGroup.position === "bottom-right") ? scaleBarGroup.position : "bottom-left";
    var emphasisGroup = props.emphasis && typeof props.emphasis === "object" ? props.emphasis : null;
    var selectedGroup = props.selected && typeof props.selected === "object" ? props.selected : null;
    var valueFormat = props.valueFormat && typeof props.valueFormat === "object" ? props.valueFormat : null;
    var emphasisColor = emphasisGroup ? safeWidgetColor(emphasisGroup.areaColor, "#3a95fd") : "#3a95fd";
    var selectedColor = selectedGroup ? safeWidgetColor(selectedGroup.areaColor, "#58d6ff") : "#58d6ff";
    var emphasisBorderColor = emphasisGroup ? safeWidgetColor(emphasisGroup.borderColor, "#ffffff") : "#ffffff";
    var selectedBorderColor = selectedGroup ? safeWidgetColor(selectedGroup.borderColor, "#ffffff") : "#ffffff";

    var rawLayers = Array.isArray(props.layers) ? props.layers.slice(0, 50) : [];
    var layers = [];
    rawLayers.forEach(function (entry, index) {
      if (!entry || typeof entry !== "object") return;
      var defaults = { regionFill: "区域填色", geoScatter: "地理散点", geoHeatmap: "点热力", geoFlow: "OD 飞线" };
      if (!defaults[entry.type]) return;
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
        animated: style.animated === true,
        label: style.label && typeof style.label === "object" ? {
          show: style.label.show !== false,
          color: safeWidgetColor(style.label.color, "#ffffff"),
          size: boundedWidgetNumber(style.label.size, 12, 8, 40),
          stroke: typeof style.label.stroke === "string" && /^#[0-9a-fA-F]{6}$/.test(style.label.stroke) ? style.label.stroke : ""
        } : null,
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
    rootEl.style.backgroundColor = view.backgroundColor;
    rootEl.setAttribute("role", "img");
    rootEl.setAttribute("aria-label", presentation === "tilted" ? "2.5D 立体地图（WebGL）" : "平面地图（2D WebGL）");
    var plane = doc.createElement("div");
    plane.style.position = "absolute"; plane.style.inset = "0"; plane.style.overflow = "hidden";
    plane.style.backgroundColor = view.backgroundColor;
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
    var labelsBox = doc.createElement("div");
    labelsBox.className = "cf-map-labels";
    labelsBox.style.position = "absolute"; labelsBox.style.inset = "0"; labelsBox.style.zIndex = "2"; labelsBox.style.pointerEvents = "none"; labelsBox.style.overflow = "hidden";
    rootEl.appendChild(labelsBox);
    var statusEl = null;
    function showStatus(text) {
      if (!text) { if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl); statusEl = null; return; }
      if (!statusEl) {
        statusEl = doc.createElement("div");
        statusEl.className = "cf-map-scene__status";
        statusEl.setAttribute("role", "status");
        statusEl.style.position = "absolute"; statusEl.style.zIndex = "3"; statusEl.style.left = "50%"; statusEl.style.bottom = "10px";
        statusEl.style.transform = "translateX(-50%)"; statusEl.style.maxWidth = "75%";
        statusEl.style.padding = "5px 8px"; statusEl.style.borderRadius = "4px"; statusEl.style.background = "#07121dd9";
        statusEl.style.color = "#ffd17b"; statusEl.style.fontSize = "10px"; statusEl.style.textAlign = "center"; statusEl.style.pointerEvents = "none";
        rootEl.appendChild(statusEl);
      }
      statusEl.textContent = text;
    }

    var errors = [];
    var containerFields = item.dataBinding && item.dataBinding.fields ? item.dataBinding.fields : {};
    function field(source, key) { return typeof source[key] === "string" && source[key].trim() && safeKey(source[key].trim()) ? source[key].trim() : ""; }
    function asNum(value) {
      if (typeof value === "number" && isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) { var parsed = Number(value); return isFinite(parsed) ? parsed : null; }
      return null;
    }

    function cfMix(a, b, t) {
      function px(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
      var pa = px(a); var pb = px(b);
      var k = Math.min(1, Math.max(0, t));
      var out = "#";
      for (var i = 0; i < 3; i++) { var v = Math.round(pa[i] + (pb[i] - pa[i]) * k); out += (v < 16 ? "0" : "") + v.toString(16); }
      return out;
    }
    function cfRamp(colors, t) {
      var c = Math.min(1, Math.max(0, t));
      return c <= 0.5 ? cfMix(colors.min, colors.mid, c * 2) : cfMix(colors.mid, colors.max, (c - 0.5) * 2);
    }
    function cfColorFor(value, min, max, colors, mode, segments) {
      var span = max - min;
      var t = span > 0 ? (value - min) / span : 0;
      if (mode === "segments") {
        var n = Math.min(10, Math.max(2, Math.round(segments)));
        var k = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
        return k === 0 ? colors.min : k === n - 1 ? colors.max : cfRamp(colors, k / (n - 1));
      }
      return cfRamp(colors, t);
    }
    function cfFormatValue(value, fmt) {
      if (value === null || value === undefined || !isFinite(value)) return "—";
      var decimals = fmt && typeof fmt.decimals === "number" ? Math.min(4, Math.max(0, Math.round(fmt.decimals))) : 0;
      var text = value.toFixed(decimals);
      return fmt && typeof fmt.suffix === "string" && fmt.suffix ? text + fmt.suffix : text;
    }
    function cfHaversine(a, b) {
      var radius = 6371008.8;
      function toRad(v) { return v * Math.PI / 180; }
      var dLat = toRad(b[1] - a[1]);
      var dLng = toRad(b[0] - a[0]);
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function cfFormatScaleDistance(meters) {
      if (!isFinite(meters) || meters <= 0) return "0 m";
      if (meters >= 1000) {
        var km = meters / 1000;
        return String(Number(km.toFixed(km >= 10 ? 0 : 1))) + " km";
      }
      return String(Math.round(meters)) + " m";
    }
    function cfPickScaleBarDistance(metersPerPixel, maxPixels) {
      var limit = (isFinite(maxPixels) && maxPixels > 0) ? maxPixels : 110;
      var perPixel = (isFinite(metersPerPixel) && metersPerPixel > 0) ? metersPerPixel : 1;
      var target = Math.max(1, perPixel * limit);
      var base = Math.pow(10, Math.floor(Math.log10(target)));
      var candidates = [1, 2, 5].map(function (factor) { return factor * base; });
      var usable = candidates.filter(function (value) { return value <= target; });
      var meters = usable.length ? usable[usable.length - 1] : base / 10;
      if (!isFinite(meters) || meters < 1) meters = 1;
      return { meters: meters, pixels: meters / perPixel, text: cfFormatScaleDistance(meters) };
    }

    var regionFillLayer = null;
    for (var li = 0; li < layers.length; li++) {
      if (layers[li].visible && layers[li].type === "regionFill") { regionFillLayer = layers[li]; break; }
    }
    // 校验所有可见区域填色层（首个由渲染段处理，避免重复报错）
    for (var vi = 0; vi < layers.length; vi++) {
      var vlay = layers[vi];
      if (!vlay.visible || vlay.type !== "regionFill" || vlay === regionFillLayer) continue;
      var vr = vlay.dataBinding ? datasetRows(vlay.dataBinding, screen) : rows;
      var vf = vlay.dataBinding ? (vlay.dataBinding.fields || {}) : containerFields;
      var vn = field(vf, "category");
      var vv = field(vf, "value");
      if (!vn || !vv) { errors.push(vlay.name + "：区域填色需要配置区域名称与数值字段映射"); continue; }
      if (vr.length && (!vr.some(function (row) { return Object.prototype.hasOwnProperty.call(row, vn); }) || !vr.some(function (row) { return Object.prototype.hasOwnProperty.call(row, vv); }))) {
        errors.push(vlay.name + "：加工后数据缺少已映射的区域名称或数值列");
        continue;
      }
      if (vr.length) {
        var anyValid = vr.some(function (row) { return Object.prototype.hasOwnProperty.call(row, vn) && Object.prototype.hasOwnProperty.call(row, vv); });
        if (!anyValid) errors.push(vlay.name + "：没有有效的区域名称/数值行");
      }
    }
    var regionValues = {};
    var fillColor = "#32d6ff";
    var fillOpacity = 0.7;
    var fillWindow = {};
    if (regionFillLayer) {
      fillOpacity = regionFillLayer.opacity;
      if (regionFillLayer.minZoom !== null) fillWindow.minzoom = regionFillLayer.minZoom;
      if (regionFillLayer.maxZoom !== null) fillWindow.maxzoom = regionFillLayer.maxZoom;
      var fillRows = regionFillLayer.dataBinding ? datasetRows(regionFillLayer.dataBinding, screen) : rows;
      var fillFields = regionFillLayer.dataBinding ? (regionFillLayer.dataBinding.fields || {}) : containerFields;
      var nameField = field(fillFields, "category");
      var valueField = field(fillFields, "value");
      if (!nameField || !valueField) {
        errors.push(regionFillLayer.name + "：区域填色需要配置区域名称与数值字段映射");
      } else {
        if (fillRows.length && (!fillRows.some(function (row) { return Object.prototype.hasOwnProperty.call(row, nameField); }) || !fillRows.some(function (row) { return Object.prototype.hasOwnProperty.call(row, valueField); }))) {
          errors.push(regionFillLayer.name + "：加工后数据缺少已映射的区域名称或数值列");
        } else {
          fillRows.forEach(function (row) {
            var rawName = row[nameField];
            var name = typeof rawName === "string" || typeof rawName === "number" ? String(rawName).trim() : "";
            var value = asNum(row[valueField]);
            if (name && value !== null) regionValues[name] = value;
          });
          if (fillRows.length && !Object.keys(regionValues).length) {
            errors.push(regionFillLayer.name + "：没有有效的区域名称/数值行");
          }
        }
        var names = Object.keys(regionValues);
        if (names.length) {
          var values = names.map(function (n) { return regionValues[n]; });
          var minimum = values.reduce(function (m, v) { return Math.min(m, v); }, Infinity);
          var maximum = values.reduce(function (m, v) { return Math.max(m, v); }, -Infinity);
          var colors = regionFillLayer.colors || { min: "#102b3d", mid: "#1c5f8f", max: regionFillLayer.color, empty: "#0d1a26" };
          var mode = regionFillLayer.colorMode === "segments" ? "segments" : "gradient";
          var entries = [];
          names.forEach(function (n) { entries.push(n); entries.push(cfColorFor(regionValues[n], minimum, maximum, colors, mode, regionFillLayer.segments || 5)); });
          var matchExpr = ["match", ["get", "name"]].concat(entries).concat([colors.empty]);
          if (regionFillLayer.colorMode || regionFillLayer.colors) {
            fillColor = ["case",
              ["boolean", ["feature-state", "cf_selected"], false], selectedColor,
              ["boolean", ["feature-state", "cf_hover"], false], emphasisColor,
              matchExpr];
          } else {
            fillColor = ["case",
              ["boolean", ["feature-state", "cf_selected"], false], selectedColor,
              ["boolean", ["feature-state", "cf_hover"], false], emphasisColor,
              matchExpr];
          }
        } else {
          fillColor = regionFillLayer.color;
        }
      }
      if (!Object.keys(regionValues).length && !errors.length) fillColor = regionFillLayer.color;
    }

    // T7：图例条目 / tooltip 文案（与工作台 buildMapLegend + formatMapTooltipText 同源）
    var legendSource = null;
    if (regionFillLayer && names && names.length) {
      legendSource = { min: minimum, max: maximum, colors: colors, mode: mode, segments: regionFillLayer.segments || 5 };
    }
    var legendMode = (props.legend && props.legend.mode === "segments") || (regionFillLayer && regionFillLayer.colorMode === "segments") ? "segments" : "continuous";
    var legendEntries = [];
    if (props.legend && props.legend.show && legendSource) {
      if (legendMode === "segments") {
        var segCount = legendSource.segments || 5;
        var segSpan = legendSource.max - legendSource.min;
        for (var seg = 0; seg < segCount; seg++) {
          var segLo = legendSource.min + segSpan * seg / segCount;
          var segHi = legendSource.min + segSpan * (seg + 1) / segCount;
          legendEntries.push({
            label: cfFormatMapValue(segLo, valueFormat) + " ~ " + cfFormatMapValue(segHi, valueFormat),
            color: seg === 0 ? legendSource.colors.min : seg === segCount - 1 ? legendSource.colors.max : cfRampColor(legendSource.colors, seg / (segCount - 1))
          });
        }
      } else {
        legendEntries.push({
          from: cfFormatMapValue(legendSource.min, valueFormat),
          to: cfFormatMapValue(legendSource.max, valueFormat),
          stops: [legendSource.colors.min, legendSource.colors.mid, legendSource.colors.max]
        });
      }
    }
    var legendPosition = props.legend && (props.legend.position === "bottom-right" || props.legend.position === "bottom-left") ? props.legend.position : "top-right";
    var tooltipTexts = {};
    for (var tooltipName in regionValues) {
      if (Object.prototype.hasOwnProperty.call(regionValues, tooltipName)) {
        tooltipTexts[tooltipName] = tooltipName + "：" + cfFormatMapValue(regionValues[tooltipName], valueFormat);
      }
    }
    var tooltipStyle = props.tooltipStyle && typeof props.tooltipStyle === "object"
      ? { background: safeWidgetColor(props.tooltipStyle.background, "#07121d"), borderColor: safeWidgetColor(props.tooltipStyle.borderColor, "#1f2a3a"), color: safeWidgetColor(props.tooltipStyle.color, "#e7fbff"), fontSize: boundedWidgetNumber(props.tooltipStyle.fontSize, 12, 8, 32) }
      : { background: "#07121d", borderColor: "#1f2a3a", color: "#e7fbff", fontSize: 12 };
    var dashed = borderType === "dashed";
    var styleLayers = [
      Object.assign({
        id: "cf-fill", type: "fill", source: "china"
      }, fillWindow, {
        "fill-color-transition": { duration: 180, delay: 0 },
        paint: { "fill-color": fillColor, "fill-opacity": fillOpacity, "fill-outline-color": borderColor }
      }),
      Object.assign({
        id: "cf-line", type: "line", source: "china"
      }, fillWindow, {
        "line-color-transition": { duration: 180, delay: 0 },
        paint: Object.assign({
          "line-color": ["case",
            ["boolean", ["feature-state", "cf_selected"], false], selectedBorderColor,
            ["boolean", ["feature-state", "cf_hover"], false], emphasisBorderColor,
            borderColor],
          "line-width": borderWidth
        }, dashed ? { "line-dasharray": [2, 2] } : {})
      })
    ];

    var labels = [];
    var geoSource = payload && payload.geo && payload.geo.china ? payload.geo.china : null;
    if (labelShow && geoSource && Array.isArray(geoSource.features)) {
      geoSource.features.forEach(function (feature) {
        if (!feature || !feature.properties || typeof feature.properties.name !== "string") return;
        var geom = feature.geometry;
        if (!geom) return;
        var pts = [];
        function walk(value) {
          if (!Array.isArray(value)) return;
          if (typeof value[0] === "number" && typeof value[1] === "number") { pts.push([value[0], value[1]]); return; }
          for (var w = 0; w < value.length; w++) walk(value[w]);
        }
        if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
          geom.geometries.forEach(function (g) { if (g) walk(g.coordinates); });
        } else {
          walk(geom.coordinates);
        }
        if (!pts.length) return;
        var xs = pts.map(function (p) { return p[0]; });
        var ys = pts.map(function (p) { return p[1]; });
        labels.push({
          name: feature.properties.name,
          centroid: [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2],
          el: null
        });
      });
    }

    var outlineData = payload && payload.geo && payload.geo.chinaOutline ? payload.geo.chinaOutline : null;
    var styleSources = { china: { type: "geojson", data: geoSource ? geoSource : { type: "FeatureCollection", features: [] }, promoteId: "name" } };
    if (outlineShow && outlineData && outlineData.features && outlineData.features.length) {
      styleSources["china-outline"] = { type: "geojson", data: outlineData };
      styleLayers.push(
        {
          id: "cf-outline-glow", type: "line", source: "china-outline",
          paint: { "line-color": outlineColor, "line-width": Math.max(outlineWidth, 1) * 3, "line-opacity": 0.22, "line-blur": 8 }
        },
        {
          id: "cf-outline", type: "line", source: "china-outline",
          paint: { "line-color": outlineColor, "line-width": outlineWidth, "line-opacity": 0.95 }
        }
      );
    }

    // T10：地理散点 / 点热力 / OD 飞线（与工作台 buildMapLibreScene 同源语义：circle / heatmap / line + 独立 geojson 源）
    for (var gi = 0; gi < layers.length; gi++) {
      var gl = layers[gi];
      if (!gl.visible || gl.type === "regionFill") continue;
      var gRows = gl.dataBinding ? datasetRows(gl.dataBinding, screen) : rows;
      var gFields = gl.dataBinding ? (gl.dataBinding.fields || {}) : containerFields;
      var converted = cfGeoRows(gRows, gFields.geo, gl.type);
      if (!converted.ok) { errors.push(gl.name + "\uff1a" + converted.message); continue; }
      if (!converted.rows.length) continue;
      var gWindow = {};
      if (gl.minZoom !== null) gWindow.minzoom = gl.minZoom;
      if (gl.maxZoom !== null) gWindow.maxzoom = gl.maxZoom;
      if (gl.type === "geoScatter") {
        var scatterId = "cf-scatter-" + gl.id;
        styleSources[scatterId] = {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: converted.rows.map(function (point) {
              return {
                type: "Feature",
                properties: { name: point.name || "", value: point.value === undefined ? null : point.value },
                geometry: { type: "Point", coordinates: [point.longitude, point.latitude] }
              };
            })
          }
        };
        styleLayers.push(Object.assign({ id: scatterId, type: "circle", source: scatterId }, gWindow, {
          paint: { "circle-color": gl.color, "circle-opacity": gl.opacity, "circle-radius": Math.max(1, gl.size / 2) }
        }));
        if (gl.label && gl.label.show) {
          converted.rows.forEach(function (point) {
            if (!point.name) return;
            labels.push({
              name: point.name,
              centroid: [point.longitude, point.latitude],
              key: "point:" + gl.id + ":" + point.name,
              color: gl.label.color,
              size: gl.label.size,
              stroke: gl.label.stroke,
              el: null
            });
          });
        }
        continue;
      }
      if (gl.type === "geoHeatmap") {
        var heatId = "cf-heat-" + gl.id;
        var heatValues = converted.rows.map(function (point) { return point.value; });
        var heatMin = Math.min.apply(null, heatValues);
        var heatMax = Math.max.apply(null, heatValues);
        styleSources[heatId] = {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: converted.rows.map(function (point) {
              return {
                type: "Feature",
                properties: { name: "", value: point.value },
                geometry: { type: "Point", coordinates: [point.longitude, point.latitude] }
              };
            })
          }
        };
        styleLayers.push(Object.assign({ id: heatId, type: "heatmap", source: heatId }, gWindow, {
          paint: {
            "heatmap-weight": heatMin === heatMax ? 1 : ["interpolate", ["linear"], ["get", "value"], heatMin, 0, heatMax, 1],
            "heatmap-intensity": 1,
            "heatmap-radius": Math.max(gl.size, 12),
            "heatmap-opacity": gl.opacity,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0, 0, 0, 0)", 0.5, cfHexToRgba(gl.color, 0.55), 1, gl.color]
          }
        }));
        continue;
      }
      if (gl.type === "geoFlow") {
        var flowId = "cf-flow-" + gl.id;
        styleSources[flowId] = {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: converted.rows.map(function (line) {
              return {
                type: "Feature",
                properties: { name: line.name || "", value: null },
                geometry: { type: "LineString", coordinates: [line.from, line.to] }
              };
            })
          }
        };
        styleLayers.push(Object.assign({ id: flowId, type: "line", source: flowId }, gWindow, {
          paint: Object.assign({
            "line-color": gl.color,
            "line-width": Math.max(1, gl.size / 4),
            "line-opacity": gl.opacity
          }, gl.animated ? { "line-dasharray": [3, 9] } : {})
        }));
      }
    }

    var style = {
      version: 8,
      name: "chartforge-map-scene",
      sources: styleSources,
      pitch: pitch,
      center: view.center.slice(),
      zoom: view.zoom,
      minZoom: view.minZoom,
      maxZoom: view.maxZoom,
      light: { anchor: "map", color: "#ffffff", intensity: 0.4, position: [1.15, 210, 40] },
      sky: {
        "sky-color": "#0a1628", "horizon-color": "#12314d", "sky-horizon-blend": 0.5,
        "fog-color": "#0a1628", "horizon-fog-blend": 0.15, "fog-ground-blend": 0.3, "atmosphere-blend": 0.6
      },
      layers: styleLayers
    };

    // T7：图例 DOM（与工作台 .map-scene__legend 同构）
    if (legendEntries.length) {
      var legendEl = doc.createElement("div");
      legendEl.className = "cf-map-legend";
      legendEl.setAttribute("role", "list");
      legendEl.setAttribute("aria-label", "地图图例");
      legendEl.style.position = "absolute"; legendEl.style.zIndex = "3";
      legendEl.style.display = "flex"; legendEl.style.flexDirection = "column"; legendEl.style.gap = "3px";
      legendEl.style.padding = "5px 8px"; legendEl.style.border = "1px solid #54bad744"; legendEl.style.borderRadius = "4px";
      legendEl.style.background = "#061622c9"; legendEl.style.fontSize = "10px"; legendEl.style.pointerEvents = "none";
      if (legendPosition === "top-right") { legendEl.style.top = "10px"; legendEl.style.right = "10px"; }
      else if (legendPosition === "bottom-right") { legendEl.style.right = "10px"; legendEl.style.bottom = "34px"; }
      else { legendEl.style.left = "10px"; legendEl.style.bottom = "10px"; }
      legendEntries.forEach(function (entry) {
        var row = doc.createElement("span");
        row.className = "cf-map-legend-item";
        row.setAttribute("role", "listitem");
        var mark = doc.createElement("i");
        if (legendMode === "segments") {
          mark.className = "cf-map-legend-swatch";
          mark.style.width = "9px"; mark.style.height = "9px"; mark.style.borderRadius = "2px";
          mark.style.background = entry.color;
        } else {
          mark.className = "cf-map-legend-bar";
          mark.style.display = "inline-block"; mark.style.width = "96px"; mark.style.height = "8px";
          mark.style.borderRadius = "3px"; mark.style.border = "1px solid #54bad744";
          mark.style.background = "linear-gradient(90deg, " + entry.stops.join(", ") + ")";
        }
        row.appendChild(mark);
        var legendLabel = doc.createElement("span");
        legendLabel.className = "cf-map-legend-label";
        legendLabel.textContent = legendMode === "segments" ? entry.label : entry.from + " – " + entry.to;
        row.appendChild(legendLabel);
        legendEl.appendChild(row);
      });
      rootEl.appendChild(legendEl);
    }
    // T7：tooltip DOM（与工作台 .map-scene__tooltip 同构）
    var tooltipEl = doc.createElement("div");
    tooltipEl.className = "cf-map-tooltip";
    tooltipEl.style.position = "absolute"; tooltipEl.style.zIndex = "4";
    tooltipEl.style.padding = "4px 8px"; tooltipEl.style.border = "1px solid " + tooltipStyle.borderColor; tooltipEl.style.borderRadius = "4px";
    tooltipEl.style.background = tooltipStyle.background; tooltipEl.style.color = tooltipStyle.color; tooltipEl.style.fontSize = tooltipStyle.fontSize + "px";
    tooltipEl.style.pointerEvents = "none"; tooltipEl.style.whiteSpace = "nowrap"; tooltipEl.style.display = "none";
    rootEl.appendChild(tooltipEl);

    if (errors.length) { showStatus(errors.join("；")); }
    else if (!layers.length) { showStatus("本地离线底图 · 可从图层面板添加区域填色、散点、热力或飞线"); }

    function cfFitIfDefault(mapInstance, styleObj, geo) {
      if (!geo || !Array.isArray(geo.features) || !geo.features.length) return;
      var center = styleObj.center || [];
      var isDefault = center[0] === 104.114129 && center[1] === 35.550339 && styleObj.zoom === 1.05;
      if (!isDefault) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      function walkB(value) {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === "number" && typeof value[1] === "number") {
          minX = Math.min(minX, value[0]); maxX = Math.max(maxX, value[0]);
          minY = Math.min(minY, value[1]); maxY = Math.max(maxY, value[1]);
          return;
        }
        for (var wi = 0; wi < value.length; wi++) walkB(value[wi]);
      }
      geo.features.forEach(function (f) {
        if (!f || !f.geometry) return;
        if (f.geometry.type === "GeometryCollection" && f.geometry.geometries) {
          f.geometry.geometries.forEach(function (g) { if (g) walkB(g.coordinates); });
        } else {
          walkB(f.geometry.coordinates);
        }
      });
      if (!isFinite(minX)) return;
      mapInstance.fitBounds([[minX, minY], [maxX, maxY]], { padding: 28, duration: 0 });
    }

    canvas.__cfRegionValues = regionValues;
    canvas.__cfScene = {
      legend: { show: legendEntries.length > 0, position: legendPosition, mode: legendMode, entries: legendEntries },
      scaleBar: { show: scaleBarShow, position: scaleBarPosition },
      labelMinZoom: labelMinZoom,
      tooltip: {
        show: true,
        background: tooltipStyle.background,
        borderColor: tooltipStyle.borderColor,
        color: tooltipStyle.color,
        fontSize: tooltipStyle.fontSize,
        texts: tooltipTexts
      }
    };
    maplibrePromise.then(function (mod) {
      if (!mod) { if (!statusEl) showStatus("地图运行时缺失：离线包未注入 MapLibre 源"); return; }
      try {
        var map = new mod.Map({
          container: canvas, style: style, minZoom: view.minZoom, maxZoom: view.maxZoom,
          attributionControl: false, interactive: true
        });
        canvas.__cfMap = map; // 测试钩子：e2e 读取离线 style
        canvas.__cfStyle = style; // 测试钩子：e2e 读取离线构建期 style JSON（含悬停过渡与外轮廓图层）
        if (!view.dragEnabled) map.dragPan.disable();
        if (!view.zoomEnabled) map.scrollZoom.disable();
        map.on("error", function (ev) {
          var err = ev && ev.error ? ev.error : ev;
          showStatus((err && err.message) || "地图渲染出错");
        });
        function cfEmitMapEvent(kind, ev) {
          var feature = ev && ev.features && ev.features[0];
          var name = feature && feature.properties ? feature.properties.name : null;
          if (typeof name !== "string" || !name) return;
          var value = typeof regionValues[name] === "number" ? regionValues[name] : null;
          runBlueprint(item, screen, kind, {
            name: name,
            value: value,
            valueText: cfFormatValue(value, valueFormat),
            presentation: presentation
          });
        }
        map.on("click", "cf-fill", function (ev) { cfEmitMapEvent("regionClick", ev); });
        // T7：hover / selected feature-state + tooltip（与工作台同构）
        var hoveredName = null; var hoveredId = null; var selectedName = null; var selectedId = null;
        function cfFeatureId(feature) {
          if (!feature) return null;
          if (typeof feature.id === "number" || typeof feature.id === "string") return feature.id;
          var nm = feature.properties ? feature.properties.name : null;
          return typeof nm === "string" && nm ? nm : null;
        }
        function cfSetState(id, key, on) {
          if (id === null || id === undefined) return;
          try { var state = {}; state[key] = on; map.setFeatureState({ source: "china", id: id }, state); } catch (e) { /* 样式尚未就绪 */ }
        }
        function cfClearHover() {
          if (hoveredId !== null) cfSetState(hoveredId, "cf_hover", false);
          hoveredId = null; hoveredName = null;
        }
        map.on("mousemove", "cf-fill", function (ev) {
          var feature = ev && ev.features && ev.features[0];
          var nm = feature && feature.properties ? feature.properties.name : null;
          if (typeof nm !== "string" || !nm) { cfClearHover(); tooltipEl.style.display = "none"; return; }
          if (nm !== hoveredName) {
            if (hoveredId !== null) cfSetState(hoveredId, "cf_hover", false);
            hoveredId = cfFeatureId(feature); hoveredName = nm;
            cfSetState(hoveredId, "cf_hover", true);
          }
          var text = tooltipTexts[nm] || nm;
          var point = ev && ev.point ? ev.point : { x: 0, y: 0 };
          tooltipEl.textContent = text;
          tooltipEl.style.display = "block";
          tooltipEl.style.left = (point.x + 12) + "px";
          tooltipEl.style.top = (point.y + 12) + "px";
        });
        map.on("mouseout", "cf-fill", function () { cfClearHover(); tooltipEl.style.display = "none"; });
        map.on("click", "cf-fill", function (ev) {
          var feature = ev && ev.features && ev.features[0];
          var nm = feature && feature.properties ? feature.properties.name : null;
          if (typeof nm !== "string" || !nm) return;
          if (selectedId !== null) cfSetState(selectedId, "cf_selected", false);
          selectedId = cfFeatureId(feature); selectedName = nm;
          cfSetState(selectedId, "cf_selected", true);
        });
        map.on("dblclick", "cf-fill", function (ev) {
          cfEmitMapEvent("regionDblclick", ev);
          var df = ev && ev.features && ev.features[0];
          var dn = df && df.properties ? df.properties.name : null;
          if (typeof dn === "string" && dn) cfStartDrill(dn);
        });
        var drillStack = [];
        var drillEl = null;
        function cfCurrentCam() {
          var c = map.getCenter();
          return { center: [c.lng, c.lat], zoom: map.getZoom() };
        }
        function cfRegionCenterLocal(name) {
          if (!geoSource || !Array.isArray(geoSource.features)) return null;
          var feature = null;
          for (var i = 0; i < geoSource.features.length; i++) {
            var f = geoSource.features[i];
            if (f && f.properties && f.properties.name === name) { feature = f; break; }
          }
          if (!feature || !feature.geometry) return null;
          var pts = [];
          function walkPts(v) {
            if (!Array.isArray(v)) return;
            if (typeof v[0] === "number" && typeof v[1] === "number") { pts.push([v[0], v[1]]); return; }
            for (var w = 0; w < v.length; w++) walkPts(v[w]);
          }
          var geom = feature.geometry;
          if (geom.type === "GeometryCollection" && geom.geometries) {
            for (var gi = 0; gi < geom.geometries.length; gi++) if (geom.geometries[gi]) walkPts(geom.geometries[gi].coordinates);
          } else walkPts(geom.coordinates);
          if (!pts.length) return null;
          var xs = pts.map(function (pt) { return pt[0]; });
          var ys = pts.map(function (pt) { return pt[1]; });
          return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
        }
        function cfCrumbBtn(label, index) {
          var b = doc.createElement("button");
          b.type = "button";
          b.className = "cf-map-crumb";
          b.textContent = label;
          b.addEventListener("click", function () { cfDrillToLevel(index); });
          return b;
        }
        function cfUpdateBreadcrumb() {
          if (!drillEl) return;
          while (drillEl.firstChild) drillEl.removeChild(drillEl.firstChild);
          if (!drillStack.length) { drillEl.style.display = "none"; return; }
          drillEl.style.display = "flex";
          drillEl.appendChild(cfCrumbBtn("\u5168\u56fd", -1));
          for (var i = 0; i < drillStack.length; i++) {
            var sep = doc.createElement("span");
            sep.className = "cf-map-crumb-sep";
            sep.textContent = " \u203a ";
            drillEl.appendChild(sep);
            drillEl.appendChild(cfCrumbBtn(drillStack[i].regionName, i));
          }
        }
        function cfDrillToLevel(index) {
          if (!drillStack.length && index >= 0) return;
          var target = index >= 0 ? (drillStack[index] || null) : null;
          drillStack = target ? drillStack.slice(0, index + 1) : [];
          var to = target ? { center: target.center.slice(), zoom: target.zoom } : { center: view.center.slice(), zoom: view.zoom };
          map.flyTo({ center: to.center, zoom: to.zoom, duration: 350, essential: true });
          runBlueprint(item, screen, "regionUpdrill", { name: target ? target.regionName : "\u5168\u56fd", presentation: presentation });
          cfUpdateBreadcrumb();
        }
        function cfStartDrill(name) {
          if (props.drill && props.drill.enabled === false) return;
          var center = cfRegionCenterLocal(name);
          if (!center) return;
          var cam = cfCurrentCam();
          var targetZoom = Math.min(view.maxZoom, Math.max(4.5, cam.zoom));
          drillStack = drillStack.concat([{ center: center, zoom: targetZoom, regionName: name }]);
          map.flyTo({ center: center, zoom: targetZoom, duration: 350, essential: true });
          cfUpdateBreadcrumb();
        }
        function cfEscHandler(ev) {
          if (!ev || ev.key !== "Escape" || !drillStack.length) return;
          ev.stopImmediatePropagation();
          if (ev.preventDefault) ev.preventDefault();
          cfDrillToLevel(drillStack.length - 2);
        }
        doc.addEventListener("keydown", cfEscHandler, true);
        drillEl = doc.createElement("div");
        drillEl.className = "cf-map-breadcrumb";
        drillEl.style.position = "absolute"; drillEl.style.zIndex = "3";
        drillEl.style.top = "10px"; drillEl.style.left = "50%"; drillEl.style.transform = "translateX(-50%)";
        drillEl.style.display = "none"; drillEl.style.alignItems = "center"; drillEl.style.gap = "4px";
        drillEl.style.padding = "4px 8px"; drillEl.style.border = "1px solid #54bad744"; drillEl.style.borderRadius = "4px";
        drillEl.style.background = "#061622c9"; drillEl.style.fontSize = "11px";
        rootEl.appendChild(drillEl);
        function projectLabels() {
          if (!labels.length) return;
          if (!labelShow || (labelMinZoom !== null && map.getZoom() < labelMinZoom)) {
            labels.forEach(function (label) {
              if (label.el) label.el.style.display = "none";
            });
            return;
          }
          var rect = canvas.getBoundingClientRect();
          labels.forEach(function (label) {
            if (!label.el) {
              var span = doc.createElement("span");
              span.className = "cf-map-label";
              span.textContent = label.name;
              span.style.position = "absolute";
              span.style.transform = "translate(-50%, -50%)";
              span.style.whiteSpace = "nowrap";
              span.style.fontSize = (label.size || labelSize) + "px";
              span.style.color = label.color || labelColor;
              span.style.textShadow = label.stroke ? "0 0 3px " + label.stroke : (labelShadow ? "0 0 3px " + labelShadow : "0 0 3px #013a4a");
              labelsBox.appendChild(span);
              label.el = span;
            }
            var pt = map.project(label.centroid);
            var visible = pt.x >= 0 && pt.y >= 0 && pt.x <= rect.width && pt.y <= rect.height;
            label.el.style.display = visible ? "block" : "none";
            if (visible) { label.el.style.left = pt.x + "px"; label.el.style.top = pt.y + "px"; }
          });
        }
        var scaleBarEl = null;
        function cfUpdateScaleBar() {
          if (!scaleBarShow) { if (scaleBarEl) scaleBarEl.style.display = "none"; return; }
          var mapCanvas = map.getCanvas();
          var cw = mapCanvas.clientWidth;
          var ch = mapCanvas.clientHeight;
          if (!cw || !ch) return;
          if (!scaleBarEl) {
            scaleBarEl = doc.createElement("div");
            scaleBarEl.className = "cf-map-scalebar";
            scaleBarEl.setAttribute("role", "img");
            scaleBarEl.setAttribute("aria-label", "比例尺");
            scaleBarEl.style.position = "absolute"; scaleBarEl.style.zIndex = "3";
            scaleBarEl.style.display = "flex"; scaleBarEl.style.flexDirection = "column"; scaleBarEl.style.alignItems = "flex-start"; scaleBarEl.style.gap = "2px";
            scaleBarEl.style.padding = "4px 6px"; scaleBarEl.style.border = "1px solid #54bad744"; scaleBarEl.style.borderRadius = "4px";
            scaleBarEl.style.background = "#061622c9"; scaleBarEl.style.fontSize = "10px"; scaleBarEl.style.color = "#b9e9f5";
            scaleBarEl.style.pointerEvents = "none";
            if (scaleBarPosition === "top-left") { scaleBarEl.style.top = "10px"; scaleBarEl.style.left = "10px"; }
            else if (scaleBarPosition === "top-right") { scaleBarEl.style.top = "10px"; scaleBarEl.style.right = "10px"; }
            else if (scaleBarPosition === "bottom-right") { scaleBarEl.style.right = "10px"; scaleBarEl.style.bottom = "34px"; }
            else { scaleBarEl.style.left = "10px"; scaleBarEl.style.bottom = "10px"; }
            var scaleBarMark = doc.createElement("span");
            scaleBarMark.className = "cf-map-scalebar-bar";
            scaleBarMark.style.display = "block"; scaleBarMark.style.height = "5px";
            scaleBarMark.style.border = "1px solid #b9e9f5"; scaleBarMark.style.borderTop = "none";
            var scaleBarText = doc.createElement("span");
            scaleBarText.className = "cf-map-scalebar-text";
            scaleBarText.style.whiteSpace = "nowrap";
            scaleBarEl.appendChild(scaleBarMark);
            scaleBarEl.appendChild(scaleBarText);
            rootEl.appendChild(scaleBarEl);
          }
          var row = Math.max(1, Math.round(ch / 2));
          var from = map.unproject([0, row]);
          var to = map.unproject([100, row]);
          var metersPerPixel = cfHaversine([from.lng, from.lat], [to.lng, to.lat]) / 100;
          var picked = cfPickScaleBarDistance(metersPerPixel, 110);
          var barEl = scaleBarEl.querySelector(".cf-map-scalebar-bar");
          var textEl = scaleBarEl.querySelector(".cf-map-scalebar-text");
          if (barEl) barEl.style.width = picked.pixels + "px";
          if (textEl) textEl.textContent = picked.text;
        }
        function cfApplyViewOffset() {
          if (!viewOffset || (!viewOffset.x && !viewOffset.y)) return;
          var mapCanvas = map.getCanvas();
          var cw = mapCanvas.clientWidth;
          var ch = mapCanvas.clientHeight;
          if (!cw || !ch) return;
          var current = map.getCenter();
          var zoom = map.getZoom();
          var worldSize = 512 * Math.pow(2, Math.max(0, zoom));
          var degPerPixelLng = 360 / worldSize;
          var metersPerPixel = 40075016.686 * Math.cos(current.lat * Math.PI / 180) / worldSize;
          var degPerPixelLat = metersPerPixel / 111319.49079327358;
          var shiftX = (viewOffset.x / 100) * cw;
          var shiftY = (viewOffset.y / 100) * ch;
          map.jumpTo({ center: [current.lng - shiftX * degPerPixelLng, current.lat + shiftY * degPerPixelLat] });
        }
        function cfSyncCamera() {
          map.jumpTo({ center: view.center.slice(), zoom: view.zoom, pitch: pitch });
          cfFitIfDefault(map, style, geoSource);
          cfApplyViewOffset();
          projectLabels();
          cfUpdateScaleBar();
        }
        map.on("move", function () {
          projectLabels();
          cfUpdateScaleBar();
        });
        map.on("load", function () {
          cfSyncCamera();
        });
        cfSyncCamera();
        charts.push({ dispose: function () { try { map.remove(); } catch (e) { /* 已销毁 */ } } });
      } catch (createErr) {
        showStatus((createErr && createErr.message) || "地图渲染出错");
      }
    });
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
      safeMapSceneMaplibre(item, rootEl, rows, props, screen);
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

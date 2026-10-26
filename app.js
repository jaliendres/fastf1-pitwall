"use strict";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const state = { manifest: null, session: null, driverA: null, driverB: null, cleanLaps: true };

const compoundClass = (name = "") => name.toLowerCase().replace("intermediate", "intermediate");
const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const formatSeconds = (value) => {
  if (!finite(value)) return "—";
  const minutes = Math.floor(Number(value) / 60);
  return `${minutes}:${(Number(value) - minutes * 60).toFixed(3).padStart(6, "0")}`;
};
const formatDelta = (value) => !finite(value) ? "—" : `${Number(value) >= 0 ? "+" : "−"}${Math.abs(Number(value)).toFixed(3)}s`;
const formatDate = (value) => {
  if (!value) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
};
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function svgEl(name, attributes = {}, text = "") {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text !== "") element.textContent = text;
  return element;
}

function setLoading(message, isError = false) {
  $("loadingState").hidden = false;
  $("loadingState").innerHTML = isError
    ? `<strong>${escapeHTML(message)}</strong>`
    : `<span></span><span></span><span></span>${escapeHTML(message)}`;
  $("analysis").hidden = true;
}

async function loadManifest() {
  try {
    const response = await fetch("data/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.manifest = await response.json();
    const select = $("sessionSelect");
    select.innerHTML = state.manifest.sessions.map((session) =>
      `<option value="${escapeHTML(session.file)}">${session.year} · ${escapeHTML(session.event)} · ${escapeHTML(session.sessionName)}</option>`
    ).join("");
    $("dataStamp").textContent = `DATOS · ${new Date(state.manifest.generatedAt).toLocaleDateString("es")}`;
    await loadSession(select.value);
  } catch (error) {
    setLoading("No fue posible cargar los datos. Inicia un servidor local o revisa el despliegue de GitHub Pages.", true);
    console.error(error);
  }
}

async function loadSession(file) {
  setLoading("Procesando telemetría…");
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.session = await response.json();
    const available = state.session.ranking.filter((driver) => state.session.drivers[driver.abbreviation]?.telemetry?.distance?.length > 2);
    if (available.length < 2) throw new Error("La sesión no contiene dos pilotos con telemetría");
    state.driverA = available[0].abbreviation;
    state.driverB = available[1].abbreviation;
    populateDriverSelectors(available);
    $("loadingState").hidden = true;
    $("analysis").hidden = false;
    render();
  } catch (error) {
    setLoading(`No se pudo abrir la sesión: ${error.message}`, true);
    console.error(error);
  }
}

function populateDriverSelectors(drivers) {
  const options = drivers.map((driver) =>
    `<option value="${driver.abbreviation}">${driver.abbreviation} · ${escapeHTML(driver.fullName)}</option>`
  ).join("");
  $("driverASelect").innerHTML = options;
  $("driverBSelect").innerHTML = options;
  $("driverASelect").value = state.driverA;
  $("driverBSelect").value = state.driverB;
}

function currentDrivers() {
  return [state.session.drivers[state.driverA], state.session.drivers[state.driverB]];
}

function driverCard(driver, side) {
  const position = driver.position ? `P${Math.round(driver.position)}` : driver.classifiedPosition;
  return `
    <header><div><span class="driver-code">${escapeHTML(driver.abbreviation)}</span><p>${escapeHTML(driver.fullName)}</p></div><span class="driver-number">#${escapeHTML(driver.number)}</span></header>
    <p><strong>${escapeHTML(driver.team)}</strong><br>${position} · ${driver.bestLap} · ${driver.topSpeed ?? "—"} km/h</p>
  `;
}

function renderHeader(a, b) {
  const meta = state.session.meta;
  $("sessionCode").textContent = `${meta.year} / ${meta.session}`;
  $("sessionTitle").textContent = meta.event;
  $("sessionSubtitle").textContent = `${meta.location}, ${meta.country} · ${formatDate(meta.date)} · ${meta.source}`;
  document.documentElement.style.setProperty("--driver-a", a.color);
  document.documentElement.style.setProperty("--driver-b", b.color);
  $("driverACard").dataset.code = a.abbreviation;
  $("driverBCard").dataset.code = b.abbreviation;
  $("driverACard").innerHTML = driverCard(a, "a");
  $("driverBCard").innerHTML = driverCard(b, "b");

  const delta = (b.bestLapSeconds ?? 0) - (a.bestLapSeconds ?? 0);
  $("headlineDelta").textContent = formatDelta(delta);
  if (!finite(a.bestLapSeconds) || !finite(b.bestLapSeconds)) {
    $("headlineWinner").textContent = "Comparación incompleta";
  } else if (Math.abs(delta) < .0005) {
    $("headlineWinner").textContent = "Mismo registro";
  } else {
    $("headlineWinner").textContent = `${delta > 0 ? a.abbreviation : b.abbreviation} más rápido`;
  }
}

function renderKpis(a, b) {
  const best = [a, b].filter((d) => finite(d.bestLapSeconds)).sort((x, y) => x.bestLapSeconds - y.bestLapSeconds)[0];
  const speedLeader = [a, b].filter((d) => finite(d.topSpeed)).sort((x, y) => y.topSpeed - x.topSpeed)[0];
  const medianLeader = [a, b].filter((d) => finite(d.medianLapSeconds)).sort((x, y) => x.medianLapSeconds - y.medianLapSeconds)[0];
  $("kpiBest").textContent = best?.bestLap || "—";
  $("kpiBestNote").textContent = best ? `${best.abbreviation} · mejor registro` : "Sin registro";
  $("kpiSpeed").textContent = speedLeader ? `${Math.round(speedLeader.topSpeed)} km/h` : "—";
  $("kpiSpeedNote").textContent = speedLeader ? `${speedLeader.abbreviation} · máxima registrada` : "Sin registro";
  $("kpiMedian").textContent = medianLeader ? formatSeconds(medianLeader.medianLapSeconds) : "—";
  $("kpiMedianNote").textContent = medianLeader ? `${medianLeader.abbreviation} · menor mediana` : "Sin registro";
  $("kpiLaps").textContent = `${a.lapCount} / ${b.lapCount}`;
}

function validPoints(xs = [], ys = []) {
  return xs.map((x, index) => ({ x: Number(x), y: Number(ys[index]) })).filter((p) => finite(p.x) && finite(p.y));
}

function renderLineChart(svg, series, options = {}) {
  svg.replaceChildren();
  const width = Math.max(svg.clientWidth || 620, 220);
  const height = Math.max(svg.clientHeight || options.height || 160, 70);
  const margin = { top: 14, right: 12, bottom: options.xLabels === false ? 8 : 25, left: 43 };
  const all = series.flatMap((entry) => entry.points);
  if (!all.length) {
    svg.append(svgEl("text", { x: width / 2, y: height / 2, class: "chart-axis", "text-anchor": "middle" }, "SIN DATOS"));
    return;
  }
  let xMin = options.xMin ?? Math.min(...all.map((p) => p.x));
  let xMax = options.xMax ?? Math.max(...all.map((p) => p.x));
  let yMin = options.yMin ?? Math.min(...all.map((p) => p.y));
  let yMax = options.yMax ?? Math.max(...all.map((p) => p.y));
  if (options.includeZero) { yMin = Math.min(0, yMin); yMax = Math.max(0, yMax); }
  if (xMax === xMin) xMax += 1;
  if (yMax === yMin) { yMin -= 1; yMax += 1; }
  const yPadding = (yMax - yMin) * .08;
  yMin -= yPadding; yMax += yPadding;
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (x) => margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => margin.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (plotH * i / 4);
    svg.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "chart-grid" }));
    const value = yMax - (yMax - yMin) * i / 4;
    svg.append(svgEl("text", { x: margin.left - 7, y: y + 3, class: "chart-axis", "text-anchor": "end" }, options.yFormatter ? options.yFormatter(value) : value.toFixed(options.decimals ?? 0)));
  }
  if (yMin < 0 && yMax > 0) svg.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: sy(0), y2: sy(0), class: "chart-zero" }));
  if (options.xLabels !== false) {
    for (let i = 0; i <= 5; i++) {
      const value = xMin + (xMax - xMin) * i / 5;
      svg.append(svgEl("text", { x: sx(value), y: height - 5, class: "chart-axis", "text-anchor": "middle" }, options.xFormatter ? options.xFormatter(value) : Math.round(value).toLocaleString("es")));
    }
  }
  series.forEach((entry) => {
    const d = entry.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join(" ");
    svg.append(svgEl("path", { d, class: "chart-line", stroke: entry.color, opacity: entry.opacity ?? 1 }));
  });
}

function interpolate(points, x) {
  if (!points.length || x < points[0].x || x > points.at(-1).x) return null;
  let low = 0, high = points.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].x <= x) low = mid; else high = mid;
  }
  const a = points[low], b = points[high];
  if (b.x === a.x) return a.y;
  return a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x));
}

function calculateDelta(a, b) {
  const aSpeed = validPoints(a.telemetry.distance, a.telemetry.speed);
  const bSpeed = validPoints(b.telemetry.distance, b.telemetry.speed);
  if (!aSpeed.length || !bSpeed.length) return [];
  const maxDistance = Math.min(aSpeed.at(-1).x, bSpeed.at(-1).x);
  const xs = Array.from({ length: 180 }, (_, index) => maxDistance * index / 179);
  let timeA = 0, timeB = 0;
  const output = [{ x: 0, y: 0 }];
  for (let index = 1; index < xs.length; index++) {
    const dx = xs[index] - xs[index - 1];
    const va = Math.max(1, (interpolate(aSpeed, xs[index]) + interpolate(aSpeed, xs[index - 1])) / 2 / 3.6);
    const vb = Math.max(1, (interpolate(bSpeed, xs[index]) + interpolate(bSpeed, xs[index - 1])) / 2 / 3.6);
    timeA += dx / va;
    timeB += dx / vb;
    output.push({ x: xs[index], y: timeB - timeA });
  }
  return output;
}

function renderTelemetry(a, b) {
  $("telemetryLegend").innerHTML = `<span><i style="background:${a.color}"></i>${a.abbreviation}</span><span><i style="background:${b.color}"></i>${b.abbreviation}</span>`;
  const channels = [
    ["speedChart", "speed", { yMin: 0 }],
    ["throttleChart", "throttle", { yMin: 0, yMax: 100, xLabels: false }],
    ["brakeChart", "brake", { yMin: 0, yMax: 1, xLabels: false }],
  ];
  channels.forEach(([id, key, options]) => renderLineChart($(id), [
    { color: a.color, points: validPoints(a.telemetry.distance, a.telemetry[key]) },
    { color: b.color, points: validPoints(b.telemetry.distance, b.telemetry[key]) },
  ], { ...options, xFormatter: (value) => `${(value / 1000).toFixed(1)}k` }));
  renderLineChart($("deltaChart"), [{ color: cssVar("--lime"), points: calculateDelta(a, b) }], {
    includeZero: true, decimals: 2, yFormatter: (value) => value.toFixed(2), xFormatter: (value) => `${(value / 1000).toFixed(1)}k`,
  });
}

function speedColor(speed, min, max) {
  const t = clamp((speed - min) / Math.max(1, max - min), 0, 1);
  const stops = [[255,112,93], [255,200,87], [113,240,232]];
  const scaled = t * 2;
  const index = Math.min(1, Math.floor(scaled));
  const local = scaled - index;
  const from = stops[index], to = stops[index + 1];
  return `rgb(${from.map((value, i) => Math.round(value + (to[i] - value) * local)).join(",")})`;
}

function renderTrack(driver) {
  const svg = $("trackMap");
  svg.replaceChildren();
  const points = driver.telemetry.x.map((x, index) => ({ x: Number(x), y: Number(driver.telemetry.y[index]), speed: Number(driver.telemetry.speed[index]) })).filter((p) => finite(p.x) && finite(p.y) && finite(p.speed));
  if (points.length < 2) return;
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  const speeds = points.map((p) => p.speed), minSpeed = Math.min(...speeds), maxSpeed = Math.max(...speeds);
  const width = 420, height = 370, pad = 30;
  const scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY));
  const drawW = (maxX - minX) * scale, drawH = (maxY - minY) * scale;
  const sx = (x) => (width - drawW) / 2 + (x - minX) * scale;
  const sy = (y) => (height + drawH) / 2 - (y - minY) * scale;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const outline = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  svg.append(svgEl("path", { d: outline, class: "track-outline" }));
  points.slice(0, -1).forEach((point, index) => {
    const next = points[index + 1];
    svg.append(svgEl("line", { x1: sx(point.x), y1: sy(point.y), x2: sx(next.x), y2: sy(next.y), class: "track-segment", stroke: speedColor(point.speed, minSpeed, maxSpeed) }));
  });
  const start = points[0];
  svg.append(svgEl("circle", { cx: sx(start.x), cy: sy(start.y), r: 7, fill: "#f4f7f3", stroke: "#071014", "stroke-width": 3 }));
  $("trackInsight").textContent = `${driver.abbreviation}: rango visual de ${Math.round(minSpeed)} a ${Math.round(maxSpeed)} km/h en su vuelta rápida.`;
}

function representativeLaps(driver) {
  let laps = driver.laps.filter((lap) => finite(lap.time));
  if (state.cleanLaps && finite(driver.medianLapSeconds)) laps = laps.filter((lap) => lap.time <= driver.medianLapSeconds * 1.08);
  return laps.map((lap) => ({ x: Number(lap.lap), y: Number(lap.time) }));
}

function renderPace(a, b) {
  renderLineChart($("paceChart"), [
    { color: a.color, points: representativeLaps(a) },
    { color: b.color, points: representativeLaps(b) },
  ], { decimals: 1, yFormatter: formatSeconds, xFormatter: (value) => `V${Math.round(value)}` });
}

function renderStrategy(a, b) {
  const maxLap = Math.max(1, ...a.stints.map((s) => s.endLap || 0), ...b.stints.map((s) => s.endLap || 0));
  $("strategyChart").innerHTML = [a, b].map((driver) => {
    const stints = driver.stints.map((stint) => {
      const width = (stint.laps / maxLap) * 100;
      return `<div class="stint ${compoundClass(stint.compound)}" style="width:${width}%" title="${escapeHTML(stint.compound)} · V${stint.startLap}–V${stint.endLap}">${stint.laps > 2 ? escapeHTML(stint.compound.slice(0, 1)) : ""}</div>`;
    }).join("");
    return `<div class="strategy-row"><strong style="color:${driver.color}">${driver.abbreviation}</strong><div class="stint-track">${stints || '<div class="stint unknown" style="width:100%">SIN DATOS</div>'}</div></div>`;
  }).join("");
}

function renderRanking() {
  $("rankingBody").innerHTML = state.session.ranking.map((driver) => {
    const position = finite(driver.position) ? Math.round(driver.position) : driver.classifiedPosition;
    return `<tr data-driver="${driver.abbreviation}" tabindex="0">
      <td>${escapeHTML(position)}</td>
      <td><div class="driver-cell"><i style="background:${driver.color}"></i><div><strong>${escapeHTML(driver.abbreviation)}</strong><small>${escapeHTML(driver.fullName)}</small></div></div></td>
      <td class="muted-cell">${escapeHTML(driver.team)}</td>
      <td>${escapeHTML(driver.bestLap)}</td>
      <td class="muted-cell">${escapeHTML(driver.status)}</td>
      <td>${finite(driver.points) ? driver.points : "—"}</td>
    </tr>`;
  }).join("");
  $("rankingBody").querySelectorAll("tr").forEach((row) => {
    const select = () => {
      if (!state.session.drivers[row.dataset.driver]?.telemetry?.distance?.length) return;
      state.driverA = row.dataset.driver;
      if (state.driverA === state.driverB) {
        state.driverB = Object.keys(state.session.drivers).find((code) => code !== state.driverA && state.session.drivers[code].telemetry.distance.length) || state.driverB;
      }
      $("driverASelect").value = state.driverA;
      $("driverBSelect").value = state.driverB;
      render();
      $("analysis").scrollIntoView({ behavior: "smooth" });
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") select(); });
  });
}

function range(values, suffix = "", decimals = 1) {
  const cleanValues = values.filter(finite).map(Number);
  if (!cleanValues.length) return "—";
  return `${Math.min(...cleanValues).toFixed(decimals)}–${Math.max(...cleanValues).toFixed(decimals)}${suffix}`;
}

function average(values, suffix = "", decimals = 1) {
  const cleanValues = values.filter(finite).map(Number);
  if (!cleanValues.length) return "—";
  return `${(cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length).toFixed(decimals)}${suffix}`;
}

function renderWeather() {
  const weather = state.session.weather || [];
  const tracks = weather.map((row) => row.trackTemp), airs = weather.map((row) => row.airTemp);
  $("trackTemp").textContent = average(tracks, "°C");
  $("trackTempRange").textContent = `Rango ${range(tracks, "°C")}`;
  $("airTemp").textContent = average(airs, "°C");
  $("humidity").textContent = average(weather.map((row) => row.humidity), "%", 0);
  $("wind").textContent = average(weather.map((row) => row.windSpeed), " m/s");
  $("rain").textContent = weather.some((row) => row.rainfall) ? "SÍ" : "NO";
}

function render() {
  const [a, b] = currentDrivers();
  renderHeader(a, b);
  renderKpis(a, b);
  renderTelemetry(a, b);
  renderTrack(a);
  renderPace(a, b);
  renderStrategy(a, b);
  renderRanking();
  renderWeather();
}

function exportCSV() {
  const [a, b] = currentDrivers();
  const delta = calculateDelta(a, b);
  const rows = [["distance_m", `${a.abbreviation}_speed_kmh`, `${b.abbreviation}_speed_kmh`, `delta_${b.abbreviation}_minus_${a.abbreviation}_s`]];
  const aSpeed = validPoints(a.telemetry.distance, a.telemetry.speed), bSpeed = validPoints(b.telemetry.distance, b.telemetry.speed);
  delta.forEach((point) => rows.push([point.x.toFixed(1), interpolate(aSpeed, point.x)?.toFixed(2) ?? "", interpolate(bSpeed, point.x)?.toFixed(2) ?? "", point.y.toFixed(4)]));
  const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.session.meta.id}-${a.abbreviation}-${b.abbreviation}.csv`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$("sessionSelect").addEventListener("change", (event) => loadSession(event.target.value));
$("driverASelect").addEventListener("change", (event) => {
  state.driverA = event.target.value;
  if (state.driverA === state.driverB) {
    const alternative = Array.from($("driverBSelect").options).find((option) => option.value !== state.driverA);
    state.driverB = alternative.value; $("driverBSelect").value = state.driverB;
  }
  render();
});
$("driverBSelect").addEventListener("change", (event) => {
  state.driverB = event.target.value;
  if (state.driverB === state.driverA) {
    const alternative = Array.from($("driverASelect").options).find((option) => option.value !== state.driverB);
    state.driverA = alternative.value; $("driverASelect").value = state.driverA;
  }
  render();
});
$("cleanLapsToggle").addEventListener("click", () => {
  state.cleanLaps = !state.cleanLaps;
  $("cleanLapsToggle").classList.toggle("is-active", state.cleanLaps);
  $("cleanLapsToggle").textContent = state.cleanLaps ? "VUELTAS REPRESENTATIVAS" : "TODAS LAS VUELTAS";
  const [a, b] = currentDrivers(); renderPace(a, b);
});
$("exportBtn").addEventListener("click", exportCSV);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.session) render(); }, 120);
});

loadManifest();


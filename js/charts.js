/* ============================================================================
 * charts.js — gráficos con Chart.js, equivalentes a charts.py
 * ==========================================================================*/

const COLOR_OK = "#2E7D32";
const COLOR_WARN = "#F9A825";
const COLOR_BAD = "#C62828";
const COLOR_NOMINAL = "#455A64";
const COLOR_BAND = "rgba(144,202,249,0.5)";
const FASE_COLOR = { A: "#1565C0", B: "#EF6C00", C: "#2E7D32" };

const _chartInstances = {};

function _destroyChart(canvasId) {
  if (_chartInstances[canvasId]) {
    _chartInstances[canvasId].destroy();
    delete _chartInstances[canvasId];
  }
}

function chartRatio(canvasIdLine, canvasIdBar, rel) {
  _destroyChart(canvasIdLine);
  _destroyChart(canvasIdBar);

  const pos = rel.taps.map(t => t.pos);
  const nominal = rel.taps.map(t => t.valor_nominal || null);
  const vmin = rel.taps.map(t => t.valor_minimo || null);
  const vmax = rel.taps.map(t => t.valor_maximo || null);

  const datasetsLine = [
    { label: "Tolerancia (V.mín)", data: vmin, borderColor: "transparent", backgroundColor: COLOR_BAND, fill: "+1", pointRadius: 0 },
    { label: "Tolerancia (V.máx)", data: vmax, borderColor: "transparent", backgroundColor: COLOR_BAND, fill: false, pointRadius: 0 },
    { label: "Relación nominal", data: nominal, borderColor: COLOR_NOMINAL, borderDash: [6, 4], pointRadius: 3, fill: false },
  ];
  for (const f of FASES) {
    const data = rel.taps.map(t => t.relacion[f] || null);
    if (data.every(v => !v)) continue;
    datasetsLine.push({
      label: `Fase ${f} medida`, data, showLine: false,
      backgroundColor: rel.taps.map(t => {
        const ok = t.dentro_tolerancia[f];
        return ok === null ? "#9E9E9E" : (ok ? COLOR_OK : COLOR_BAD);
      }),
      borderColor: FASE_COLOR[f], pointRadius: 6, pointStyle: f === "A" ? "circle" : f === "B" ? "rect" : "triangle",
    });
  }
  _chartInstances[canvasIdLine] = new Chart(document.getElementById(canvasIdLine).getContext('2d'), {
    type: "line",
    data: { labels: pos.map(String), datasets: datasetsLine },
    options: {
      animation: false,
      responsive: true,
      plugins: { title: { display: true, text: "Relación de transformación por TAP y fase" }, legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
      scales: { x: { title: { display: true, text: "Posición de derivación (TAP)" } }, y: { title: { display: true, text: "Relación de transformación" } } },
    },
  });

  const datasetsBar = FASES.map(f => ({
    label: `Fase ${f}`, backgroundColor: FASE_COLOR[f],
    data: rel.taps.map(t => t.corriente_excitacion[f] || 0),
  }));
  _chartInstances[canvasIdBar] = new Chart(document.getElementById(canvasIdBar).getContext('2d'), {
    type: "bar",
    data: { labels: pos.map(String), datasets: datasetsBar },
    options: {
      animation: false,
      responsive: true,
      plugins: { title: { display: true, text: "Corriente de excitación por TAP y fase" } },
      scales: { x: { title: { display: true, text: "Posición de derivación (TAP)" } }, y: { title: { display: true, text: "Corriente de excitación" } } },
    },
  });
}

function chartInsulation(canvasIdCurve, canvasIdBar, a) {
  _destroyChart(canvasIdCurve);
  _destroyChart(canvasIdBar);
  const series = seriesAislamiento(a);
  const colors = { "prim/sec": "#1565C0", "prim/tierra": "#EF6C00", "sec/tierra": "#2E7D32" };
  const datasetsCurve = [];
  for (const s of series) {
    const data = TIEMPOS_MIN.map(t => s.corregidas[t] || null);
    if (data.every(v => !v)) continue;
    datasetsCurve.push({ label: s.nombre, data, borderColor: colors[s.nombre], backgroundColor: colors[s.nombre], fill: false, tension: 0.15 });
  }
  _chartInstances[canvasIdCurve] = new Chart(document.getElementById(canvasIdCurve).getContext('2d'), {
    type: "line",
    data: { labels: TIEMPOS_MIN.map(String), datasets: datasetsCurve },
    options: {
      animation: false,
      responsive: true,
      plugins: { title: { display: true, text: "Resistencia de aislamiento vs. tiempo" } },
      scales: {
        x: { title: { display: true, text: "Tiempo (min)" } },
        y: { type: "logarithmic", title: { display: true, text: "Resistencia corregida a 20°C" } },
      },
    },
  });

  const labels = series.map(s => s.nombre);
  _chartInstances[canvasIdBar] = new Chart(document.getElementById(canvasIdBar).getContext('2d'), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "PI (10min/1min)", data: series.map(s => s.pi || 0), backgroundColor: "#1565C0" },
        { label: "DAR (1min/30s)", data: series.map(s => s.dar || 0), backgroundColor: "#EF6C00" },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      plugins: { title: { display: true, text: "Índices PI / DAR (ref. IEEE 43)" } },
    },
  });
}

function chartWindings(canvasIdBaja, canvasIdAlta, dv) {
  _destroyChart(canvasIdBaja);
  _destroyChart(canvasIdAlta);
  const pairs = [[canvasIdBaja, dv.baja, "Devanado BAJA"], [canvasIdAlta, dv.alta, "Devanado ALTA"]];
  for (const [canvasId, grupo, titulo] of pairs) {
    const estado = clasificarDevanado(grupo.diferencia_fases);
    const color = { OK: COLOR_OK, Revisar: COLOR_WARN, "Fuera de rango": COLOR_BAD, "N/D": "#9E9E9E" }[estado];
    _chartInstances[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), {
      type: "bar",
      data: {
        labels: grupo.fases.map(f => "F" + f.fase),
        datasets: [{ label: "Resistencia (Ω)", data: grupo.fases.map(f => f.resultado_ohm || 0), backgroundColor: "#1565C0" }],
      },
      options: {
      animation: false,
        responsive: true,
        plugins: { title: { display: true, text: `${titulo} — ${estado}`, color } },
      },
    });
  }
}

function chartDielectric(canvasId, di) {
  _destroyChart(canvasId);
  const colors = di.limite_minimo !== null
    ? di.lecturas.map(v => (v >= di.limite_minimo ? COLOR_OK : COLOR_BAD))
    : di.lecturas.map(() => "#1565C0");
  _chartInstances[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), {
    type: "bar",
    data: {
      labels: di.lecturas.map((_, i) => String(i + 1)),
      datasets: [{ label: "V. ruptura (kV)", data: di.lecturas, backgroundColor: colors }],
    },
    options: {
      animation: false,
      responsive: true,
      plugins: { title: { display: true, text: "Rigidez dieléctrica del aceite" } },
      scales: { x: { title: { display: true, text: "Número de ensayo" } }, y: { title: { display: true, text: "kV" } } },
    },
  });
}

// Panel resumen tipo semáforo (HTML puro, no requiere canvas)
function estadoResumenGeneral(insp) {
  const filas = [];

  const tapsOk = [];
  insp.relacion.taps.forEach(t => FASES.forEach(f => { if (t.dentro_tolerancia[f] !== null) tapsOk.push(t.dentro_tolerancia[f]); }));
  filas.push(["Relación de transformación", tapsOk.length ? (tapsOk.every(Boolean) ? "OK" : "Fuera de rango") : "Sin datos"]);

  const pis = seriesAislamiento(insp.aislamiento).map(s => s.pi).filter(v => v);
  filas.push(["Resistencia de aislamiento (PI)", pis.length ? calificacionPI(Math.min(...pis)) : "Sin datos"]);

  const estados = [clasificarDevanado(insp.devanados.baja.diferencia_fases), clasificarDevanado(insp.devanados.alta.diferencia_fases)];
  let estadoDv = "Sin datos";
  if (estados.includes("Fuera de rango")) estadoDv = "Fuera de rango";
  else if (estados.includes("Revisar")) estadoDv = "Revisar";
  else if (!estados.includes("N/D")) estadoDv = "OK";
  filas.push(["Resistencia de devanados", estadoDv]);

  filas.push(["Rigidez dieléctrica del aceite", insp.dielectrica.cumple === null ? "Sin datos" : (insp.dielectrica.cumple ? "OK" : "Fuera de rango")]);

  return filas;
}

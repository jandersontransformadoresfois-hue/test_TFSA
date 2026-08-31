/* ============================================================================
 * app.js — estado, construcción de UI dinámica, y wiring de eventos
 * ==========================================================================*/

const STORAGE_KEY = "inspeccion_transformador_v1";

let insp = cargarEstado() || nuevaInspeccion();

// ---------------------------------------------------------------------------
// Persistencia local (localStorage) — para no perder datos si se cierra
// la app o el teléfono se queda sin batería a mitad de la inspección.
// ---------------------------------------------------------------------------
function guardarEstado() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(insp));
  } catch (e) { /* almacenamiento lleno o no disponible: continuar igual */ }
}
function cargarEstado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------------------------------------------------------------------------
// Navegación entre pestañas
// ---------------------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "tab-resumen") renderResumen();
    if (btn.dataset.tab === "tab-graficos") renderGraficos();
  });
});

// ---------------------------------------------------------------------------
// Sección 1: Datos del transformador
// ---------------------------------------------------------------------------
const camposDatos = ["fabricante", "serial", "cliente", "fecha_fab", "potencia_kva",
  "frecuencia", "tension_prim_vl", "tension_prim_vf", "tension_sec_vl", "tension_sec_vf",
  "tipo", "grupo_conexion", "liquido_aislante"];

function cargarDatosEnUI() {
  camposDatos.forEach(c => {
    const el = document.getElementById("d-" + c);
    if (el) el.value = insp.datos[c] ?? "";
  });
}
function leerDatosDeUI() {
  camposDatos.forEach(c => {
    const el = document.getElementById("d-" + c);
    if (!el) return;
    const isNum = el.type === "number";
    insp.datos[c] = isNum ? (parseFloat(el.value.replace(",", ".")) || 0) : el.value;
  });
}
function calcularDatos() {
  leerDatosDeUI();
  const ip = corrientePrimaria(insp.datos);
  const isec = corrienteSecundaria(insp.datos);
  document.getElementById("datos-resultado").innerHTML =
    `Corriente primaria: ${ip !== null ? fmt(ip, 3) + " A" : "N/D"}<br>` +
    `Corriente secundaria: ${isec !== null ? fmt(isec, 3) + " A" : "N/D"}`;
  guardarEstado();
}
document.getElementById("btn-calc-datos").addEventListener("click", calcularDatos);

// ---------------------------------------------------------------------------
// Sección 2: Relación de transformación (trifásico)
// ---------------------------------------------------------------------------
function buildRelacionUI() {
  const tbody = document.querySelector("#tabla-ref-relacion tbody");
  tbody.innerHTML = "";
  insp.relacion.taps.forEach(tap => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${tap.pos}</td><td id="ref-deriv-${tap.pos}">—</td>` +
      `<td id="ref-vmin-${tap.pos}">—</td><td id="ref-vmax-${tap.pos}">—</td>`;
    tbody.appendChild(tr);
  });

  const cont = document.getElementById("fases-relacion-container");
  cont.innerHTML = "";
  FASES.forEach(f => {
    const card = document.createElement("div");
    card.className = "fase-card";
    let rows = "";
    insp.relacion.taps.forEach(tap => {
      rows += `<tr>
        <td>${tap.pos}</td>
        <td><input type="number" step="any" id="rel-${f}-${tap.pos}" value="${tap.relacion[f] || ""}"></td>
        <td><input type="number" step="any" id="exc-${f}-${tap.pos}" value="${tap.corriente_excitacion[f] || ""}"></td>
        <td id="est-${f}-${tap.pos}">—</td>
      </tr>`;
    });
    card.innerHTML = `<h4>Fase ${f}</h4>
      <table class="tabla"><thead><tr><th>POS</th><th>Relación</th><th>I.excit.</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    cont.appendChild(card);
  });
}
function leerRelacionDeUI() {
  insp.relacion.equipo_usado = document.getElementById("rel-equipo").value;
  FASES.forEach(f => {
    insp.relacion.taps.forEach(tap => {
      const relEl = document.getElementById(`rel-${f}-${tap.pos}`);
      const excEl = document.getElementById(`exc-${f}-${tap.pos}`);
      tap.relacion[f] = parseFloat((relEl.value || "0").replace(",", ".")) || 0;
      tap.corriente_excitacion[f] = parseFloat((excEl.value || "0").replace(",", ".")) || 0;
    });
  });
}
function calcularRelacionUI() {
  leerDatosDeUI();
  leerRelacionDeUI();
  calcularRelacion(insp.relacion, insp.datos.tension_prim_vf, insp.datos.tension_sec_vf);
  insp.relacion.taps.forEach(tap => {
    document.getElementById(`ref-deriv-${tap.pos}`).textContent = fmt(tap.derivacion, 1);
    document.getElementById(`ref-vmin-${tap.pos}`).textContent = fmt(tap.valor_minimo, 4);
    document.getElementById(`ref-vmax-${tap.pos}`).textContent = fmt(tap.valor_maximo, 4);
    FASES.forEach(f => {
      const ok = tap.dentro_tolerancia[f];
      const el = document.getElementById(`est-${f}-${tap.pos}`);
      el.textContent = ok === null ? "—" : (ok ? "OK" : "FUERA");
      el.className = ok === null ? "estado-nd" : (ok ? "estado-ok" : "estado-bad");
    });
  });
  const diag = diagnosticoRelacion(insp.relacion);
  document.getElementById("diag-relacion").textContent = diag.join("\n\n");
  guardarEstado();
  toast("Prueba de relación calculada.");
}
function limpiarRelacionUI() {
  FASES.forEach(f => insp.relacion.taps.forEach(tap => { tap.relacion[f] = 0; tap.corriente_excitacion[f] = 0; }));
  buildRelacionUI();
  document.getElementById("diag-relacion").textContent = "Calcule la sección para ver el diagnóstico.";
  guardarEstado();
  toast("Sección de relación reiniciada.");
}
document.getElementById("btn-calc-relacion").addEventListener("click", calcularRelacionUI);
document.getElementById("btn-limpiar-relacion").addEventListener("click", limpiarRelacionUI);

// ---------------------------------------------------------------------------
// Sección 3: Resistencia de aislamiento
// ---------------------------------------------------------------------------
const SERIES_KEYS = ["prim_sec", "prim_tierra", "sec_tierra"];
const SERIES_LABELS = { prim_sec: "PRIM / SEC", prim_tierra: "PRIM / TIERRA", sec_tierra: "SEC / TIERRA" };

function buildAislamientoUI() {
  const cont = document.getElementById("aisl-series-container");
  cont.innerHTML = "";
  SERIES_KEYS.forEach(key => {
    const s = insp.aislamiento[key];
    const card = document.createElement("div");
    card.className = "serie-card";
    let cols = "";
    TIEMPOS_MIN.forEach(t => { cols += `<th>${t}</th>`; });
    let inputs = "";
    TIEMPOS_MIN.forEach(t => { inputs += `<td><input type="number" step="any" id="aisl-${key}-${t}" value="${s.lecturas[t] || ""}"></td>`; });
    let corr = "";
    TIEMPOS_MIN.forEach(t => { corr += `<td id="corr-${key}-${t}">—</td>`; });
    card.innerHTML = `
      <div class="serie-header">
        <strong>${SERIES_LABELS[key]}</strong>
        <label>Voltaje de prueba (V) <input type="number" step="any" id="volt-${key}" value="${s.voltaje_prueba || ""}"></label>
        <span class="dar-pi" id="dar-${key}">DAR: —</span>
        <span class="dar-pi" id="pi-${key}">PI: —</span>
      </div>
      <div class="table-wrap">
        <table class="tabla">
          <thead><tr><th>t (min)</th>${cols}</tr></thead>
          <tbody>
            <tr><td>Medido</td>${inputs}</tr>
            <tr><td>Corr. 20°C</td>${corr}</tr>
          </tbody>
        </table>
      </div>`;
    cont.appendChild(card);
  });
}
function leerAislamientoDeUI() {
  insp.aislamiento.equipo_usado = document.getElementById("aisl-equipo").value;
  insp.aislamiento.temperatura_equipo = parseFloat((document.getElementById("aisl-temp").value || "20").replace(",", ".")) || 20;
  SERIES_KEYS.forEach(key => {
    const s = insp.aislamiento[key];
    s.voltaje_prueba = parseFloat((document.getElementById(`volt-${key}`).value || "0").replace(",", ".")) || 0;
    TIEMPOS_MIN.forEach(t => {
      const el = document.getElementById(`aisl-${key}-${t}`);
      s.lecturas[t] = parseFloat((el.value || "0").replace(",", ".")) || 0;
    });
  });
}
function calcularAislamientoUI() {
  leerAislamientoDeUI();
  calcularAislamiento(insp.aislamiento);
  document.getElementById("aisl-factor").textContent = insp.aislamiento.factor_correccion !== null
    ? `Factor de corrección: ${fmt(insp.aislamiento.factor_correccion, 4)}`
    : "Factor de corrección: fuera de rango (20-80°C)";
  SERIES_KEYS.forEach(key => {
    const s = insp.aislamiento[key];
    TIEMPOS_MIN.forEach(t => {
      document.getElementById(`corr-${key}-${t}`).textContent = s.corregidas[t] ? fmt(s.corregidas[t], 1) : "—";
    });
    document.getElementById(`dar-${key}`).textContent = s.dar ? `DAR: ${fmt(s.dar, 3)} [${calificacionDAR(s.dar)}]` : "DAR: —";
    document.getElementById(`pi-${key}`).textContent = s.pi ? `PI: ${fmt(s.pi, 3)} [${calificacionPI(s.pi)}]` : "PI: —";
  });
  guardarEstado();
  toast("Prueba de resistencia de aislamiento calculada.");
}
function limpiarAislamientoUI() {
  SERIES_KEYS.forEach(key => {
    const s = insp.aislamiento[key];
    s.voltaje_prueba = 0;
    TIEMPOS_MIN.forEach(t => (s.lecturas[t] = 0));
  });
  buildAislamientoUI();
  document.getElementById("aisl-factor").textContent = "Factor de corrección: —";
  guardarEstado();
  toast("Sección de aislamiento reiniciada.");
}
document.getElementById("btn-calc-aislamiento").addEventListener("click", calcularAislamientoUI);
document.getElementById("btn-limpiar-aislamiento").addEventListener("click", limpiarAislamientoUI);

// ---------------------------------------------------------------------------
// Sección 4: Resistencia de devanados
// ---------------------------------------------------------------------------
function buildDevanadosUI() {
  const cont = document.getElementById("dev-container");
  cont.innerHTML = "";
  [["baja", "DEVANADO BAJA"], ["alta", "DEVANADO ALTA"]].forEach(([key, label]) => {
    const g = insp.devanados[key];
    const card = document.createElement("div");
    card.className = "dev-card";
    let rows = "";
    g.fases.forEach(f => {
      rows += `<tr>
        <td>${f.fase}</td>
        <td><input type="text" id="dev-${key}-${f.fase}-con" value="${f.conexion || ""}"></td>
        <td><input type="number" step="any" id="dev-${key}-${f.fase}-res" value="${f.resultado_ohm || ""}"></td>
      </tr>`;
    });
    card.innerHTML = `<h4>${label}</h4>
      <table><thead><tr><th>Fase</th><th>Conexión</th><th>Resultado (Ω)</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="result-box" id="dev-${key}-resumen">Promedio: —   Máx: —   Mín: —</div>
      <div class="dev-diag" id="dev-${key}-diag-desv">Desviación máx.: —</div>
      <div class="dev-diag" id="dev-${key}-diag-dif">Diferencia entre fases: —</div>`;
    cont.appendChild(card);
  });
}
function leerDevanadosDeUI() {
  insp.devanados.equipo_usado = document.getElementById("dev-equipo").value;
  ["baja", "alta"].forEach(key => {
    insp.devanados[key].fases.forEach(f => {
      f.conexion = document.getElementById(`dev-${key}-${f.fase}-con`).value;
      f.resultado_ohm = parseFloat((document.getElementById(`dev-${key}-${f.fase}-res`).value || "0").replace(",", ".")) || 0;
    });
  });
}
function calcularDevanadosUI() {
  leerDevanadosDeUI();
  calcularDevanados(insp.devanados);
  const colorClass = { OK: "estado-ok", Revisar: "estado-warn", "Fuera de rango": "estado-bad", "N/D": "estado-nd" };
  ["baja", "alta"].forEach(key => {
    const g = insp.devanados[key];
    document.getElementById(`dev-${key}-resumen`).textContent =
      `Promedio: ${fmt(g.promedio, 6)} Ω   Máx: ${fmt(g.maximo, 6)}   Mín: ${fmt(g.minimo, 6)}`;
    const dDesv = document.getElementById(`dev-${key}-diag-desv`);
    dDesv.textContent = diagnosticoDesviacion(g);
    dDesv.className = "dev-diag " + colorClass[clasificarDevanado(g.desviacion_max)];
    const dDif = document.getElementById(`dev-${key}-diag-dif`);
    dDif.textContent = diagnosticoDiferencia(g);
    dDif.className = "dev-diag " + colorClass[clasificarDevanado(g.diferencia_fases)];
  });
  guardarEstado();
  toast("Prueba de resistencia de devanados calculada.");
}
function limpiarDevanadosUI() {
  ["baja", "alta"].forEach(key => {
    insp.devanados[key].fases.forEach(f => { f.conexion = ""; f.resultado_ohm = 0; });
  });
  buildDevanadosUI();
  guardarEstado();
  toast("Sección de devanados reiniciada.");
}
document.getElementById("btn-calc-devanados").addEventListener("click", calcularDevanadosUI);
document.getElementById("btn-limpiar-devanados").addEventListener("click", limpiarDevanadosUI);

// ---------------------------------------------------------------------------
// Sección 5: Rigidez dieléctrica
// ---------------------------------------------------------------------------
function buildDielectricaUI() {
  document.getElementById("diel-equipo").value = insp.dielectrica.equipo_usado || "";
  document.getElementById("diel-metodo").value = insp.dielectrica.metodo;
  const row = document.getElementById("diel-inputs-row");
  row.innerHTML = "<td>V. ruptura (kV)</td>";
  insp.dielectrica.lecturas.forEach((v, i) => {
    const td = document.createElement("td");
    td.innerHTML = `<input type="number" step="any" id="diel-${i}" value="${v || ""}">`;
    row.appendChild(td);
  });
}
function leerDielectricaDeUI() {
  insp.dielectrica.equipo_usado = document.getElementById("diel-equipo").value;
  insp.dielectrica.metodo = document.getElementById("diel-metodo").value;
  insp.dielectrica.lecturas = insp.dielectrica.lecturas.map((_, i) =>
    parseFloat((document.getElementById(`diel-${i}`).value || "0").replace(",", ".")) || 0);
}
function calcularDielectricaUI() {
  leerDielectricaDeUI();
  calcularDielectrica(insp.dielectrica);
  const di = insp.dielectrica;
  document.getElementById("diel-resumen").textContent =
    `Promedio: ${di.promedio !== null ? fmt(di.promedio, 2) + " kV" : "—"}   ` +
    `Rango: ${di.rango !== null ? fmt(di.rango, 2) + " kV" : "—"}   ` +
    `Límite mínimo: ${di.limite_minimo !== null ? fmt(di.limite_minimo, 1) + " kV" : "—"}`;
  const resEl = document.getElementById("diel-resultado");
  if (di.cumple === null) { resEl.textContent = "Resultado: —"; resEl.className = "result-box"; }
  else if (di.cumple) { resEl.textContent = "Resultado: CUMPLE"; resEl.className = "result-box estado-ok"; }
  else { resEl.textContent = "Resultado: NO CUMPLE"; resEl.className = "result-box estado-bad"; }
  guardarEstado();
  toast("Prueba de rigidez dieléctrica calculada.");
}
function limpiarDielectricaUI() {
  insp.dielectrica.lecturas = insp.dielectrica.lecturas.map(() => 0);
  buildDielectricaUI();
  document.getElementById("diel-resumen").textContent = "Promedio: —   Rango: —   Límite mínimo: —";
  document.getElementById("diel-resultado").textContent = "Resultado: —";
  document.getElementById("diel-resultado").className = "result-box";
  guardarEstado();
  toast("Sección de rigidez dieléctrica reiniciada.");
}
document.getElementById("btn-calc-dielectrica").addEventListener("click", calcularDielectricaUI);
document.getElementById("btn-limpiar-dielectrica").addEventListener("click", limpiarDielectricaUI);

// ---------------------------------------------------------------------------
// Sección 6: Observaciones
// ---------------------------------------------------------------------------
document.getElementById("btn-guardar-obs").addEventListener("click", () => {
  insp.observaciones.texto = document.getElementById("obs-texto").value;
  guardarEstado();
  toast("Observaciones guardadas.");
});

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
function renderResumen() {
  const cont = document.getElementById("resumen-container");
  const d = insp.datos;
  let html = "";

  html += `<div class="resumen-section"><h3>Semáforo de estado</h3>`;
  const colorMap = { OK: "#2E7D32", Excelente: "#2E7D32", Buena: "#2E7D32", Revisar: "#F9A825",
    Cuestionable: "#F9A825", "Fuera de rango": "#C62828", "Pobre / riesgo": "#C62828", "Sin datos": "#9E9E9E" };
  estadoResumenGeneral(insp).forEach(([nombre, estado]) => {
    html += `<div class="semaforo-row"><span class="semaforo-dot" style="background:${colorMap[estado]}"></span>
      <span class="semaforo-nombre">${nombre}</span><span class="semaforo-estado" style="color:${colorMap[estado]}">${estado}</span></div>`;
  });
  html += `</div>`;

  html += `<div class="resumen-section"><h3>Datos del transformador</h3>
    <p>Fabricante: ${d.fabricante || "-"} &nbsp; Serial: ${d.serial || "-"} &nbsp; Cliente: ${d.cliente || "-"}<br>
    Potencia: ${fmt(d.potencia_kva, 2)} kVA &nbsp; Frecuencia: ${fmt(d.frecuencia, 2)} Hz &nbsp;
    Tipo: ${d.tipo || "-"} &nbsp; Grupo: ${d.grupo_conexion || "-"} &nbsp; Aislante: ${d.liquido_aislante || "-"}<br>
    VL prim/sec: ${fmt(d.tension_prim_vl, 1)}/${fmt(d.tension_sec_vl, 1)} V &nbsp;
    VF prim/sec: ${fmt(d.tension_prim_vf, 1)}/${fmt(d.tension_sec_vf, 1)} V &nbsp;
    Ip: ${fmt(corrientePrimaria(d), 3)} A &nbsp; Is: ${fmt(corrienteSecundaria(d), 3)} A</p></div>`;

  html += `<div class="resumen-section"><h3>Relación de transformación</h3><div class="table-wrap"><table>
    <thead><tr><th>POS</th><th>Deriv.</th><th>V.mín</th><th>V.máx</th>
    <th>Rel.A</th><th>Iexc.A</th><th>Est.A</th><th>Rel.B</th><th>Iexc.B</th><th>Est.B</th>
    <th>Rel.C</th><th>Iexc.C</th><th>Est.C</th></tr></thead><tbody>`;
  insp.relacion.taps.forEach(t => {
    html += `<tr><td>${t.pos}</td><td>${fmt(t.derivacion, 1)}</td><td>${fmt(t.valor_minimo, 4)}</td><td>${fmt(t.valor_maximo, 4)}</td>`;
    FASES.forEach(f => {
      const ok = t.dentro_tolerancia[f];
      const est = ok === null ? "N/D" : (ok ? "OK" : "FUERA");
      html += `<td>${fmt(t.relacion[f], 4)}</td><td>${fmt(t.corriente_excitacion[f], 4)}</td><td>${est}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div></div>`;

  html += `<div class="resumen-section"><h3>Resistencia de aislamiento</h3>
    <p>Temp.: ${fmt(insp.aislamiento.temperatura_equipo, 1)} °C &nbsp; Factor corr.: ${fmt(insp.aislamiento.factor_correccion, 4)}</p>
    <div class="table-wrap"><table><thead><tr><th>Serie</th><th>t0.5</th><th>t1</th><th>t10</th><th>DAR</th><th>Calif.DAR</th><th>PI</th><th>Calif.PI</th></tr></thead><tbody>`;
  seriesAislamiento(insp.aislamiento).forEach(s => {
    html += `<tr><td>${s.nombre}</td><td>${fmt(s.lecturas[0.5], 1)}</td><td>${fmt(s.lecturas[1], 1)}</td>
      <td>${fmt(s.lecturas[10], 1)}</td><td>${fmt(s.dar, 3)}</td><td>${calificacionDAR(s.dar)}</td>
      <td>${fmt(s.pi, 3)}</td><td>${calificacionPI(s.pi)}</td></tr>`;
  });
  html += `</tbody></table></div></div>`;

  html += `<div class="resumen-section"><h3>Resistencia de devanados</h3><div class="table-wrap"><table>
    <thead><tr><th>Devanado</th><th>F1(Ω)</th><th>F2(Ω)</th><th>F3(Ω)</th><th>Promedio</th><th>Desv.máx</th><th>Dif.fases</th></tr></thead><tbody>`;
  [insp.devanados.baja, insp.devanados.alta].forEach(g => {
    html += `<tr><td>${g.nombre}</td>${g.fases.map(f => `<td>${fmt(f.resultado_ohm, 6)}</td>`).join("")}
      <td>${fmt(g.promedio, 6)}</td>
      <td>${g.desviacion_max !== null ? (g.desviacion_max * 100).toFixed(2) + "%" : "N/D"}</td>
      <td>${g.diferencia_fases !== null ? (g.diferencia_fases * 100).toFixed(2) + "%" : "N/D"}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  [insp.devanados.baja, insp.devanados.alta].forEach(g => {
    if (g.desviacion_max === null && g.diferencia_fases === null) return;
    html += `<p>Devanado ${g.nombre.toUpperCase()} — ${diagnosticoDesviacion(g)}</p>`;
    html += `<p>Devanado ${g.nombre.toUpperCase()} — ${diagnosticoDiferencia(g)}</p>`;
  });
  html += `</div>`;

  const di = insp.dielectrica;
  const cumple = di.cumple === null ? "N/D" : (di.cumple ? "CUMPLE" : "NO CUMPLE");
  html += `<div class="resumen-section"><h3>Rigidez dieléctrica</h3>
    <p>Método: ${di.metodo}<br>Lecturas: ${di.lecturas.map(v => fmt(v, 1)).join(", ")} kV<br>
    Promedio: ${fmt(di.promedio, 2)} kV &nbsp; Límite: ${fmt(di.limite_minimo, 1)} kV &nbsp; Resultado: ${cumple}</p></div>`;

  html += `<div class="resumen-section"><h3>Observaciones</h3><p>${(insp.observaciones.texto || "(sin observaciones)").replace(/\n/g, "<br>")}</p></div>`;

  html += `<div class="resumen-section"><h3>Sugerencia de diagnóstico general</h3>
    <p class="diag-note">Interpretación consolidada de las 4 pruebas, con base en IEEE Std C57.12.90, IEEE Std C57.12.00,
    guías CIGRE de diagnóstico/mantenimiento de transformadores y ASTM D877/D1816. No sustituye el criterio del ingeniero responsable.</p>
    <div class="diag-list">`;
  diagnosticoGeneral(insp).forEach(m => { html += `<p>• ${m}</p>`; });
  html += `</div></div>`;

  cont.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------
function renderGraficos() {
  chartRatio("chart-relacion-linea", "chart-relacion-barra", insp.relacion);
  chartInsulation("chart-aisl-curva", "chart-aisl-barra", insp.aislamiento);
  chartWindings("chart-dev-baja", "chart-dev-alta", insp.devanados);
  chartDielectric("chart-dielectrica", insp.dielectrica);
}
document.getElementById("btn-actualizar-graficos").addEventListener("click", renderGraficos);

// ---------------------------------------------------------------------------
// Recalcular todo / Exportar / Nuevo
// ---------------------------------------------------------------------------
function recalcularTodo() {
  calcularDatos();
  calcularRelacionUI();
  calcularAislamientoUI();
  calcularDevanadosUI();
  calcularDielectricaUI();
  insp.observaciones.texto = document.getElementById("obs-texto").value;
  guardarEstado();
  toast("Todas las secciones fueron recalculadas.");
}
document.getElementById("btn-recalcular-todo").addEventListener("click", recalcularTodo);

document.getElementById("btn-exportar-pdf").addEventListener("click", async () => {
  recalcularTodo();
  // Los gráficos deben existir en el DOM (con datos) para poder capturarlos como imagen
  renderGraficos();
  await new Promise(r => setTimeout(r, 150)); // esperar un frame para que Chart.js pinte
  try {
    await exportarPDF(insp);
    toast("PDF exportado.");
  } catch (e) {
    console.error(e);
    toast("Error al exportar PDF: " + e.message);
  }
});

document.getElementById("btn-exportar-txt").addEventListener("click", () => {
  recalcularTodo();
  try {
    exportarTXT(insp);
    toast("TXT exportado.");
  } catch (e) {
    console.error(e);
    toast("Error al exportar TXT: " + e.message);
  }
});

document.getElementById("btn-nuevo").addEventListener("click", () => {
  if (!confirm("¿Borrar todos los datos e iniciar un nuevo expediente? Esta acción no se puede deshacer.")) return;
  localStorage.removeItem(STORAGE_KEY);
  insp = nuevaInspeccion();
  inicializarUI();
  toast("Nuevo expediente iniciado.");
});

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
function inicializarUI() {
  cargarDatosEnUI();
  buildRelacionUI();
  buildAislamientoUI();
  buildDevanadosUI();
  buildDielectricaUI();
  document.getElementById("obs-texto").value = insp.observaciones.texto || "";
  document.getElementById("diag-relacion").textContent = "Calcule la sección para ver el diagnóstico.";
  document.getElementById("datos-resultado").innerHTML = "Corriente primaria: —<br>Corriente secundaria: —";
  document.getElementById("aisl-factor").textContent = "Factor de corrección: —";
  document.getElementById("diel-resumen").textContent = "Promedio: —   Rango: —   Límite mínimo: —";
  document.getElementById("diel-resultado").textContent = "Resultado: —";
  document.getElementById("diel-resultado").className = "result-box";
}

inicializarUI();

// Si había datos guardados de una sesión anterior, recalcular todo para
// que las tablas de estado/derivación/DAR/PI se vean pobladas de inmediato.
if (localStorage.getItem(STORAGE_KEY)) {
  try { recalcularTodo(); } catch (e) { /* datos incompletos: no pasa nada */ }
}

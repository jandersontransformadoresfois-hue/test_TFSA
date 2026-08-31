/* ============================================================================
 * pdf-export.js — genera el informe PDF con jsPDF + jspdf-autotable
 * ==========================================================================*/

async function exportarPDF(insp) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const marginX = 14;
  let y = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Los fuentes estándar de jsPDF (Helvetica, WinAnsiEncoding) no incluyen
  // los caracteres ≤ y → fuera del rango Latin-1; se reemplazan por
  // equivalentes ASCII seguros solo para el PDF (la UI y el TXT sí
  // muestran los símbolos originales, que renderizan bien en esos casos).
  function sanitize(texto) {
    if (texto === null || texto === undefined) return texto;
    return String(texto).replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/→/g, "->");
  }

  function ensureSpace(h) {
    if (y + h > pageHeight - 14) {
      doc.addPage();
      y = 16;
    }
  }

  function titulo(texto) {
    ensureSpace(12);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text(sanitize(texto), pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setFont(undefined, "normal");
  }
  function subtitulo(texto) {
    ensureSpace(9);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(sanitize(texto), pageWidth / 2, y, { align: "center" });
    y += 8;
    doc.setTextColor(0);
  }
  function h2(texto) {
    ensureSpace(10);
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.setTextColor(21, 101, 192);
    doc.text(sanitize(texto), marginX, y);
    y += 6;
    doc.setTextColor(0);
    doc.setFont(undefined, "normal");
  }
  function nota(texto) {
    ensureSpace(10);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    const lines = doc.splitTextToSize(sanitize(texto), pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 3.2 + 2;
    doc.setTextColor(0);
  }
  function bullet(texto) {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize("• " + sanitize(texto), pageWidth - marginX * 2);
    ensureSpace(lines.length * 4.2 + 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4.2 + 2;
  }
  function tabla(head, body, opts = {}) {
    const headS = head.map(sanitize);
    const bodyS = body.map(row => row.map(sanitize));
    doc.autoTable({
      head: [headS], body: bodyS, startY: y, margin: { left: marginX, right: marginX },
      styles: { fontSize: 7.5, cellPadding: 1.4, halign: "center" },
      headStyles: { fillColor: [21, 101, 192], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [242, 246, 252] },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 4;
  }
  function figura(canvasId, widthMm = pageWidth - marginX * 2, ratio = 0.46) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const imgData = canvas.toDataURL("image/png", 1.0);
    const h = widthMm * ratio;
    ensureSpace(h + 4);
    doc.addImage(imgData, "PNG", marginX, y, widthMm, h);
    y += h + 4;
  }

  // ---------- Portada ----------
  titulo("INFORME DE INSPECCIÓN DE TRANSFORMADOR");
  subtitulo("Generado: " + new Date().toLocaleString("es"));

  // Panel resumen (semáforo) como tabla simple
  const filas = estadoResumenGeneral(insp);
  const colorEstado = { OK: [46, 125, 50], Excelente: [46, 125, 50], Buena: [46, 125, 50], Revisar: [249, 168, 37], Cuestionable: [249, 168, 37], "Fuera de rango": [198, 40, 40], "Pobre / riesgo": [198, 40, 40], "Sin datos": [158, 158, 158] };
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Resumen de estado por prueba", pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFont(undefined, "normal");
  doc.setFontSize(9.5);
  for (const [nombre, estado] of filas) {
    const c = colorEstado[estado] || [0, 0, 0];
    doc.setFillColor(...c);
    doc.circle(marginX + 2, y - 1.2, 1.6, "F");
    doc.setTextColor(0);
    doc.text(nombre, marginX + 8, y);
    doc.setTextColor(...c);
    doc.setFont(undefined, "bold");
    doc.text(estado, pageWidth - marginX - 30, y);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0);
    y += 6;
  }
  y += 2;

  // ---------- Sección 1 ----------
  const d = insp.datos;
  h2("DATOS DEL TRANSFORMADOR");
  const ip = corrientePrimaria(d), isec = corrienteSecundaria(d);
  tabla(["Campo", "Valor", "Campo", "Valor"], [
    ["Fabricante", d.fabricante, "Cliente", d.cliente],
    ["Serial", d.serial, "Fecha de fabricación", d.fecha_fab],
    ["Potencia (kVA)", fmt(d.potencia_kva, 2), "Frecuencia (Hz)", fmt(d.frecuencia, 2)],
    ["Tensión prim. VL (V)", fmt(d.tension_prim_vl, 2), "Tensión prim. VF (V)", fmt(d.tension_prim_vf, 2)],
    ["Tensión sec. VL (V)", fmt(d.tension_sec_vl, 2), "Tensión sec. VF (V)", fmt(d.tension_sec_vf, 2)],
    ["Corriente primaria (A)", fmt(ip, 3), "Corriente secundaria (A)", fmt(isec, 3)],
    ["Tipo", d.tipo, "Grupo de conexión", d.grupo_conexion],
    ["Líquido aislante", d.liquido_aislante, "", ""],
  ], { styles: { halign: "left", fontSize: 8 } });

  // ---------- Sección 2 ----------
  h2("PRUEBA DE RELACIÓN DE TRANSFORMACIÓN");
  doc.setFontSize(9);
  doc.text("Equipo usado: " + (insp.relacion.equipo_usado || "-"), marginX, y);
  y += 5;
  tabla(["POS", "Derivación (V)", "V.mín", "V.máx"],
    insp.relacion.taps.map(t => [t.pos, fmt(t.derivacion, 1), fmt(t.valor_minimo, 4), fmt(t.valor_maximo, 4)]));
  for (const f of FASES) {
    tabla(["POS", `Relación Fase ${f}`, `I.excit. Fase ${f}`, "Estado"],
      insp.relacion.taps.map(t => {
        const ok = t.dentro_tolerancia[f];
        const estado = ok === null ? "N/D" : (ok ? "OK" : "FUERA");
        return [t.pos, fmt(t.relacion[f], 4), fmt(t.corriente_excitacion[f], 4), estado];
      }));
  }
  nota("Criterio de aceptación: tolerancia ±0.5% sobre la relación nominal, evaluada de forma independiente en cada fase (A, B, C), según IEEE Std C57.12.90.");
  figura("chart-relacion-linea", (pageWidth - marginX * 2));
  figura("chart-relacion-barra", (pageWidth - marginX * 2));
  for (const m of diagnosticoRelacion(insp.relacion)) bullet(m);

  doc.addPage(); y = 16;

  // ---------- Sección 3 ----------
  const a = insp.aislamiento;
  h2("PRUEBA RESISTENCIA DE AISLAMIENTO");
  doc.setFontSize(9);
  doc.text(`Equipo: ${a.equipo_usado || "-"}   Temp.: ${fmt(a.temperatura_equipo, 1)} °C   Factor corr.: ${fmt(a.factor_correccion, 4)}`, marginX, y);
  y += 5;
  for (const s of seriesAislamiento(a)) {
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text(`${s.nombre} — V.prueba: ${fmt(s.voltaje_prueba, 0)} V   DAR=${fmt(s.dar, 3)} [${calificacionDAR(s.dar)}]   PI=${fmt(s.pi, 3)} [${calificacionPI(s.pi)}]`, marginX, y);
    doc.setFont(undefined, "normal");
    y += 4;
    tabla(["t(min)", ...TIEMPOS_MIN.map(String)], [
      ["Medido", ...TIEMPOS_MIN.map(t => fmt(s.lecturas[t], 1))],
      ["Corr.20°C", ...TIEMPOS_MIN.map(t => fmt(s.corregidas[t], 1))],
    ]);
  }
  nota("Criterios PI/DAR de referencia general asociados a IEEE Std 43, usualmente referenciado en conjunto con IEEE C57.12.90.");
  figura("chart-aisl-curva", pageWidth - marginX * 2);
  figura("chart-aisl-barra", pageWidth - marginX * 2);
  for (const m of diagnosticoAislamiento(a)) bullet(m);

  doc.addPage(); y = 16;

  // ---------- Sección 4 ----------
  const dv = insp.devanados;
  h2("PRUEBA DE RESISTENCIA DE DEVANADOS");
  doc.setFontSize(9);
  doc.text("Equipo usado: " + (dv.equipo_usado || "-"), marginX, y);
  y += 5;
  for (const grupo of [dv.baja, dv.alta]) {
    tabla(["Devanado", "Fase", "Conexión", "Resultado (Ω)"],
      grupo.fases.map(f => [grupo.nombre, f.fase, f.conexion || "-", fmt(f.resultado_ohm, 6)]));
    doc.setFontSize(8.5);
    doc.text(`Promedio: ${fmt(grupo.promedio, 6)} Ω   Máx: ${fmt(grupo.maximo, 6)}   Mín: ${fmt(grupo.minimo, 6)}`, marginX, y);
    y += 5;
  }
  figura("chart-dev-baja", (pageWidth - marginX * 2 - 4) / 2, 0.75);
  figura("chart-dev-alta", (pageWidth - marginX * 2 - 4) / 2, 0.75);
  nota("Criterio de referencia de campo / guías CIGRE: diferencia entre fases ≤2% → OK; ≤5% → revisar; superior → fuera de rango.");
  for (const m of diagnosticoDevanados(dv)) bullet(m);

  doc.addPage(); y = 16;

  // ---------- Sección 5 ----------
  const di = insp.dielectrica;
  h2("PRUEBA DE RIGIDEZ DIELÉCTRICA");
  doc.setFontSize(9);
  doc.text(`Equipo: ${di.equipo_usado || "-"}   Método: ${di.metodo}`, marginX, y);
  y += 5;
  tabla(["Ensayo", ...di.lecturas.map((_, i) => String(i + 1)), "Promedio", "Rango"],
    [["V.ruptura (kV)", ...di.lecturas.map(v => fmt(v, 1)), fmt(di.promedio, 2), fmt(di.rango, 2)]]);
  const cumple = di.cumple === null ? "N/D" : (di.cumple ? "CUMPLE" : "NO CUMPLE");
  doc.setFontSize(9);
  doc.text(`Límite mínimo (${di.metodo}): ${fmt(di.limite_minimo, 1)} kV   Resultado: ${cumple}`, marginX, y);
  y += 6;
  figura("chart-dielectrica", (pageWidth - marginX * 2) * 0.75);
  nota("Límites de referencia según ASTM D877 / ASTM D1816 para tensión de ruptura dieléctrica de aceite aislante.");
  for (const m of diagnosticoDielectrica(di)) bullet(m);

  // ---------- Diagnóstico general ----------
  doc.addPage(); y = 16;
  h2("SUGERENCIA DE DIAGNÓSTICO GENERAL");
  doc.setFontSize(9);
  const introLines = doc.splitTextToSize(
    "Interpretación consolidada de los resultados de las 4 pruebas, con base en IEEE Std C57.12.90, " +
    "IEEE Std C57.12.00, guías CIGRE de diagnóstico/mantenimiento de transformadores y ASTM D877/D1816.",
    pageWidth - marginX * 2);
  doc.text(introLines, marginX, y);
  y += introLines.length * 4.2 + 3;
  for (const m of diagnosticoGeneral(insp)) bullet(m);

  // ---------- Observaciones ----------
  ensureSpace(20);
  h2("OBSERVACIONES");
  doc.setFontSize(9);
  const obsLines = doc.splitTextToSize(insp.observaciones.texto || "(sin observaciones)", pageWidth - marginX * 2);
  doc.text(obsLines, marginX, y);
  y += obsLines.length * 4.2 + 6;

  nota("Nota: los criterios de aceptación mostrados son valores de referencia general basados en IEEE Std C57.12.90, " +
    "IEEE Std C57.12.00, guías CIGRE de diagnóstico y ASTM D877/D1816. No sustituyen el criterio profesional del " +
    "ingeniero responsable ni los requisitos contractuales/normativos específicos del proyecto.");

  const nombre = `Inspeccion_${d.serial || "transformador"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nombre);
}

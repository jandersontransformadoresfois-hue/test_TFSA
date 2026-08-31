/* ============================================================================
 * txt-export.js — exporta el expediente completo a texto plano (.txt)
 * ==========================================================================*/

function buildTxt(insp) {
  const L = [];
  const push = (s = "") => L.push(s);
  const pad = (s, n) => String(s).padEnd(n);
  const padStart = (s, n) => String(s).padStart(n);

  push("=".repeat(78));
  push("INFORME DE INSPECCIÓN DE TRANSFORMADOR".padStart(58).padEnd(78));
  push(("Generado: " + new Date().toLocaleString("es")).padStart(50).padEnd(78));
  push("=".repeat(78));
  push("");

  const d = insp.datos;
  push("DATOS DEL TRANSFORMADOR");
  push("-".repeat(78));
  push(`${pad("Fabricante", 28)}: ${d.fabricante}`);
  push(`${pad("Potencia (kVA)", 28)}: ${fmt(d.potencia_kva, 2)}`);
  push(`${pad("Serial", 28)}: ${d.serial}`);
  push(`${pad("Cliente", 28)}: ${d.cliente}`);
  push(`${pad("Fecha de fabricación", 28)}: ${d.fecha_fab}`);
  push(`${pad("Frecuencia (Hz)", 28)}: ${fmt(d.frecuencia, 2)}`);
  push(`${pad("Tensión primaria VL (V)", 28)}: ${fmt(d.tension_prim_vl, 2)}`);
  push(`${pad("Tensión primaria VF (V)", 28)}: ${fmt(d.tension_prim_vf, 2)}`);
  push(`${pad("Tensión secundaria VL (V)", 28)}: ${fmt(d.tension_sec_vl, 2)}`);
  push(`${pad("Tensión secundaria VF (V)", 28)}: ${fmt(d.tension_sec_vf, 2)}`);
  push(`${pad("Corriente primaria (A)", 28)}: ${fmt(corrientePrimaria(d), 3)}`);
  push(`${pad("Corriente secundaria (A)", 28)}: ${fmt(corrienteSecundaria(d), 3)}`);
  push(`${pad("Tipo", 28)}: ${d.tipo}`);
  push(`${pad("Grupo de conexión", 28)}: ${d.grupo_conexion}`);
  push(`${pad("Líquido aislante", 28)}: ${d.liquido_aislante}`);
  push("");

  push("PRUEBA DE RELACIÓN DE TRANSFORMACIÓN");
  push("-".repeat(78));
  push(`Equipo usado: ${insp.relacion.equipo_usado}`);
  push(`${padStart("POS", 4)} ${padStart("Derivación", 12)} ${padStart("V.mín", 10)} ${padStart("V.máx", 10)}`);
  for (const t of insp.relacion.taps) {
    push(`${padStart(t.pos, 4)} ${padStart(fmt(t.derivacion, 2), 12)} ${padStart(fmt(t.valor_minimo, 4), 10)} ${padStart(fmt(t.valor_maximo, 4), 10)}`);
  }
  push("");
  for (const fase of FASES) {
    push(`  Fase ${fase}:`);
    push(`    ${padStart("POS", 4)} ${padStart("Relación", 10)} ${padStart("I.excit.", 10)} ${padStart("Estado", 12)}`);
    for (const t of insp.relacion.taps) {
      const ok = t.dentro_tolerancia[fase];
      const estado = ok === null ? "N/D" : (ok ? "OK" : "FUERA RANGO");
      push(`    ${padStart(t.pos, 4)} ${padStart(fmt(t.relacion[fase], 4), 10)} ${padStart(fmt(t.corriente_excitacion[fase], 4), 10)} ${padStart(estado, 12)}`);
    }
  }
  push("");
  push("Criterio: tolerancia ±0.5% sobre la relación nominal, evaluada por fase (IEEE Std C57.12.90).");
  push("");
  push("Diagnóstico:");
  diagnosticoRelacion(insp.relacion).forEach(m => push("  - " + m));
  push("");

  const a = insp.aislamiento;
  push("PRUEBA RESISTENCIA DE AISLAMIENTO");
  push("-".repeat(78));
  push(`Equipo usado: ${a.equipo_usado}`);
  push(`Temperatura del equipo: ${fmt(a.temperatura_equipo, 1)} °C   Factor de corrección a 20°C: ${fmt(a.factor_correccion, 4)}`);
  push("");
  for (const s of seriesAislamiento(a)) {
    push(`  [${s.nombre}]  Voltaje de prueba: ${fmt(s.voltaje_prueba, 0)} V`);
    push(`    ${padStart("t(min)", 8)}` + TIEMPOS_MIN.map(t => padStart(t, 9)).join(""));
    push(`    ${padStart("Medido", 8)}` + TIEMPOS_MIN.map(t => padStart(fmt(s.lecturas[t], 1), 9)).join(""));
    push(`    ${padStart("Corr20C", 8)}` + TIEMPOS_MIN.map(t => padStart(fmt(s.corregidas[t], 1), 9)).join(""));
    push(`    DAR (t1/t0.5): ${fmt(s.dar, 3)} [${calificacionDAR(s.dar)}]   PI (t10/t1): ${fmt(s.pi, 3)} [${calificacionPI(s.pi)}]`);
    push("");
  }
  push("Criterios PI/DAR de referencia general asociados a IEEE Std 43, usualmente referenciado junto a C57.12.90.");
  push("Diagnóstico:");
  diagnosticoAislamiento(a).forEach(m => push("  - " + m));
  push("");

  const dv = insp.devanados;
  push("PRUEBA DE RESISTENCIA DE DEVANADOS");
  push("-".repeat(78));
  push(`Equipo usado: ${dv.equipo_usado}`);
  for (const grupo of [dv.baja, dv.alta]) {
    push(`  Devanado ${grupo.nombre.toUpperCase()}`);
    for (const f of grupo.fases) {
      push(`    Fase ${f.fase}  conexión=${pad(f.conexion || "-", 10)}  resultado=${fmt(f.resultado_ohm, 6)} Ω`);
    }
    push(`    Promedio=${fmt(grupo.promedio, 6)} Ω  Máximo=${fmt(grupo.maximo, 6)}  Mínimo=${fmt(grupo.minimo, 6)}`);
    const desv = grupo.desviacion_max === null ? "N/D" : (grupo.desviacion_max * 100).toFixed(2) + "%";
    const dif = grupo.diferencia_fases === null ? "N/D" : (grupo.diferencia_fases * 100).toFixed(2) + "%";
    push(`    Desviación máx. vs. promedio=${desv}   Diferencia entre fases=${dif}`);
    push("");
  }
  push(`Criterio de referencia de campo / guías CIGRE: diferencia entre fases ≤ ${(CONFIG.winding_dev_alert * 100).toFixed(0)}% -> OK; ≤ ${(CONFIG.winding_dev_fail * 100).toFixed(0)}% -> revisar; superior -> fuera de rango.`);
  push("Diagnóstico (desviación máxima y diferencia entre fases vs. CIGRE):");
  diagnosticoDevanados(dv).forEach(m => push("  - " + m));
  push("");

  const di = insp.dielectrica;
  push("PRUEBA DE RIGIDEZ DIELÉCTRICA");
  push("-".repeat(78));
  push(`Equipo usado: ${di.equipo_usado}`);
  push(`Método: ${di.metodo}`);
  push("Lecturas (kV): " + di.lecturas.map(v => fmt(v, 1)).join(", "));
  push(`Promedio: ${fmt(di.promedio, 2)} kV   Rango: ${fmt(di.rango, 2)} kV   Límite mínimo (${di.metodo.split(" - ")[0]}): ${fmt(di.limite_minimo, 1)} kV`);
  const cumple = di.cumple === null ? "N/D" : (di.cumple ? "CUMPLE" : "NO CUMPLE");
  push(`Resultado: ${cumple}`);
  push("Diagnóstico:");
  diagnosticoDielectrica(di).forEach(m => push("  - " + m));
  push("");

  push("SUGERENCIA DE DIAGNÓSTICO GENERAL");
  push("-".repeat(78));
  push("Interpretación consolidada de las 4 pruebas, con base en IEEE Std C57.12.90, IEEE Std C57.12.00, guías CIGRE de diagnóstico/mantenimiento de transformadores y ASTM D877/D1816.");
  diagnosticoGeneral(insp).forEach(m => push("  - " + m));
  push("");

  push("OBSERVACIONES");
  push("-".repeat(78));
  push(insp.observaciones.texto || "(sin observaciones)");
  push("");
  push("=".repeat(78));

  return L.join("\n");
}

function exportarTXT(insp) {
  const text = buildTxt(insp);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nombre = `Inspeccion_${insp.datos.serial || "transformador"}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

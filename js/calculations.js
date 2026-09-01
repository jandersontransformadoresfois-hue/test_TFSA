/* ============================================================================
 * calculations.js
 * ----------------------------------------------------------------------------
 * Puerto a JavaScript de calculations.py (misma lógica, mismas fórmulas y
 * mismos criterios de referencia normativa):
 *   - IEEE Std C57.12.90 / C57.12.00
 *   - IEEE Std 43 (PI / DAR)
 *   - Guías CIGRE de diagnóstico y mantenimiento de transformadores
 *   - ASTM D877 / ASTM D1816
 * ==========================================================================*/

const FASES = ["A", "B", "C"];
const TIEMPOS_MIN = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ---------------------------------------------------------------------------
// Tabla de factor de corrección de resistencia de aislamiento a 20°C
// ---------------------------------------------------------------------------
const CORRECTION_FACTOR_20C = {
  20: 1.0, 21: 1.059, 22: 1.1461, 23: 1.228, 24: 1.3158, 25: 1.4,
  26: 1.5107, 27: 1.6187, 28: 1.7345, 29: 1.8585, 30: 1.98,
  31: 2.1337, 32: 2.2863, 33: 2.4498, 34: 2.6249, 35: 2.8,
  36: 3.0137, 37: 3.2292, 38: 3.4601, 39: 3.7007, 40: 3.95,
  41: 4.2566, 42: 4.561, 43: 4.9871, 44: 5.2365, 45: 5.6,
  46: 6.0121, 47: 6.442, 48: 6.9025, 49: 7.3961, 50: 7.85,
  51: 8.4916, 52: 9.0987, 53: 9.7492, 54: 10.4463, 55: 11.2,
  56: 11.9935, 57: 12.8511, 58: 13.7699, 59: 14.7544, 60: 15.85,
  61: 16.9397, 62: 18.1509, 63: 19.4487, 64: 20.8392, 65: 22.4,
  66: 23.9285, 67: 25.6364, 68: 27.4694, 69: 29.4335, 70: 31.75,
  71: 33.7929, 72: 36.209, 73: 38.7979, 74: 41.572, 75: 44.7,
  76: 48.73, 77: 52.2, 78: 56.0, 79: 59.6, 80: 63.75,
};

function correctionFactor(tempC) {
  if (tempC === null || tempC === undefined || isNaN(tempC)) return null;
  if (tempC < 20 || tempC > 80) return null;
  const lo = Math.floor(tempC);
  const hi = Math.ceil(tempC);
  if (lo === hi) return CORRECTION_FACTOR_20C[lo];
  const fLo = CORRECTION_FACTOR_20C[lo];
  const fHi = CORRECTION_FACTOR_20C[hi];
  const frac = tempC - lo;
  return fLo + (fHi - fLo) * frac;
}

// ---------------------------------------------------------------------------
// CONFIG: umbrales de aceptación (editables)
// ---------------------------------------------------------------------------
const CONFIG = {
  ratio_tolerance: 0.005, // ±0.5 %
  excitation_current_asymmetry_max: 0.30, // 30 %

  pi_excellent: 4.0,
  pi_good: 2.0,
  pi_questionable: 1.0,
  dar_good: 1.6,
  dar_acceptable: 1.25,

  winding_dev_alert: 0.02, // 2 %
  winding_dev_fail: 0.05,  // 5 %

  dielectric_limits: {
    "ASTM D877 (gap 2.54 mm) - aceite nuevo": 30.0,
    "ASTM D877 (gap 2.54 mm) - aceite en servicio": 23.0,
    "ASTM D1816 (gap 1 mm) - aceite en servicio": 20.0,
    "ASTM D1816 (gap 2 mm) - aceite en servicio": 28.0,
  },
};

function fmt(v, nd = 3) {
  if (v === null || v === undefined || isNaN(v)) return "N/D";
  return Number(v).toLocaleString("es", { minimumFractionDigits: nd, maximumFractionDigits: nd });
}

// ---------------------------------------------------------------------------
// Sección 1: Datos del transformador
// ---------------------------------------------------------------------------
function nuevoDatos() {
  return {
    fabricante: "", potencia_kva: 0, serial: "", cliente: "", fecha_fab: "",
    frecuencia: 60, tension_prim_vl: 0, tension_prim_vf: 0,
    tension_sec_vl: 0, tension_sec_vf: 0, tipo: "", grupo_conexion: "",
    liquido_aislante: "",
  };
}
function corrientePrimaria(d) {
  if (!d.tension_prim_vl) return null;
  return d.potencia_kva / (Math.sqrt(3) * (d.tension_prim_vl / 1000));
}
function corrienteSecundaria(d) {
  if (!d.tension_sec_vl) return null;
  return d.potencia_kva / (Math.sqrt(3) * (d.tension_sec_vl / 1000));
}

// ---------------------------------------------------------------------------
// Sección 2: Relación de transformación (trifásico A/B/C)
// ---------------------------------------------------------------------------
function nuevoTap(pos) {
  return {
    pos, derivacion: 0,
    relacion: { A: 0, B: 0, C: 0 },
    corriente_excitacion: { A: 0, B: 0, C: 0 },
    valor_nominal: null, valor_minimo: null, valor_maximo: null,
    dentro_tolerancia: { A: null, B: null, C: null },
  };
}
function nuevaRelacion() {
  return { equipo_usado: "", taps: [1, 2, 3, 4, 5].map(nuevoTap) };
}
function calcularRelacion(rel, tensionPrimVf, tensionSecVf) {
  const factores = { 1: 1.05, 2: 1.025, 3: 1.0, 4: 0.975, 5: 0.95 };
  for (const tap of rel.taps) {
    tap.derivacion = tensionPrimVf * factores[tap.pos];
    tap.valor_nominal = tensionSecVf ? tap.derivacion / tensionSecVf : null;
    if (tap.valor_nominal !== null) {
      const tol = CONFIG.ratio_tolerance;
      tap.valor_minimo = tap.valor_nominal * (1 - tol);
      tap.valor_maximo = tap.valor_nominal * (1 + tol);
      for (const f of FASES) {
        const r = tap.relacion[f];
        tap.dentro_tolerancia[f] = r ? (tap.valor_minimo <= r && r <= tap.valor_maximo) : null;
      }
    } else {
      tap.valor_minimo = tap.valor_maximo = null;
      for (const f of FASES) tap.dentro_tolerancia[f] = null;
    }
  }
}
function diagnosticoRelacion(rel) {
  const msgs = [];
  const hayDatos = rel.taps.some(t => FASES.some(f => t.dentro_tolerancia[f] !== null));
  if (!hayDatos) return ["Prueba de relación de transformación: sin datos suficientes para diagnóstico."];

  const fuera = [];
  for (const tap of rel.taps) {
    for (const f of FASES) {
      if (tap.dentro_tolerancia[f] === false) fuera.push(`TAP ${tap.pos} - Fase ${f}`);
    }
  }
  if (fuera.length === 0) {
    msgs.push("Relación de transformación: conforme en las tres fases (A, B, C) y en todas las " +
      "posiciones de TAP evaluadas, dentro de la tolerancia de ±0.5% (IEEE Std C57.12.90). " +
      "No se observan indicios de espiras en cortocircuito.");
  } else {
    msgs.push("Relación de transformación FUERA de tolerancia en: " + fuera.join(", ") + ". " +
      "Una relación fuera de tolerancia (±0.5%, IEEE Std C57.12.90) es indicio de posible " +
      "cortocircuito entre espiras, conexión incorrecta del devanado o error de medición; " +
      "se recomienda repetir la medición y, de persistir, complementar con prueba de resistencia " +
      "de devanados y relación de corriente de excitación (guías CIGRE de diagnóstico de transformadores).");
  }

  const asimTol = CONFIG.excitation_current_asymmetry_max;
  const tapsAsim = [];
  for (const tap of rel.taps) {
    const vals = FASES.map(f => ({ f, v: tap.corriente_excitacion[f] })).filter(o => o.v);
    if (vals.length === 3) {
      const mx = vals.reduce((a, b) => (b.v > a.v ? b : a));
      const mn = vals.reduce((a, b) => (b.v < a.v ? b : a));
      if (mn.v > 0 && (mx.v - mn.v) / mn.v > asimTol) {
        tapsAsim.push(`TAP ${tap.pos} (fase ${mx.f} más alta, +${(((mx.v - mn.v) / mn.v) * 100).toFixed(0)}%)`);
      }
    }
  }
  if (tapsAsim.length > 0) {
    msgs.push("Corriente de excitación con asimetría relevante entre fases en: " + tapsAsim.join(", ") +
      ". Este patrón es un indicador de campo de uso extendido (asociado a IEEE C57.12.90 y guías " +
      "CIGRE) de posible falla de espiras o de núcleo; se recomienda evaluación adicional.");
  } else if (rel.taps.some(t => FASES.some(f => t.corriente_excitacion[f]))) {
    msgs.push(`Corriente de excitación simétrica entre fases en todos los TAP evaluados (asimetría ≤ ${(asimTol * 100).toFixed(0)}%).`);
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// Sección 3: Resistencia de aislamiento
// ---------------------------------------------------------------------------
function nuevaSerieAislamiento(nombre) {
  const lecturas = {};
  TIEMPOS_MIN.forEach(t => (lecturas[t] = 0));
  return { nombre, voltaje_prueba: 0, lecturas, corregidas: {}, dar: null, pi: null };
}
function nuevaAislamiento() {
  return {
    equipo_usado: "", temperatura_equipo: 20, factor_correccion: null,
    prim_sec: nuevaSerieAislamiento("prim/sec"),
    prim_tierra: nuevaSerieAislamiento("prim/tierra"),
    sec_tierra: nuevaSerieAislamiento("sec/tierra"),
  };
}
function seriesAislamiento(a) { return [a.prim_sec, a.prim_tierra, a.sec_tierra]; }

function calcularAislamiento(a) {
  a.factor_correccion = correctionFactor(a.temperatura_equipo);
  for (const s of seriesAislamiento(a)) {
    s.corregidas = {};
    if (a.factor_correccion !== null) {
      TIEMPOS_MIN.forEach(t => (s.corregidas[t] = s.lecturas[t] ? s.lecturas[t] * a.factor_correccion : 0));
    }
    const r05 = s.lecturas[0.5] || 0, r1 = s.lecturas[1] || 0, r10 = s.lecturas[10] || 0;
    s.dar = r05 ? r1 / r05 : null;
    s.pi = r1 ? r10 / r1 : null;
  }
}
function calificacionPI(pi) {
  if (pi === null || pi === undefined) return "N/D";
  if (pi >= CONFIG.pi_excellent) return "Excelente";
  if (pi >= CONFIG.pi_good) return "Buena";
  if (pi >= CONFIG.pi_questionable) return "Cuestionable";
  return "Pobre / riesgo";
}
function calificacionDAR(dar) {
  if (dar === null || dar === undefined) return "N/D";
  if (dar >= CONFIG.dar_good) return "Buena";
  if (dar >= CONFIG.dar_acceptable) return "Aceptable";
  return "Cuestionable";
}
function diagnosticoAislamiento(a) {
  const series = seriesAislamiento(a);
  let alguna = false;
  const peores = [];
  for (const s of series) {
    if (s.pi === null) continue;
    alguna = true;
    const calif = calificacionPI(s.pi);
    if (calif === "Cuestionable" || calif === "Pobre / riesgo") peores.push(`${s.nombre} (PI=${s.pi.toFixed(2)}, ${calif})`);
  }
  if (!alguna) return ["Resistencia de aislamiento: sin datos suficientes para diagnóstico."];
  if (peores.length === 0) {
    return ["Resistencia de aislamiento: índices de polarización (PI) en rango Bueno/Excelente en las " +
      "series evaluadas (criterio de referencia asociado a IEEE Std 43). El aislamiento no muestra " +
      "indicios de humedad o contaminación relevante."];
  }
  return ["Resistencia de aislamiento con índice de polarización bajo en: " + peores.join(", ") + ". " +
    "Un PI cuestionable o pobre sugiere posible humedad, contaminación o envejecimiento del " +
    "aislamiento; se recomienda evaluar temperatura de ensayo, estado del aceite (rigidez dieléctrica, " +
    "humedad) y considerar secado/reacondicionamiento (guías CIGRE de mantenimiento de transformadores)."];
}

// ---------------------------------------------------------------------------
// Sección 4: Resistencia de devanados
// ---------------------------------------------------------------------------
function nuevoGrupoDevanado(nombre) {
  return {
    nombre,
    fases: [1, 2, 3].map(i => ({ fase: String(i), conexion: "", resultado_ohm: 0 })),
    promedio: null, maximo: null, minimo: null, desviacion_max: null, diferencia_fases: null,
  };
}
function nuevaDevanados() {
  return { equipo_usado: "", baja: nuevoGrupoDevanado("baja"), alta: nuevoGrupoDevanado("alta") };
}
function calcularGrupoDevanado(g) {
  const valores = g.fases.map(f => f.resultado_ohm).filter(v => v);
  if (valores.length === 0) {
    g.promedio = g.maximo = g.minimo = g.desviacion_max = g.diferencia_fases = null;
    return;
  }
  g.promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
  g.maximo = Math.max(...valores);
  g.minimo = Math.min(...valores);
  if (g.promedio) {
    g.desviacion_max = (g.maximo - g.promedio) / g.promedio;
    g.diferencia_fases = (g.maximo - g.minimo) / g.promedio;
  } else {
    g.desviacion_max = g.diferencia_fases = null;
  }
}
function clasificarDevanado(valor) {
  if (valor === null || valor === undefined) return "N/D";
  if (valor <= CONFIG.winding_dev_alert) return "OK";
  if (valor <= CONFIG.winding_dev_fail) return "Revisar";
  return "Fuera de rango";
}
function diagnosticoDesviacion(g) {
  const estado = clasificarDevanado(g.desviacion_max);
  if (estado === "N/D") return "Sin datos.";
  const pct = g.desviacion_max * 100;
  const alerta = CONFIG.winding_dev_alert * 100, falla = CONFIG.winding_dev_fail * 100;
  if (estado === "OK") return `Desviación máxima frente al promedio: ${pct.toFixed(2)}% — dentro del criterio de referencia CIGRE/campo (≤${alerta.toFixed(0)}%). Sin indicios de falla localizada.`;
  if (estado === "Revisar") return `Desviación máxima frente al promedio: ${pct.toFixed(2)}% — en zona de alerta (${alerta.toFixed(0)}%–${falla.toFixed(0)}%, criterio de referencia CIGRE/campo). Se sugiere verificar conexiones y repetir la medición.`;
  return `Desviación máxima frente al promedio: ${pct.toFixed(2)}% — supera el ${falla.toFixed(0)}% (criterio de referencia CIGRE/campo), lo que sugiere posible falla localizada (contacto deficiente, espiras en corto o daño del devanado). Se recomienda investigación adicional.`;
}
function diagnosticoDiferencia(g) {
  const estado = clasificarDevanado(g.diferencia_fases);
  if (estado === "N/D") return "Sin datos.";
  const pct = g.diferencia_fases * 100;
  const alerta = CONFIG.winding_dev_alert * 100, falla = CONFIG.winding_dev_fail * 100;
  if (estado === "OK") return `Diferencia entre fases: ${pct.toFixed(2)}% — dentro del criterio de referencia CIGRE/campo (≤${alerta.toFixed(0)}%). Devanados balanceados entre fases.`;
  if (estado === "Revisar") return `Diferencia entre fases: ${pct.toFixed(2)}% — en zona de alerta (${alerta.toFixed(0)}%–${falla.toFixed(0)}%, criterio de referencia CIGRE/campo). Puede indicar un desequilibrio incipiente entre fases; se sugiere repetir la medición.`;
  return `Diferencia entre fases: ${pct.toFixed(2)}% — supera el ${falla.toFixed(0)}% (criterio de referencia CIGRE/campo), lo cual es indicio de desequilibrio significativo entre fases (posible falla de una fase específica del devanado). Se recomienda investigación adicional.`;
}
function calcularDevanados(dv) {
  calcularGrupoDevanado(dv.baja);
  calcularGrupoDevanado(dv.alta);
}
function diagnosticoDevanados(dv) {
  const msgs = [];
  for (const g of [dv.baja, dv.alta]) {
    if (g.desviacion_max === null && g.diferencia_fases === null) continue;
    msgs.push(`Devanado ${g.nombre.toUpperCase()} — ${diagnosticoDesviacion(g)}`);
    msgs.push(`Devanado ${g.nombre.toUpperCase()} — ${diagnosticoDiferencia(g)}`);
  }
  if (msgs.length === 0) return ["Resistencia de devanados: sin datos suficientes para diagnóstico."];
  return msgs;
}

// ---------------------------------------------------------------------------
// Sección 5: Rigidez dieléctrica
// ---------------------------------------------------------------------------
function nuevaDielectrica() {
  return {
    equipo_usado: "", lecturas: [0, 0, 0, 0, 0],
    metodo: "ASTM D877 (gap 2.54 mm) - aceite en servicio",
    promedio: null, rango: null, limite_minimo: null, cumple: null,
  };
}
function calcularDielectrica(di) {
  const valores = di.lecturas.filter(v => v);
  if (valores.length === 0) {
    di.promedio = di.rango = di.cumple = null;
    return;
  }
  di.promedio = di.lecturas.reduce((a, b) => a + b, 0) / di.lecturas.length;
  di.rango = Math.max(...di.lecturas) - Math.min(...di.lecturas);
  di.limite_minimo = CONFIG.dielectric_limits[di.metodo] ?? null;
  di.cumple = di.limite_minimo !== null ? di.promedio >= di.limite_minimo : null;
}
function diagnosticoDielectrica(di) {
  if (di.cumple === null) return ["Rigidez dieléctrica: sin datos suficientes para diagnóstico."];
  if (di.cumple) {
    return [`Rigidez dieléctrica del aceite: CUMPLE con el límite mínimo de ${di.limite_minimo.toFixed(0)} kV (${di.metodo}). El aceite no presenta indicios de humedad, partículas conductoras o contaminación que comprometan su rigidez dieléctrica.`];
  }
  return [`Rigidez dieléctrica del aceite: NO CUMPLE con el límite mínimo de ${di.limite_minimo.toFixed(0)} kV (${di.metodo}). Un valor bajo la referencia ASTM sugiere presencia de humedad, partículas o contaminación en el aceite; se recomienda filtrado/secado (termovacío) o reemplazo del aceite, y verificar posible relación con un PI/DAR bajo en la prueba de resistencia de aislamiento (guías CIGRE de mantenimiento de aceite aislante).`];
}

// ---------------------------------------------------------------------------
// Contenedor global
// ---------------------------------------------------------------------------
function nuevaInspeccion() {
  return {
    datos: nuevoDatos(), relacion: nuevaRelacion(), aislamiento: nuevaAislamiento(),
    devanados: nuevaDevanados(), dielectrica: nuevaDielectrica(), observaciones: { texto: "" },
  };
}
function calcularTodo(insp) {
  calcularRelacion(insp.relacion, insp.datos.tension_prim_vf, insp.datos.tension_sec_vf);
  calcularAislamiento(insp.aislamiento);
  calcularDevanados(insp.devanados);
  calcularDielectrica(insp.dielectrica);
}
function diagnosticoGeneral(insp) {
  return [
    ...diagnosticoRelacion(insp.relacion),
    ...diagnosticoAislamiento(insp.aislamiento),
    ...diagnosticoDevanados(insp.devanados),
    ...diagnosticoDielectrica(insp.dielectrica),
  ];
}

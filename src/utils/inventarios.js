// =====================================================================
//  TEORÍA DE INVENTARIOS
//  1) Clasificación ABC (Pareto)
//  2) EOQ básico                       Q* = √(2dK/h)
//  3) Revisión continua estocástica    Q = √(2dK/h)·√((p+h)/p) ; R = μ + K₁₋L·σ ; SS = K₁₋L·σ
//  4) Un solo periodo (perecederos)    F(S*) = (p − c)/(p + h)
// =====================================================================

// ---------- Utilidades estadísticas ----------

/** Valores estándar de tabla normal Z para el nivel de servicio L → K₁₋L */
export const TABLA_Z = {
  0.5: 0,
  0.75: 0.675,
  0.8: 0.842,
  0.85: 1.036,
  0.9: 1.282,
  0.95: 1.645,
  0.975: 1.96,
  0.99: 2.326,
}

/** K₁₋L: usa la tabla estándar si existe el valor; si no, aproxima con la inversa normal */
export function valorZ(L) {
  const clave = Math.round(L * 1000) / 1000
  if (TABLA_Z[clave] !== undefined) return TABLA_Z[clave]
  return inversaNormal(L)
}

/** Inversa de la normal estándar (algoritmo de Acklam, error < 1.2e-9) */
export function inversaNormal(p) {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let q, r
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= 1 - pl) {
    q = p - 0.5
    r = q * q
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

const fdpNormal = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
function fdaNormal(z) {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

// ---------- Recetas ----------

export function costoReceta(producto, insumos) {
  return producto.receta.reduce((s, r) => {
    const ins = insumos.find((i) => i.id === r.insumoId)
    return s + (ins ? ins.costo * r.cantidad : 0)
  }, 0)
}

export function utilidadUnitaria(producto, insumos) {
  return producto.precio - costoReceta(producto, insumos)
}

// ---------- 1) Clasificación ABC ----------

/**
 * Valor de consumo = unidades consumidas × costo unitario c.
 * Ordena de mayor a menor y clasifica por % acumulado:
 *   A: hasta 80 %  ·  B: hasta 95 %  ·  C: resto (≈5 %)
 */
export function clasificacionABC(insumos, consumoVivo = {}, limiteA = 80, limiteB = 95) {
  const filas = insumos.map((i) => {
    const unidades = (i.consumoHistorico || 0) + (consumoVivo[i.id] || 0)
    return { id: i.id, nombre: i.nombre, unidad: i.unidad, unidades, costo: i.costo, valor: unidades * i.costo }
  })
  filas.sort((x, y) => y.valor - x.valor)
  const total = filas.reduce((s, f) => s + f.valor, 0) || 1
  let acum = 0
  return {
    total,
    filas: filas.map((f, idx) => {
      acum += f.valor
      const porcentaje = (f.valor / total) * 100
      const acumulado = (acum / total) * 100
      let clase = 'C'
      if (idx === 0 || acumulado <= limiteA + 1e-9) clase = 'A'
      else if (acumulado <= limiteB + 1e-9) clase = 'B'
      return { ...f, porcentaje, acumulado, clase }
    }),
  }
}

// ---------- 2) EOQ básico ----------

// Q* = √(2dK/h) ; N = d/Q* pedidos por día ; T = Q*/d días ; CTU = Kd/Q + hQ/2 ; R = d·L
export function eoqBasico({ d, K, h, tiempoEntrega = 0 }) {
  const Q = Math.sqrt((2 * d * K) / h)
  const costoOrdenar = (K * d) / Q
  const costoMantener = (h * Q) / 2
  return {
    Q,
    pedidosPorDia: d / Q,
    ciclo: Q / d,
    costoOrdenar,
    costoMantener,
    costoTotal: costoOrdenar + costoMantener,
    R: d * tiempoEntrega,
  }
}

// ---------- 3) Revisión continua (estocástico) ----------

/**
 * μ = d · tiempoEntrega (demanda media durante el plazo de entrega)
 * Q = √(2dK/h) · √((p+h)/p)
 * R = μ + K₁₋L · σ      SS = R − μ = K₁₋L · σ
 */
export function revisionContinua({ d, K, h, p, tiempoEntrega, sigma, nivelServicio, distribucionLT = 'normal', aLT, bLT }) {
  const Qeoq = Math.sqrt((2 * d * K) / h)
  const factor = Math.sqrt((p + h) / p)
  const Q = Qeoq * factor
  if (distribucionLT === 'uniforme') {
    // Demanda en el tiempo de entrega D ~ Uniforme(a, b):  R = a + L(b − a) ; E(D) = (a+b)/2 ; SS = (L − ½)(b − a)
    const mu = (aLT + bLT) / 2
    const R = aLT + nivelServicio * (bLT - aLT)
    return { Qeoq, factor, Q, mu, z: null, SS: R - mu, R }
  }
  // Demanda en el tiempo de entrega D ~ Normal(μ, σ):  R = μ + K₁₋L·σ ; SS = K₁₋L·σ
  const mu = d * tiempoEntrega
  const z = valorZ(nivelServicio)
  const SS = z * sigma
  const R = mu + SS
  return { Qeoq, factor, Q, mu, z, SS, R }
}

// ---------- 4) Un solo periodo (perecederos) ----------

/**
 * Ratio crítico F(S*) = (p − c)/(p + h)
 *  Uniforme(a,b): S* = a + F·(b − a)
 *  Normal(μ,σ):  S* = μ + z·σ  con z = Φ⁻¹(F)
 */
export function unSoloPeriodo(params) {
  const { p, c, h, distribucion = 'uniforme', a, b, mu, sigmaDemanda, I = 0, Kprep = 0 } = params
  const ratio = (p - c) / (p + h)
  let S, z = null
  if (distribucion === 'normal') {
    z = inversaNormal(Math.min(Math.max(ratio, 1e-6), 1 - 1e-6))
    S = mu + z * sigmaDemanda
  } else {
    const F = Math.min(Math.max(ratio, 0), 1)
    S = a + F * (b - a)
  }
  const Sentero = Math.max(0, Math.round(S))
  // Política con inventario inicial I:
  //  K = 0 → si I < S* ordenar S* − I ; si I ≥ S* no ordenar
  //  K > 0 → política (s*, S*): s* < S* tal que C(s*) = K + C(S*) ; si I < s* ordenar S* − I
  let sMin = S
  if (Kprep > 0) {
    const meta = Kprep + costoEsperadoPeriodo(S, params)
    let lo = distribucion === 'normal' ? mu - 6 * sigmaDemanda : a - (b - a)
    let hi = S
    if (costoEsperadoPeriodo(lo, params) < meta) sMin = lo
    else {
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2
        if (costoEsperadoPeriodo(m, params) > meta) lo = m
        else hi = m
      }
      sMin = (lo + hi) / 2
    }
  }
  const ordenar = I < (Kprep > 0 ? sMin : S) ? Math.max(0, Sentero - I) : 0
  return { ratio, S, z, Sentero, sMin, ordenar, I }
}

/**
 * Costo esperado del periodo para una cantidad S (se minimiza en S*, equivale a maximizar la ganancia):
 *   E[C(S)] = c·S + h·E[(S−D)⁺] + p·E[(D−S)⁺]
 */
export function costoEsperadoPeriodo(S, { p, c, h, distribucion = 'uniforme', a, b, mu, sigmaDemanda }) {
  let sobrante, faltante
  if (distribucion === 'normal') {
    const z = (S - mu) / sigmaDemanda
    faltante = sigmaDemanda * (fdpNormal(z) - z * (1 - fdaNormal(z)))
    sobrante = S - mu + faltante
  } else {
    const ancho = b - a
    const s = Math.min(Math.max(S, a), b)
    sobrante = (s - a) ** 2 / (2 * ancho) + Math.max(0, S - b)
    faltante = (b - s) ** 2 / (2 * ancho) + Math.max(0, a - S)
  }
  return c * S + h * sobrante + p * faltante
}

/** Ganancia esperada con precio de venta (para mostrar en el panel) */
export function gananciaEsperadaPeriodo(S, params, precio) {
  // E[ventas] = E[min(D,S)] = E[D] − E[(D−S)⁺]
  const { distribucion = 'uniforme', a, b, mu, sigmaDemanda, c, h } = params
  let mediaD, faltante, sobrante
  if (distribucion === 'normal') {
    const z = (S - mu) / sigmaDemanda
    faltante = sigmaDemanda * (fdpNormal(z) - z * (1 - fdaNormal(z)))
    mediaD = mu
  } else {
    const ancho = b - a
    const s = Math.min(Math.max(S, a), b)
    faltante = (b - s) ** 2 / (2 * ancho) + Math.max(0, a - S)
    mediaD = (a + b) / 2
  }
  const ventas = mediaD - faltante
  sobrante = S - ventas
  return precio * ventas - c * S - h * sobrante
}

// ---------- Punto de reorden genérico para el mostrador ----------

export function analizarInsumo(insumo) {
  if (insumo.modelo === 'estocastico') {
    const r = revisionContinua(insumo)
    return { R: r.R, SS: r.SS, Q: r.Q, detalle: r }
  }
  if (insumo.modelo === 'eoq') {
    const r = eoqBasico(insumo)
    return { R: r.R, SS: 0, Q: r.Q, detalle: r }
  }
  if (insumo.modelo === 'perecedero') {
    const r = unSoloPeriodo({ ...insumo, c: insumo.costo })
    return { R: null, SS: null, Q: r.Sentero, detalle: r }
  }
  return { R: null, SS: null, Q: null, detalle: null }
}

/** ¿El insumo iguala o bajó de su punto de reorden? */
export function necesitaReorden(insumo) {
  const { R } = analizarInsumo(insumo)
  if (R === null) return insumo.stock <= 0
  return insumo.stock <= R + 1e-9
}

// ---------- Proyección del nivel de inventario (gráfica "diente de sierra") ----------

/**
 * Simula el nivel esperado de inventario con demanda constante d:
 *  - baja a razón de d por día
 *  - cuando el nivel llega a R se coloca un pedido de Q
 *  - el pedido llega después del plazo de entrega L (sube Q)
 * Devuelve los puntos de la curva y los eventos (pedidos y llegadas).
 */
export function proyeccionInventario({ stock, d, Q, R, L, horizonte }) {
  const H = horizonte ?? (Math.max(stock - R, 0) + 2.2 * Q) / d + L
  const puntos = [{ t: 0, nivel: stock }]
  const pedidos = []
  const llegadas = []
  let t = 0
  let nivel = stock
  let llegadaPendiente = null
  if (nivel <= R) {
    pedidos.push({ t: 0, nivel })
    llegadaPendiente = L
  }
  let guarda = 0
  while (t < H - 1e-9 && guarda++ < 200) {
    const tR = llegadaPendiente === null && nivel > R ? t + (nivel - R) / d : Infinity
    const tA = llegadaPendiente ?? Infinity
    const tn = Math.min(tR, tA, H)
    nivel -= d * (tn - t)
    t = tn
    puntos.push({ t, nivel })
    if (tn === tA) {
      nivel += Q
      puntos.push({ t, nivel })
      llegadas.push({ t, nivel })
      llegadaPendiente = null
      if (nivel <= R) {
        pedidos.push({ t, nivel })
        llegadaPendiente = t + L
      }
    } else if (tn === tR) {
      pedidos.push({ t, nivel })
      llegadaPendiente = t + L
    }
  }
  return { puntos, pedidos, llegadas, horizonte: H }
}

/** Curvas de costo del EOQ por unidad de tiempo: ordenar Kd/Q, mantener hQ/2 y total */
export function curvasCostoEOQ({ d, K, h }, puntos = 60) {
  const Qopt = Math.sqrt((2 * d * K) / h)
  const max = Qopt * 3
  return Array.from({ length: puntos }, (_, i) => {
    const Q = (max * (i + 1)) / puntos
    const ordenar = (K * d) / Q
    const mantener = (h * Q) / 2
    return { Q, ordenar, mantener, total: ordenar + mantener }
  })
}

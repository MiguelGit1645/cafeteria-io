// =====================================================================
//  TEORÍA DE COLAS EN MOSTRADOR
//  M/M/1/K  (1 barista, capacidad finita K)
//  M/M/s/K  (s baristas, s ≤ K)
//  Unidades: λ y μ en clientes/hora → W en horas (se muestran también en minutos)
// =====================================================================

const factorial = (n) => {
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}

/**
 * M/M/1/K
 *  ρ   = λ/μ
 *  P0  = (1−ρ)/(1−ρ^(K+1))
 *  Pn  = P0·ρ^n            (PK = probabilidad de rechazo: local lleno)
 *  Ls  = ρ/(1−ρ) − (K+1)ρ^(K+1)/(1−ρ^(K+1))
 *  Lq  = Ls − (1−P0)
 *  λ̄   = λ(1−PK)
 *  Ws  = Ls/λ̄ ;  Wq = Lq/λ̄
 *  (Caso ρ = 1: P0 = 1/(K+1), Ls = K/2)
 */
export function mm1k({ lambda, mu, K }) {
  const rho = lambda / mu
  const esUno = Math.abs(rho - 1) < 1e-9
  const P0 = esUno ? 1 / (K + 1) : (1 - rho) / (1 - Math.pow(rho, K + 1))
  const Pn = Array.from({ length: K + 1 }, (_, n) => P0 * Math.pow(rho, n))
  const PK = Pn[K]
  const Ls = esUno
    ? K / 2
    : rho / (1 - rho) - ((K + 1) * Math.pow(rho, K + 1)) / (1 - Math.pow(rho, K + 1))
  const Lq = Ls - (1 - P0)
  const lambdaEf = lambda * (1 - PK)
  const Ws = Ls / lambdaEf
  const Wq = Lq / lambdaEf
  return {
    modelo: 'M/M/1/K',
    s: 1, K, lambda, mu, rho, P0, Pn, PK, Ls, Lq, lambdaEf, Ws, Wq,
    utilizacion: lambdaEf / mu, // fracción de tiempo que el barista está ocupado
    rechazadosPorHora: lambda * PK,
  }
}

/**
 * M/M/s/K
 *  ρ  = λ/(sμ)
 *  P0 = 1 / [ Σ_{n=0}^{s} (λ/μ)^n/n!  +  (λ/μ)^s/s! · Σ_{n=s+1}^{K} ρ^(n−s) ]
 *  Pn = (λ/μ)^n/n! · P0                (n ≤ s)
 *  Pn = (λ/μ)^n/(s!·s^(n−s)) · P0      (s < n ≤ K)
 *  Lq = P0(λ/μ)^s ρ / (s!(1−ρ)²) · [1 − ρ^(K−s) − (K−s)ρ^(K−s)(1−ρ)]
 *  Ls = Σ_{n=0}^{s−1} n·Pn + Lq + s(1 − Σ_{n=0}^{s−1} Pn)
 *  λ̄ = λ(1−PK) ; Ws = Ls/λ̄ ; Wq = Lq/λ̄
 */
export function mmsk({ lambda, mu, s, K }) {
  if (s > K) s = K
  const r = lambda / mu // λ/μ
  const rho = lambda / (s * mu)
  let suma1 = 0
  for (let n = 0; n <= s; n++) suma1 += Math.pow(r, n) / factorial(n)
  let suma2 = 0
  for (let n = s + 1; n <= K; n++) suma2 += Math.pow(rho, n - s)
  const P0 = 1 / (suma1 + (Math.pow(r, s) / factorial(s)) * suma2)

  const Pn = Array.from({ length: K + 1 }, (_, n) =>
    n <= s
      ? (Math.pow(r, n) / factorial(n)) * P0
      : (Math.pow(r, n) / (factorial(s) * Math.pow(s, n - s))) * P0,
  )
  const PK = Pn[K]

  let Lq
  if (Math.abs(rho - 1) < 1e-9) {
    // Límite cuando ρ → 1: Lq = Σ (n−s)Pn
    Lq = Pn.reduce((acc, p, n) => acc + Math.max(0, n - s) * p, 0)
  } else {
    Lq =
      ((P0 * Math.pow(r, s) * rho) / (factorial(s) * Math.pow(1 - rho, 2))) *
      (1 - Math.pow(rho, K - s) - (K - s) * Math.pow(rho, K - s) * (1 - rho))
  }

  let sumaNPn = 0
  let sumaPn = 0
  for (let n = 0; n <= s - 1; n++) {
    sumaNPn += n * Pn[n]
    sumaPn += Pn[n]
  }
  const Ls = sumaNPn + Lq + s * (1 - sumaPn)
  const lambdaEf = lambda * (1 - PK)
  const Ws = Ls / lambdaEf
  const Wq = Lq / lambdaEf
  return {
    modelo: `M/M/${s}/K`,
    s, K, lambda, mu, rho, P0, Pn, PK, Ls, Lq, lambdaEf, Ws, Wq,
    utilizacion: lambdaEf / (s * mu),
    rechazadosPorHora: lambda * PK,
  }
}

// ---------- Estimación en vivo de λ y μ a partir del historial de pedidos ----------

/**
 * λ = 1 / promedio(intervalo entre llegadas)       [clientes/hora]
 * Tiempo de servicio (1 servidor, FIFO) = entrega − max(llegada, entrega anterior)
 * μ = 1 / promedio(tiempo de servicio)               [clientes/hora]
 */
export function estimarTasas(pedidos) {
  const hora = 3600 * 1000
  const llegadas = pedidos.map((p) => p.hora_llegada).sort((a, b) => a - b)
  // Intervalos entre llegadas consecutivas; se ignoran los mayores a 2 h (tienda cerrada entre jornadas)
  let sumaIntervalos = 0
  let nIntervalos = 0
  for (let i = 1; i < llegadas.length; i++) {
    const gap = llegadas[i] - llegadas[i - 1]
    if (gap > 0 && gap <= 2 * hora) {
      sumaIntervalos += gap
      nIntervalos++
    }
  }
  const lambda = nIntervalos && sumaIntervalos > 0 ? nIntervalos / (sumaIntervalos / hora) : null
  const servicios = tiemposDeServicio(pedidos).map((t) => t.servicioMin)
  let mu = null
  const promedioServicioMin = servicios.length ? servicios.reduce((a, b) => a + b, 0) / servicios.length : null
  if (promedioServicioMin && promedioServicioMin > 0) mu = 60 / promedioServicioMin
  const promedioLlegadaMin = lambda ? 60 / lambda : null
  return { lambda, mu, nLlegadas: llegadas.length, nServicios: servicios.length, promedioServicioMin, promedioLlegadaMin }
}

/** Calcula inicio de atención, tiempo de servicio y tiempo en el sistema de cada pedido entregado */
export function tiemposDeServicio(pedidos) {
  const entregados = pedidos
    .filter((p) => p.estado === 'ENTREGADO' && p.hora_entrega)
    .sort((a, b) => a.hora_entrega - b.hora_entrega)
  let entregaAnterior = -Infinity
  return entregados.map((p) => {
    const inicio = Math.max(p.hora_llegada, entregaAnterior)
    entregaAnterior = p.hora_entrega
    return {
      id: p.id,
      inicio,
      servicioMin: Math.max(0, (p.hora_entrega - inicio) / 60000),
      sistemaMin: Math.max(0, (p.hora_entrega - p.hora_llegada) / 60000),
    }
  })
}

/** Muestra de una exponencial con media dada (para simulación de llegadas/servicios) */
export function muestraExponencial(media) {
  return -media * Math.log(1 - Math.random())
}

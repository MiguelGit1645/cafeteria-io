// =====================================================================
//  TEORÍA DE DECISIONES — Árbol de decisión y Valor Monetario Esperado
//    r_ij  = (Unidades escenario_j × Utilidad unitaria_i) − Costo fijo/lote_i
//    VME_i = Σ_j r_ij · p_j
//  Utilidad unitaria_i = Precio de venta − Costo de receta (automático)
// =====================================================================
import { costoReceta } from './inventarios.js'

export function resolverArbol({ alternativas, productos, insumos, probabilidades }) {
  const ramas = alternativas.map((alt, i) => {
    const producto = productos.find((p) => p.id === alt.productoId)
    const costo = costoReceta(producto, insumos)
    const utilidad = producto.precio - costo
    const resultados = alt.unidades.map((u) => u * utilidad - alt.costoFijo)
    const vme = resultados.reduce((s, r, j) => s + r * probabilidades[j], 0)
    return {
      indice: i,
      productoId: alt.productoId,
      nombre: producto.nombre,
      emoji: producto.emoji,
      precio: producto.precio,
      costoReceta: costo,
      utilidad,
      costoFijo: alt.costoFijo,
      unidades: alt.unidades,
      resultados,
      vme,
    }
  })
  const mejor = ramas.reduce((m, r) => (r.vme > m.vme ? r : m), ramas[0])
  return { ramas, mejor, sumaProbabilidades: probabilidades.reduce((a, b) => a + b, 0) }
}

/**
 * Cambia p_k a "valor" y reparte (1 − valor) entre los demás escenarios
 * en proporción a sus valores previos, para que Σp_j = 1 siempre.
 */
export function ajustarProbabilidades(probs, k, valor) {
  const v = Math.min(Math.max(valor, 0), 1)
  const otros = probs.map((p, i) => (i === k ? 0 : p))
  const sumaOtros = otros.reduce((a, b) => a + b, 0)
  const resto = 1 - v
  const nuevas = probs.map((p, i) => {
    if (i === k) return v
    return sumaOtros > 0 ? (p / sumaOtros) * resto : resto / (probs.length - 1)
  })
  const redondeadas = nuevas.map((p) => Math.round(p * 100) / 100)
  // Corrige el residuo de redondeo en el escenario (distinto de k) con mayor probabilidad
  const residuo = Math.round((1 - redondeadas.reduce((a, b) => a + b, 0)) * 100) / 100
  if (residuo !== 0) {
    let idx = -1
    redondeadas.forEach((p, i) => { if (i !== k && (idx < 0 || p > redondeadas[idx])) idx = i })
    redondeadas[idx] = Math.round((redondeadas[idx] + residuo) * 100) / 100
  }
  return redondeadas
}

/**
 * Criterios en condiciones de incertidumbre (sin usar probabilidades), para utilidades:
 *  MaxiMax: max_i max_j r_ij        (optimista)
 *  MaxiMin: max_i min_j r_ij        (pesimista)
 *  Laplace: max_i promedio_j r_ij   (equiprobable)
 *  Hurwicz: max_i [α·max_j r_ij + (1−α)·min_j r_ij]
 *  Savage:  min_i max_j (max_k r_kj − r_ij)   (mínimo arrepentimiento)
 */
export function criteriosIncertidumbre(ramas, alfa = 0.5) {
  const m = ramas[0].resultados.length
  const mejorCol = Array.from({ length: m }, (_, j) => Math.max(...ramas.map((r) => r.resultados[j])))
  const filas = ramas.map((r) => {
    const max = Math.max(...r.resultados)
    const min = Math.min(...r.resultados)
    const laplace = r.resultados.reduce((a, b) => a + b, 0) / m
    const hurwicz = alfa * max + (1 - alfa) * min
    const arrepentimientos = r.resultados.map((x, j) => mejorCol[j] - x)
    const savage = Math.max(...arrepentimientos)
    return { nombre: r.nombre, emoji: r.emoji, indice: r.indice, max, min, laplace, hurwicz, arrepentimientos, savage }
  })
  const elegir = (clave, menor = false) =>
    filas.reduce((best, f) => ((menor ? f[clave] < best[clave] : f[clave] > best[clave]) ? f : best), filas[0]).indice
  return {
    filas,
    mejorCol,
    ganadores: {
      maximax: elegir('max'),
      maximin: elegir('min'),
      laplace: elegir('laplace'),
      hurwicz: elegir('hurwicz'),
      savage: elegir('savage', true),
    },
  }
}

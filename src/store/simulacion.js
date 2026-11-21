// =====================================================================
//  SIMULACIÓN DE JORNADAS: Abrir tienda / Cerrar tienda
//  - Llegadas de Poisson (intervalos exponenciales de media 60/λ min)
//  - Cada cliente elige un producto según la mezcla de ventas
//  - 1 barista, FIFO, servicio exponencial de media 60/μ min
//  - Aforo K: si el local está lleno el cliente se va (rechazo)
//  - Sin insumos para su producto: venta perdida
//  - Reposición automática: al llegar a R se pide Q y llega tras el plazo de entrega
//  - Croissants: se hornea S* − I al abrir; lo que sobra al cerrar se desperdicia
//  - Al cerrar: reporte del día, se suma al historial y se actualizan el árbol y la demanda d
// =====================================================================
import { ref } from 'vue'
import {
  estado, ui, ahoraVirtual, pedidosEnCola, registrarPedido, entregarPedido, reponer, disponible,
  productoPorId, insumoPorId, notificar, registrarMovimiento, fmt, hooks,
} from './useCafeteria.js'
import { analizarInsumo, unSoloPeriodo, costoReceta } from '../utils/inventarios.js'
import { mm1k, tiemposDeServicio, muestraExponencial } from '../utils/colas.js'
import { resolverArbol } from '../utils/decisiones.js'
import { ESCENARIOS } from '../data/datosCafeteria.js'

const MIN = 60 * 1000
const HORA = 60 * MIN

export const reporteAbierto = ref(null) // reporte que se muestra en la ventana

// Revisión continua: con la tienda abierta, toda venta (simulada o del Mostrador) revisa el punto de reorden.
// Con la tienda cerrada solo se muestra la alerta de cuánto pedir.
hooks.despuesDeVenta = (insumoIds, t) => {
  if (!estado.tienda.abierta) return
  for (const id of insumoIds) revisarReposicion(insumoPorId(id), t)
}

let timer = null
let ultimoTick = 0

// ---------- Utilidades ----------
function fijarReloj(t) {
  estado.desfaseReloj += t - ahoraVirtual()
}
function siguienteApertura(t) {
  const d = new Date(t)
  d.setHours(estado.tienda.horaApertura, 0, 0, 0)
  if (d.getTime() <= t) d.setDate(d.getDate() + 1)
  return d.getTime()
}
function elegirProducto() {
  const mezcla = estado.tienda.mezcla
  const total = Object.values(mezcla).reduce((a, b) => a + b, 0)
  let u = Math.random() * total
  for (const [id, w] of Object.entries(mezcla)) {
    if ((u -= w) <= 0) return id
  }
  return Object.keys(mezcla)[0]
}
const ultimaEntrega = () =>
  estado.pedidos.reduce((m, p) => (p.hora_entrega && p.hora_entrega > m ? p.hora_entrega : m), 0)

// ---------- Apertura ----------
export function abrirTienda({ instantaneo = false } = {}) {
  if (estado.tienda.abierta) return
  const t0 = siguienteApertura(ahoraVirtual())
  fijarReloj(t0)
  const J = estado.tienda
  J.dia++
  J.abierta = true

  // Mantener el arreglo de pedidos liviano: pendientes + últimos 250 entregados
  const pendientes = estado.pedidos.filter((p) => p.estado === 'EN_COLA')
  const entregados = estado.pedidos.filter((p) => p.estado !== 'EN_COLA').sort((a, b) => b.hora_entrega - a.hora_entrega).slice(0, 250)
  estado.pedidos = [...entregados.reverse(), ...pendientes]

  estado.jornada = {
    dia: J.dia,
    inicio: t0,
    fin: t0 + J.horas * HORA,
    cierreReal: null,
    puertasCerradas: false,
    proximaLlegada: t0 + muestraExponencial(60 / estado.colas.lambda) * MIN,
    llegadas: 0,
    rechazados: 0,
    perdidas: {},
    maxCola: pedidosEnCola.value.length,
    consumoInicial: { ...estado.consumoVivo },
    stockInicial: Object.fromEntries(estado.insumos.map((i) => [i.id, i.stock])),
    pedidosColocados: [],
    pedidosRecibidos: [],
    horneados: 0,
    desperdicio: 0,
  }

  // Pedidos al proveedor que llegaron mientras la tienda estaba cerrada
  procesarProveedor(t0)
  // Perecederos: hornear S* − I (política del modelo de un solo periodo)
  for (const ins of estado.insumos.filter((i) => i.modelo === 'perecedero')) {
    const r = unSoloPeriodo({ ...ins, c: ins.costo, I: ins.stock, Kprep: ins.Kprep || 0 })
    if (r.ordenar > 0) {
      estado.jornada.horneados += r.ordenar
      reponer(ins.id, ins.stock + r.ordenar)
    }
  }
  // Insumos que ya abren bajo R
  for (const ins of estado.insumos) revisarReposicion(ins, t0)

  notificar(`☕ Tienda abierta · Día ${J.dia}`, 'ok', 2500)
  if (!instantaneo) iniciarReloj()
}

// ---------- Reloj acelerado ----------
function iniciarReloj() {
  detenerReloj()
  ultimoTick = Date.now()
  timer = setInterval(tick, 100)
}
function detenerReloj() {
  if (timer) clearInterval(timer)
  timer = null
}
function tick() {
  if (!estado.tienda.abierta || !estado.jornada) return detenerReloj()
  const ahoraReal = Date.now()
  const dtReal = ahoraReal - ultimoTick
  ultimoTick = ahoraReal
  // velocidad = segundos reales por hora simulada → factor de aceleración
  const factor = 3600 / Math.max(1, estado.tienda.velocidad)
  estado.desfaseReloj += dtReal * factor - dtReal
  procesarHasta(ahoraVirtual())
}

// Si la página se recarga con la tienda abierta, retomar el reloj
export function reanudarSiCorresponde() {
  if (estado.tienda.abierta && estado.jornada && !timer) iniciarReloj()
}

// ---------- Motor de eventos ----------
function proximoServicio() {
  const cabeza = pedidosEnCola.value[0]
  if (!cabeza) return null
  if (!cabeza.fin_programado) {
    // El barista empieza cuando llega el cliente o cuando termina el pedido anterior (FIFO)
    const inicio = Math.max(cabeza.hora_llegada, ultimaEntrega(), estado.jornada?.inicio ?? 0)
    cabeza.fin_programado = inicio + Math.max(0.3, muestraExponencial(60 / estado.colas.mu)) * MIN
  }
  return cabeza
}

export function procesarHasta(T) {
  const J = estado.jornada
  if (!J) return
  let guarda = 0
  while (guarda++ < 5000) {
    const llegada = !J.puertasCerradas && J.proximaLlegada < J.fin ? J.proximaLlegada : Infinity
    const cabeza = proximoServicio()
    // Puertas cerradas y nadie adentro: la jornada terminó
    if (J.puertasCerradas && !cabeza) break
    const servicio = cabeza ? cabeza.fin_programado : Infinity
    const proveedor = estado.pedidosProveedor.reduce((m, p) => Math.min(m, p.llegada), Infinity)
    const t = Math.min(llegada, servicio, proveedor)
    if (t > T || t === Infinity) break
    if (t > ahoraVirtual()) fijarReloj(t) // en simulación instantánea el reloj sigue a los eventos

    if (t === servicio) {
      entregarPedido(cabeza.id, t)
    } else if (t === llegada) {
      procesarLlegada(t)
      J.proximaLlegada = t + muestraExponencial(60 / estado.colas.lambda) * MIN
    } else {
      procesarProveedor(t)
    }
  }
  // Fin de la jornada: se cierran las puertas y se atiende a quienes siguen adentro
  if (!J.puertasCerradas && T >= J.fin) J.puertasCerradas = true
  if (J.puertasCerradas && pedidosEnCola.value.length === 0) cerrarJornada()
}

function procesarLlegada(t) {
  const J = estado.jornada
  J.llegadas++
  const prodId = elegirProducto()
  if (pedidosEnCola.value.length >= estado.colas.K) {
    J.rechazados++
    estado.rechazados++
    return
  }
  const prod = productoPorId(prodId)
  if (!disponible(prod)) {
    J.perdidas[prodId] = (J.perdidas[prodId] || 0) + 1
    return
  }
  registrarPedido([{ productoId: prodId, cantidad: 1 }], { hora: t, simulado: true })
  J.maxCola = Math.max(J.maxCola, pedidosEnCola.value.length)
}

function revisarReposicion(ins, t) {
  if (!estado.tienda.reposicionAuto || !ins || ins.modelo === 'perecedero') return
  const a = analizarInsumo(ins)
  if (a.R === null || ins.stock > a.R) return
  if (estado.pedidosProveedor.some((p) => p.insumoId === ins.id)) return
  const cantidad = Math.round(a.Q)
  const pedido = {
    insumoId: ins.id,
    cantidad,
    colocado: t,
    // El plazo está en días de operación (jornadas)
    llegada: t + ins.tiempoEntrega * estado.tienda.horas * HORA,
  }
  estado.pedidosProveedor.push(pedido)
  estado.jornada?.pedidosColocados.push({ ...pedido, stock: ins.stock })
  notificar(`🚚 Pedido automático: ${fmt(cantidad, 0)} ${ins.unidad} de ${ins.nombre.toLowerCase()} (stock ≤ R)`, 'info', 3500)
}

function procesarProveedor(t) {
  const listos = estado.pedidosProveedor.filter((p) => p.llegada <= t)
  if (!listos.length) return
  estado.pedidosProveedor = estado.pedidosProveedor.filter((p) => p.llegada > t)
  for (const p of listos) {
    reponer(p.insumoId, p.cantidad)
    estado.jornada?.pedidosRecibidos.push({ ...p })
  }
}

// ---------- Cierre ----------
/** Cierre manual: se cierran las puertas y se atiende al instante a quienes siguen adentro */
export function cerrarTienda() {
  const J = estado.jornada
  if (!estado.tienda.abierta || !J) return
  detenerReloj()
  J.puertasCerradas = true
  J.fin = Math.min(J.fin, ahoraVirtual())
  procesarHasta(Infinity)
}

function cerrarJornada() {
  const J = estado.jornada
  if (!J || !estado.tienda.abierta) return
  detenerReloj()
  J.cierreReal = Math.max(ultimaEntrega(), J.fin)
  fijarReloj(Math.max(ahoraVirtual(), J.cierreReal))
  // Perecederos: lo que sobra se desperdicia
  for (const ins of estado.insumos.filter((i) => i.modelo === 'perecedero')) {
    if (ins.stock > 0) {
      J.desperdicio += ins.stock
      ins.stock = 0
      registrarMovimiento(ins.id, 0, 'desperdicio', J.cierreReal)
    }
  }
  estado.tienda.abierta = false
  const reporte = generarReporte(J)
  estado.historialDias.push(reporte)
  if (estado.historialDias.length > 60) estado.historialDias.shift()
  actualizarModelos(reporte)
  reporte.recomendacion = recomendacionVME()
  estado.jornada = null
  if (!ui.silencio) reporteAbierto.value = reporte
  notificar(`🔒 Tienda cerrada · Día ${reporte.dia}`, 'ok', 2500)
}

function generarReporte(J) {
  const delDia = estado.pedidos.filter((p) => p.hora_llegada >= J.inicio && p.hora_llegada <= J.cierreReal)
  const ventas = {}
  let ingresos = 0
  let costo = 0
  for (const p of delDia) {
    for (const it of p.items) {
      const prod = productoPorId(it.productoId)
      ventas[it.productoId] = (ventas[it.productoId] || 0) + it.cantidad
      ingresos += prod.precio * it.cantidad
      costo += costoReceta(prod, estado.insumos) * it.cantidad
    }
  }
  const productos = estado.productos.map((prod) => {
    const vendidas = ventas[prod.id] || 0
    const perdidas = J.perdidas[prod.id] || 0
    const util = prod.precio - costoReceta(prod, estado.insumos)
    return {
      id: prod.id, nombre: prod.nombre, emoji: prod.emoji,
      vendidas, perdidas, demanda: vendidas + perdidas,
      ingresos: vendidas * prod.precio, utilidad: vendidas * util, utilidadUnitaria: util,
    }
  })

  // Tiempos reales del día
  const ids = new Set(delDia.map((p) => p.id))
  const tiempos = tiemposDeServicio(estado.pedidos).filter((t) => ids.has(t.id))
  const prom = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
  const servicioProm = prom(tiempos.map((t) => t.servicioMin))
  const sistemaProm = prom(tiempos.map((t) => t.sistemaMin))
  const esperaProm = prom(tiempos.map((t) => Math.max(0, t.sistemaMin - t.servicioMin)))
  const horasAbierto = Math.max(0.1, (J.fin - J.inicio) / HORA)
  const lambdaObs = J.llegadas / horasAbierto
  const muObs = servicioProm > 0 ? 60 / servicioProm : null
  const teorico = mm1k({ lambda: estado.colas.lambda, mu: estado.colas.mu, K: estado.colas.K })

  // Escenario del día según clientes que llegaron vs lo esperado λ·horas
  const esperado = estado.colas.lambda * horasAbierto
  const z = (J.llegadas - esperado) / Math.sqrt(esperado)
  const escenario = z < -0.674 ? 0 : z > 0.674 ? 2 : 1

  // Consumo y demanda de insumos (demanda incluye lo que se habría usado en ventas perdidas)
  const insumos = estado.insumos.map((ins) => {
    const consumo = (estado.consumoVivo[ins.id] || 0) - (J.consumoInicial[ins.id] || 0)
    const extraPerdidas = productos.reduce((s, p) => {
      const r = productoPorId(p.id).receta.find((x) => x.insumoId === ins.id)
      return s + (r ? r.cantidad * p.perdidas : 0)
    }, 0)
    return {
      id: ins.id, nombre: ins.nombre, unidad: ins.unidad,
      stockInicial: J.stockInicial[ins.id], stockFinal: ins.stock,
      consumo, demanda: consumo + extraPerdidas,
      costoConsumo: consumo * ins.costo,
    }
  })

  const masVendido = productos.reduce((m, p) => (p.vendidas > m.vendidas ? p : m), productos[0])
  const masRentable = productos.reduce((m, p) => (p.utilidad > m.utilidad ? p : m), productos[0])
  const costoDesperdicio = J.desperdicio * (insumoPorId('croissant')?.costo ?? 0)

  return {
    dia: J.dia,
    fecha: J.inicio,
    inicio: J.inicio,
    cierre: J.cierreReal,
    horasAbierto,
    parcial: horasAbierto < estado.tienda.horas - 0.05,
    factorProyeccion: Math.max(1, estado.tienda.horas / horasAbierto),
    clientes: { llegaron: J.llegadas, atendidos: delDia.filter((p) => p.estado === 'ENTREGADO').length, rechazados: J.rechazados, perdidas: Object.values(J.perdidas).reduce((a, b) => a + b, 0) },
    productos,
    ingresos,
    costoInsumos: costo,
    utilidadBruta: ingresos - costo,
    croissants: { horneados: J.horneados, desperdicio: J.desperdicio, costoDesperdicio },
    utilidadNeta: ingresos - costo - costoDesperdicio,
    colas: {
      lambdaObs, muObs, servicioProm, esperaProm, sistemaProm, maxCola: J.maxCola,
      teorico: { Wq: teorico.Wq * 60, Ws: teorico.Ws * 60, Lq: teorico.Lq, PK: teorico.PK, lambda: estado.colas.lambda, mu: estado.colas.mu },
    },
    escenario: { indice: escenario, nombre: ESCENARIOS[escenario].nombre, z, esperado },
    insumos,
    pedidosColocados: J.pedidosColocados.map((p) => ({ ...p, nombre: insumoPorId(p.insumoId).nombre, unidad: insumoPorId(p.insumoId).unidad })),
    pedidosRecibidos: J.pedidosRecibidos.map((p) => ({ ...p, nombre: insumoPorId(p.insumoId).nombre, unidad: insumoPorId(p.insumoId).unidad })),
    masVendido: { id: masVendido.id, nombre: masVendido.nombre, emoji: masVendido.emoji, valor: masVendido.vendidas },
    masRentable: { id: masRentable.id, nombre: masRentable.nombre, emoji: masRentable.emoji, valor: masRentable.utilidad },
  }
}

/** Suma el día al historial y actualiza el árbol (pⱼ y unidades) y la demanda d de los insumos */
function actualizarModelos(rep) {
  const dec = estado.decisiones
  // Jornada parcial (cierre anticipado): la demanda se proyecta a la jornada completa
  const factor = rep.factorProyeccion
  const h = dec.historial[rep.escenario.indice]
  h.dias++
  for (const p of rep.productos) if (h.suma[p.id] !== undefined) h.suma[p.id] += p.demanda * factor
  const totalDias = dec.historial.reduce((s, e) => s + e.dias, 0)
  dec.probabilidades = dec.historial.map((e) => Math.round((e.dias / totalDias) * 1000) / 1000)
  // Ajuste para que Σp = 1 exacto
  const resto = Math.round((1 - dec.probabilidades.reduce((a, b) => a + b, 0)) * 1000) / 1000
  dec.probabilidades[1] = Math.round((dec.probabilidades[1] + resto) * 1000) / 1000
  for (const alt of dec.alternativas) {
    alt.unidades = dec.historial.map((e) => Math.round((e.suma[alt.productoId] / e.dias) * 10) / 10)
  }
  // Demanda diaria d: promedio con peso de 5 días para el valor inicial
  const PESO = 5
  const dias = estado.historialDias
  for (const ins of estado.insumos) {
    const suma = dias.reduce((s, r) => s + (r.insumos.find((x) => x.id === ins.id)?.demanda ?? 0) * (r.factorProyeccion ?? 1), 0)
    const d0 = ins.d0 ?? ins.d
    ins.d = Math.round(((PESO * d0 + suma) / (PESO + dias.length)) * 10) / 10
  }
  rep.probabilidades = [...dec.probabilidades]
}

function recomendacionVME() {
  const a = resolverArbol({
    alternativas: estado.decisiones.alternativas,
    productos: estado.productos,
    insumos: estado.insumos,
    probabilidades: estado.decisiones.probabilidades,
  })
  return { id: a.mejor.productoId, nombre: a.mejor.nombre, emoji: a.mejor.emoji, vme: a.mejor.vme, todas: a.ramas.map((r) => ({ nombre: r.nombre, vme: r.vme })) }
}

// ---------- Simulación instantánea de varios días ----------
export function simularDias(n = 7) {
  if (estado.tienda.abierta) cerrarTienda()
  ui.silencio = true
  let ultimo = null
  try {
    for (let k = 0; k < n; k++) {
      abrirTienda({ instantaneo: true })
      procesarHasta(estado.jornada.fin)
      if (estado.tienda.abierta) {
        estado.jornada.puertasCerradas = true
        procesarHasta(Infinity)
      }
      ultimo = estado.historialDias.at(-1)
    }
  } finally {
    ui.silencio = false
  }
  notificar(`✔ ${n} días simulados. Árbol de decisión y demanda actualizados.`, 'ok')
  if (ultimo) reporteAbierto.value = ultimo
}

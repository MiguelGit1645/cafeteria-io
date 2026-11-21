// =====================================================================
//  ESTADO GLOBAL (reactivo) sincronizado con localStorage
//  Une en tiempo real: Mostrador → Inventarios → Colas → Decisiones
// =====================================================================
import { reactive, computed, watch, watchEffect, ref } from 'vue'
import { crearEstadoInicial } from '../data/datosCafeteria.js'
import { analizarInsumo, necesitaReorden } from '../utils/inventarios.js'
import { estimarTasas, muestraExponencial } from '../utils/colas.js'

const CLAVE = 'cafeteria-io-v4'

function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && s.version === 4) return s
    }
  } catch (e) {
    /* localStorage no disponible */
  }
  return crearEstadoInicial()
}

export const estado = reactive(cargar())

watch(
  estado,
  (v) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(v))
    } catch (e) {
      /* ignorar */
    }
  },
  { deep: true },
)

// Fórmulas y cálculos: ocultos salvo que se activen (la clase va en <html> para alcanzar también las ventanas)
watchEffect(() => {
  document.documentElement.classList.toggle('ocultar-calculos', !estado.mostrarCalculos)
})

// ---------- Notificaciones (no persistentes) ----------
export const toasts = ref([])
// En simulaciones instantáneas (varios días) se silencian las notificaciones
export const ui = { silencio: false }
let toastId = 0
export function notificar(mensaje, tipo = 'info', duracion = 4500) {
  if (ui.silencio) return
  const id = ++toastId
  toasts.value.push({ id, mensaje, tipo })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, duracion)
}

// ---------- Reloj virtual ----------
// Avanza con el tiempo real y "salta" hacia adelante cuando se simulan llegadas/servicios.
export const tic = ref(Date.now())
setInterval(() => (tic.value = Date.now()), 250)
export function ahoraVirtual() {
  return Date.now() + estado.desfaseReloj
}
export const relojVirtual = computed(() => tic.value + estado.desfaseReloj)
export function avanzarRelojHasta(t) {
  const ahora = ahoraVirtual()
  if (t > ahora) estado.desfaseReloj += t - ahora
}

// ---------- Derivados ----------
export const insumoPorId = (id) => estado.insumos.find((i) => i.id === id)
export const productoPorId = (id) => estado.productos.find((p) => p.id === id)

export const pedidosEnCola = computed(() =>
  estado.pedidos.filter((p) => p.estado === 'EN_COLA').sort((a, b) => a.hora_llegada - b.hora_llegada),
)
export const pedidosEntregados = computed(() =>
  estado.pedidos.filter((p) => p.estado === 'ENTREGADO').sort((a, b) => b.hora_entrega - a.hora_entrega),
)

export const tasasHistorial = computed(() => estimarTasas(estado.pedidos))

/** λ y μ que usan los modelos de colas (en vivo desde el historial o manuales) */
export const tasasEnUso = computed(() => {
  const h = tasasHistorial.value
  const enVivo = estado.colas.fuente === 'historial'
  return {
    lambda: enVivo && h.lambda ? h.lambda : estado.colas.lambda,
    mu: enVivo && h.mu ? h.mu : estado.colas.mu,
    enVivo,
  }
})

export const insumosEnAlerta = computed(() =>
  estado.insumos
    // Con la tienda cerrada los perecederos están en 0 a propósito: se hornean al abrir
    .filter((i) => !(i.modelo === 'perecedero' && estado.historialDias?.length && !estado.tienda?.abierta))
    .filter((i) => necesitaReorden(i))
    .map((i) => ({ ...i, ...analizarInsumo(i) })),
)

export function disponible(producto, cantidad = 1) {
  return producto.receta.every((r) => {
    const ins = insumoPorId(r.insumoId)
    return ins && ins.stock >= r.cantidad * cantidad
  })
}

// Ganchos que otros módulos pueden registrar (p. ej. la reposición automática de la simulación)
export const hooks = { despuesDeVenta: null }

// ---------- Acciones del mostrador ----------

/** Registra un pedido EN_COLA, descuenta inventario según receta y dispara alertas de reorden */
export function registrarPedido(items, { hora = null, simulado = false } = {}) {
  items = items.filter((it) => it.cantidad > 0)
  if (!items.length) return { ok: false, motivo: 'El pedido está vacío' }

  // Capacidad finita K del local
  if (pedidosEnCola.value.length >= estado.colas.K) {
    estado.rechazados++
    notificar(`Local lleno (K = ${estado.colas.K}). Cliente rechazado.`, 'error')
    return { ok: false, motivo: 'Local lleno' }
  }

  // Requerimiento total de insumos
  const requerido = {}
  for (const it of items) {
    const prod = productoPorId(it.productoId)
    for (const r of prod.receta) requerido[r.insumoId] = (requerido[r.insumoId] || 0) + r.cantidad * it.cantidad
  }
  for (const [id, cant] of Object.entries(requerido)) {
    const ins = insumoPorId(id)
    if (!ins || ins.stock < cant) {
      notificar(`Stock insuficiente de ${ins?.nombre ?? id}`, 'error')
      return { ok: false, motivo: 'Stock insuficiente' }
    }
  }

  // Descuento automático + detección de cruce del punto de reorden
  const nuevasAlertas = []
  for (const [id, cant] of Object.entries(requerido)) {
    const ins = insumoPorId(id)
    const antes = necesitaReorden(ins)
    ins.stock = Math.round((ins.stock - cant) * 1000) / 1000
    estado.consumoVivo[id] = (estado.consumoVivo[id] || 0) + cant
    registrarMovimiento(id, ins.stock, 'venta', hora ?? ahoraVirtual())
    if (necesitaReorden(ins)) {
      const a = analizarInsumo(ins)
      nuevasAlertas.push({ ins, a, nueva: !antes })
    }
  }

  const total = items.reduce((s, it) => s + productoPorId(it.productoId).precio * it.cantidad, 0)
  const llegada = hora ?? ahoraVirtual()
  const pedido = {
    id: estado.siguienteId++,
    items: items.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })),
    total,
    estado: 'EN_COLA',
    hora_llegada: llegada,
    hora_entrega: null,
    simulado,
  }
  estado.pedidos.push(pedido)
  // Cada venta (manual o simulada) revisa si algún insumo llegó a su punto de reorden
  if (hooks.despuesDeVenta) hooks.despuesDeVenta(Object.keys(requerido), llegada)

  for (const { ins, a, nueva } of nuevasAlertas) {
    if (!nueva) continue
    if (a.R === null) notificar(`🥐 ${ins.nombre} agotado. Producir S* = ${a.Q} unid.`, 'alerta', 7000)
    else
      notificar(
        `⚠ ${ins.nombre}: stock ${fmt(ins.stock)} ${ins.unidad} ≤ R = ${fmt(a.R)}. Pedir Q* = ${fmt(a.Q)} ${ins.unidad}`,
        'alerta',
        8000,
      )
  }
  return { ok: true, pedido }
}

/** Marca un pedido como ENTREGADO guardando hora_entrega (actualiza λ y μ en vivo) */
export function entregarPedido(id, hora = null) {
  const p = estado.pedidos.find((x) => x.id === id)
  if (!p || p.estado !== 'EN_COLA') return
  const t = Math.max(hora ?? ahoraVirtual(), p.hora_llegada + 1000)
  avanzarRelojHasta(t)
  p.hora_entrega = t
  p.estado = 'ENTREGADO'
}

/** Edita manualmente el tiempo de servicio (min) de un pedido entregado */
export function editarServicio(id, minutos, inicio) {
  const p = estado.pedidos.find((x) => x.id === id)
  if (!p || !(minutos > 0)) return
  p.hora_entrega = inicio + minutos * 60000
}

// ---------- Simulación rápida para la defensa ----------
const MEZCLA = [
  ['latte', 0.4],
  ['capuccino', 0.3],
  ['mocha', 0.2],
  ['croissant', 0.1],
]
function productoAleatorio() {
  const candidatos = MEZCLA.filter(([id]) => disponible(productoPorId(id)))
  if (!candidatos.length) return null
  const total = candidatos.reduce((s, [, w]) => s + w, 0)
  let u = Math.random() * total
  for (const [id, w] of candidatos) {
    if ((u -= w) <= 0) return id
  }
  return candidatos[0][0]
}

/** Genera n llegadas con intervalos exponenciales de media 60/λ min (λ de referencia) */
export function simularLlegadas(n = 1) {
  let creados = 0
  for (let k = 0; k < n; k++) {
    const prod = productoAleatorio()
    if (!prod) {
      notificar('No hay insumos suficientes para simular más pedidos. Repón inventario.', 'error')
      break
    }
    const ultima = Math.max(...estado.pedidos.map((p) => p.hora_llegada), ahoraVirtual() - 3600000)
    const t = ultima + muestraExponencial(60 / estado.colas.lambda) * 60000
    avanzarRelojHasta(t)
    const r = registrarPedido([{ productoId: prod, cantidad: 1 }], { hora: t, simulado: true })
    if (r.ok) creados++
  }
  return creados
}

/** Atiende al primero en cola con un tiempo de servicio exponencial de media 60/μ min */
export function simularEntrega() {
  const p = pedidosEnCola.value[0]
  if (!p) {
    notificar('No hay pedidos en cola.', 'info')
    return
  }
  const ultimaEntrega = Math.max(0, ...estado.pedidos.filter((x) => x.hora_entrega).map((x) => x.hora_entrega))
  const inicio = Math.max(p.hora_llegada, ultimaEntrega)
  const t = inicio + Math.max(0.5, muestraExponencial(60 / estado.colas.mu)) * 60000
  entregarPedido(p.id, t)
}

// ---------- Inventario ----------
export function registrarMovimiento(id, stock, tipo, t) {
  if (!estado.movimientos) estado.movimientos = {}
  if (!estado.movimientos[id]) estado.movimientos[id] = []
  estado.movimientos[id].push({ t, stock, tipo })
  if (estado.movimientos[id].length > 300) estado.movimientos[id].shift()
}

export function reponer(id, cantidad) {
  const ins = insumoPorId(id)
  if (!ins) return
  if (ins.modelo === 'perecedero') ins.stock = Math.round(cantidad)
  else ins.stock = Math.round((ins.stock + cantidad) * 100) / 100
  registrarMovimiento(id, ins.stock, 'reposicion', ahoraVirtual())
  notificar(`✔ ${ins.nombre}: stock actualizado a ${fmt(ins.stock)} ${ins.unidad}`, 'ok')
}

// ---------- Reinicio ----------
export function reiniciarDemo() {
  const nuevo = crearEstadoInicial()
  for (const k of Object.keys(estado)) delete estado[k]
  Object.assign(estado, nuevo)
  try {
    localStorage.setItem(CLAVE, JSON.stringify(nuevo))
  } catch (e) {
    /* ignorar */
  }
  notificar('Demo reiniciada con los datos iniciales calibrados.', 'ok')
}

// ---------- Formato ----------
export function fmt(n, dec = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  if (!Number.isFinite(n)) return '∞'
  return Number(n).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: dec })
}
export function bs(n) {
  return 'Bs. ' + Number(n).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
/** Hora corta en formato 24 h (HH:MM) */
export function horaCorta(t) {
  if (!t) return '—'
  return new Date(t).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}
export function hora(t) {
  if (!t) return '—'
  return new Date(t).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
}

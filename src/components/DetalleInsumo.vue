<script setup>
// Ventana de detalle de un insumo: cuánto queda, gráfica de inventario y toda su teoría
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { X, PackagePlus, CalendarClock, TrendingDown } from 'lucide-vue-next'
import { estado, reponer, fmt, bs, hora } from '../store/useCafeteria.js'
import {
  clasificacionABC, eoqBasico, revisionContinua, unSoloPeriodo, costoEsperadoPeriodo,
  gananciaEsperadaPeriodo, analizarInsumo, TABLA_Z, curvasCostoEOQ,
} from '../utils/inventarios.js'
import GraficaInventario from './GraficaInventario.vue'

const props = defineProps({ insumoId: String })
const emit = defineEmits(['cerrar'])

const ins = computed(() => estado.insumos.find((i) => i.id === props.insumoId))
const a = computed(() => analizarInsumo(ins.value))
const nombresModelo = { estocastico: 'Revisión continua (estocástico)', eoq: 'EOQ básico', perecedero: 'Un solo periodo (perecedero)' }
const colorClase = { A: 'bg-espresso text-crema', B: 'bg-ambar text-espresso', C: 'bg-arena text-espresso' }
const filaABC = computed(() => {
  const abc = clasificacionABC(estado.insumos, estado.consumoVivo)
  const idx = abc.filas.findIndex((f) => f.id === props.insumoId)
  return { ...abc.filas[idx], posicion: idx + 1, total: abc.filas.length }
})
const nivelesServicio = Object.keys(TABLA_Z).map(Number).filter((v) => v >= 0.75)

// ---------- Estado del stock ----------
const enAlerta = computed(() => (a.value.R === null ? ins.value.stock <= 0 : ins.value.stock <= a.value.R))
const critico = computed(() => a.value.SS > 0 && ins.value.stock <= a.value.SS)
const diasCobertura = computed(() => ins.value.stock / ins.value.d)
const diasParaPedir = computed(() => (a.value.R === null ? null : Math.max(0, (ins.value.stock - a.value.R) / ins.value.d)))
const topeBarra = computed(() => Math.max(ins.value.stock, a.value.R ?? 0, a.value.Q ?? 0) * 1.1 || 1)

const cantidadManual = ref(null)
function recibir(c) {
  if (!(c > 0)) return
  reponer(ins.value.id, c)
  cantidadManual.value = null
}

// ---------- Cálculos por modelo ----------
const rc = computed(() => (ins.value.modelo === 'estocastico' ? revisionContinua(ins.value) : null))
const eq = computed(() => (ins.value.modelo === 'eoq' ? eoqBasico(ins.value) : null))

// EOQ: curvas de costo de ordenar, mantener y total
const curvaEOQ = computed(() => {
  if (!eq.value) return null
  const pts = curvasCostoEOQ(ins.value)
  const W = 360, H = 170, pad = 22
  const maxQ = pts.at(-1).Q
  const maxC = Math.min(Math.max(...pts.map((p) => p.total)), eq.value.costoTotal * 3)
  const sx = (q) => pad + (q / maxQ) * (W - 2 * pad)
  const sy = (c) => H - pad - (Math.min(c, maxC) / maxC) * (H - 2 * pad)
  const path = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.Q).toFixed(1)},${sy(p[k]).toFixed(1)}`).join(' ')
  return { W, H, pad, total: path('total'), mantener: path('mantener'), ordenar: path('ordenar'), xQ: sx(eq.value.Q) }
})

// Perecedero: curva de costo esperado y gráfica diaria
const per = computed(() => {
  if (ins.value.modelo !== 'perecedero') return null
  const par = { ...ins.value, c: ins.value.costo, I: ins.value.stock, Kprep: ins.value.Kprep || 0 }
  const r = unSoloPeriodo(par)
  const normal = ins.value.distribucion === 'normal'
  const lo = normal ? Math.max(0, ins.value.mu - 3 * ins.value.sigmaDemanda) : ins.value.a - 2
  const hi = normal ? ins.value.mu + 3 * ins.value.sigmaDemanda : ins.value.b + 2
  const pts = Array.from({ length: 61 }, (_, k) => {
    const S = lo + ((hi - lo) * k) / 60
    return { S, c: costoEsperadoPeriodo(S, par) }
  })
  const cw = 360, ch = 170, pad = 28
  const minC = Math.min(...pts.map((p) => p.c)), maxC = Math.max(...pts.map((p) => p.c))
  const sx = (S) => pad + ((S - lo) / (hi - lo)) * (cw - 2 * pad)
  const sy = (c) => ch - pad - ((c - minC) / (maxC - minC || 1)) * (ch - 2 * pad)
  const precio = estado.productos.find((p) => p.receta.some((x) => x.insumoId === ins.value.id))?.precio ?? ins.value.p
  // Demanda baja / media / alta del día
  const dBaja = normal ? ins.value.mu - ins.value.sigmaDemanda : ins.value.a
  const dMedia = normal ? ins.value.mu : (ins.value.a + ins.value.b) / 2
  const dAlta = normal ? ins.value.mu + ins.value.sigmaDemanda : ins.value.b
  return {
    r, par, lo, hi, cw, ch, pad, sx, sy, precio, dBaja, dMedia, dAlta,
    path: pts.map((p, k) => `${k ? 'L' : 'M'}${sx(p.S).toFixed(1)},${sy(p.c).toFixed(1)}`).join(' '),
    costo: costoEsperadoPeriodo(r.Sentero, par),
    ganancia: gananciaEsperadaPeriodo(r.Sentero, par, precio),
  }
})

// Gráfica diaria del perecedero: cada día se produce S* y se vende durante el día
const diaria = computed(() => {
  if (!per.value) return null
  const S = per.value.r.Sentero
  const W = 760, H = 260, M = { l: 50, r: 20, t: 20, b: 36 }
  const dias = 3
  const maxY = Math.max(S, ins.value.stock) * 1.2
  const minY = Math.min(0, S - per.value.dAlta) - 1
  const sx = (t) => M.l + (t / dias) * (W - M.l - M.r)
  const sy = (v) => H - M.b - ((v - minY) / (maxY - minY)) * (H - M.t - M.b)
  const tramos = Array.from({ length: dias }, (_, k) => ({
    k,
    x0: sx(k), x1: sx(k + 1) - 4,
    yS: sy(S),
    yBaja: sy(S - per.value.dBaja),
    yMedia: sy(S - per.value.dMedia),
    yAlta: sy(Math.max(S - per.value.dAlta, minY)),
  }))
  return { W, H, M, sx, sy, tramos, S, y0: sy(0), minY, maxY }
})

// ---------- Movimientos reales registrados ----------
const movs = computed(() => {
  const lista = (estado.movimientos?.[props.insumoId] ?? []).slice().sort((x, y) => x.t - y.t)
  if (!lista.length) return null
  const W = 760, H = 180, M = { l: 50, r: 20, t: 16, b: 30 }
  const t0 = lista[0].t
  const t1 = Math.max(lista.at(-1).t, t0 + 60000)
  const maxY = Math.max(...lista.map((m) => m.stock), a.value.R ?? 0) * 1.15 || 1
  const sx = (t) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r)
  const sy = (v) => H - M.b - (v / maxY) * (H - M.t - M.b)
  let d = ''
  lista.forEach((m, i) => {
    d += i ? ` L${sx(m.t).toFixed(1)},${sy(lista[i - 1].stock).toFixed(1)} L${sx(m.t).toFixed(1)},${sy(m.stock).toFixed(1)}` : `M${sx(m.t).toFixed(1)},${sy(m.stock).toFixed(1)}`
  })
  return { W, H, M, sx, sy, d, lista, t0, t1 }
})

function onKey(e) {
  if (e.key === 'Escape') emit('cerrar')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="fixed inset-0 z-40 bg-espresso/60 backdrop-blur-sm overflow-y-auto" @click.self="emit('cerrar')">
    <div v-if="ins" class="mx-auto my-6 max-w-5xl bg-crema rounded-3xl shadow-2xl border border-arena-300">
      <!-- Encabezado -->
      <div class="sticky top-0 z-10 bg-espresso text-crema rounded-t-3xl px-6 py-4 flex items-center gap-3">
        <div class="flex-1">
          <div class="text-xs text-arena-300">{{ nombresModelo[ins.modelo] }}</div>
          <h2 class="font-display text-2xl font-bold">{{ ins.nombre }}</h2>
        </div>
        <span class="text-xs font-bold rounded-lg px-2.5 py-1" :class="colorClase[filaABC.clase]">Clase {{ filaABC.clase }}</span>
        <button class="h-9 w-9 rounded-xl bg-espresso-700 hover:bg-espresso-500 grid place-items-center" title="Cerrar (Esc)" @click="emit('cerrar')"><X :size="18" /></button>
      </div>

      <div class="p-6 space-y-6">
        <!-- ¿Cuánto queda? -->
        <div class="grid md:grid-cols-3 gap-4">
          <div class="md:col-span-2 card p-5">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div class="label">Queda en inventario</div>
                <div class="font-display text-5xl font-bold num" :class="enAlerta ? 'text-alerta' : 'text-espresso'">
                  {{ fmt(ins.stock) }} <span class="text-xl">{{ ins.unidad }}</span>
                </div>
              </div>
              <span v-if="critico" class="text-xs font-bold text-white bg-red-700 rounded-lg px-3 py-1.5">CRÍTICO: usando inventario de seguridad</span>
              <span v-else-if="enAlerta" class="text-xs font-bold text-white bg-alerta rounded-lg px-3 py-1.5 pulso">
                {{ a.R === null ? 'AGOTADO' : 'REORDENAR AHORA' }}
              </span>
              <span v-else class="text-xs font-bold text-white bg-esmeralda rounded-lg px-3 py-1.5">NIVEL OK</span>
            </div>
            <!-- Barra -->
            <div class="mt-5">
              <div class="relative h-7 rounded-xl bg-arena overflow-hidden">
                <div v-if="a.SS > 0" class="absolute inset-y-0 left-0 bg-red-200" :style="{ width: (a.SS / topeBarra) * 100 + '%' }" />
                <div class="absolute inset-y-1.5 left-0 rounded-lg transition-all" :class="enAlerta ? 'bg-alerta' : 'bg-esmeralda'" :style="{ width: Math.min(100, (ins.stock / topeBarra) * 100) + '%' }" />
                <div v-if="a.R !== null" class="absolute inset-y-0 w-0.5 bg-espresso" :style="{ left: (a.R / topeBarra) * 100 + '%' }" />
              </div>
              <div class="relative h-5 text-[11px] text-espresso-500 mt-0.5">
                <span v-if="a.SS > 0" class="absolute -translate-x-1/2" :style="{ left: (a.SS / topeBarra) * 100 + '%' }">SS</span>
                <span v-if="a.R !== null" class="absolute -translate-x-1/2 font-bold text-espresso" :style="{ left: (a.R / topeBarra) * 100 + '%' }">R</span>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3 mt-2 text-sm">
              <div class="rounded-xl bg-crema border border-arena-300 p-3">
                <div class="label flex items-center gap-1"><CalendarClock :size="12" /> Alcanza para</div>
                <div class="num font-bold text-lg">{{ fmt(diasCobertura, 2) }} días</div>
                <div class="text-[11px] text-espresso-500 calc">stock / d = {{ fmt(ins.stock) }}/{{ ins.d }}</div>
              </div>
              <div class="rounded-xl bg-crema border border-arena-300 p-3">
                <div class="label flex items-center gap-1"><TrendingDown :size="12" /> {{ a.R === null ? 'Producción diaria' : 'Pedir en' }}</div>
                <div class="num font-bold text-lg">{{ a.R === null ? `${a.Q} unid` : diasParaPedir === 0 ? 'ya' : `${fmt(diasParaPedir, 2)} días` }}</div>
                <div class="text-[11px] text-espresso-500">{{ a.R === null ? 'cantidad óptima del día' : 'antes de llegar al punto de reorden' }}</div>
              </div>
              <div class="rounded-xl bg-crema border border-arena-300 p-3">
                <div class="label">Consumo en la demo</div>
                <div class="num font-bold text-lg">{{ fmt(estado.consumoVivo[ins.id] || 0) }} {{ ins.unidad }}</div>
                <div class="text-[11px] text-espresso-500">ventas registradas</div>
              </div>
            </div>
          </div>

          <!-- Acciones -->
          <div class="card p-5 flex flex-col gap-3">
            <div class="label">Reabastecer</div>
            <button v-if="ins.modelo !== 'perecedero'" class="btn-ok !py-3" @click="recibir(a.Q)">
              <PackagePlus :size="18" /> Recibir pedido de {{ fmt(a.Q, 0) }} {{ ins.unidad }}
            </button>
            <button v-else class="btn-ok !py-3" :disabled="!per.r.ordenar" @click="reponer(ins.id, ins.stock + per.r.ordenar)">
              <PackagePlus :size="18" /> {{ per.r.ordenar ? `Hornear ${per.r.ordenar} más` : 'No hace falta hornear' }}
            </button>
            <div class="text-xs text-espresso-500">
              {{ ins.modelo === 'perecedero'
                ? `Hay ${fmt(ins.stock)} disponibles (I). El nivel óptimo del día es ${per.r.Sentero}.`
                : 'Suma la cantidad óptima de pedido al stock.' }}
            </div>
            <div class="mt-auto">
              <div class="label">Otra cantidad</div>
              <div class="flex gap-2">
                <input v-model.number="cantidadManual" type="number" min="0" class="input" :placeholder="ins.unidad" />
                <button class="btn-primary" :disabled="!(cantidadManual > 0)" @click="ins.modelo === 'perecedero' ? (reponer(ins.id, ins.stock + cantidadManual), (cantidadManual = null)) : recibir(cantidadManual)">OK</button>
              </div>
            </div>
            <div class="rounded-xl bg-arena/70 p-3 text-xs num">
              ABC: puesto {{ filaABC.posicion }} de {{ filaABC.total }} · valor {{ bs(filaABC.valor) }} ·
              {{ fmt(filaABC.porcentaje, 2) }} % (acum. {{ fmt(filaABC.acumulado, 2) }} %)
            </div>
          </div>
        </div>

        <!-- ===================== Gráfica de inventario ===================== -->
        <div class="card p-5">
          <h3 class="card-title">Gráfica de inventario</h3>
          <template v-if="ins.modelo !== 'perecedero'">
            <p class="text-xs text-espresso-500 mt-1 mb-3">
              Proyección desde el stock actual con demanda d = {{ ins.d }} {{ ins.unidad }}/día: al tocar R se pide Q y llega
              tras L = {{ ins.tiempoEntrega }} días. <span class="text-ambar-600 font-semibold">▼ pedir</span> ·
              <span class="text-esmeralda-700 font-semibold">● llegada</span>
              <template v-if="a.SS > 0"> · <span class="text-alerta font-semibold">franja roja = inventario de seguridad</span></template>
            </p>
            <GraficaInventario :stock="ins.stock" :d="ins.d" :Q="a.Q" :R="a.R" :SS="a.SS || 0" :L="ins.tiempoEntrega" :unidad="ins.unidad" />
          </template>
          <template v-else>
            <p class="text-xs text-espresso-500 mt-1 mb-3">
              Cada mañana se producen S* = {{ diaria.S }}. Durante el día el inventario baja con la demanda:
              <span class="text-esmeralda-700 font-semibold">baja</span>,
              <span class="font-semibold">media</span> o
              <span class="text-alerta font-semibold">alta</span>. Lo que sobra al cierre se desperdicia; bajo 0 son ventas perdidas.
            </p>
            <svg :viewBox="`0 0 ${diaria.W} ${diaria.H}`" class="w-full" font-family="Inter, system-ui, sans-serif">
              <rect :x="diaria.M.l" :y="diaria.y0" :width="diaria.W - diaria.M.l - diaria.M.r" :height="diaria.sy(diaria.minY) - diaria.y0" fill="#FEE2E2" opacity=".6" />
              <line :x1="diaria.M.l" :x2="diaria.W - diaria.M.r" :y1="diaria.y0" :y2="diaria.y0" stroke="#2C1E16" />
              <text :x="diaria.M.l - 6" :y="diaria.y0 + 4" text-anchor="end" font-size="10" fill="#6b4f3f">0</text>
              <text :x="diaria.M.l - 6" :y="diaria.sy(diaria.S) + 4" text-anchor="end" font-size="10" fill="#6b4f3f">{{ diaria.S }}</text>
              <g v-for="t in diaria.tramos" :key="t.k">
                <line :x1="t.x0" :x2="t.x0" :y1="t.yS" :y2="diaria.y0" stroke="#10B981" stroke-width="3" />
                <polygon :points="`${t.x0},${t.yS} ${t.x1},${t.yBaja} ${t.x1},${t.yAlta}`" fill="#D4A24C" opacity=".18" />
                <line :x1="t.x0" :y1="t.yS" :x2="t.x1" :y2="t.yBaja" stroke="#047857" stroke-width="1.5" stroke-dasharray="4 3" />
                <line :x1="t.x0" :y1="t.yS" :x2="t.x1" :y2="t.yMedia" stroke="#2C1E16" stroke-width="2.5" />
                <line :x1="t.x0" :y1="t.yS" :x2="t.x1" :y2="t.yAlta" stroke="#C2410C" stroke-width="1.5" stroke-dasharray="4 3" />
                <text :x="(t.x0 + t.x1) / 2" :y="diaria.H - 10" text-anchor="middle" font-size="11" fill="#6b4f3f">Día {{ t.k + 1 }}</text>
              </g>
              <text :x="diaria.tramos[2].x1 - 4" :y="diaria.tramos[2].yBaja - 6" text-anchor="end" font-size="10" fill="#047857" font-weight="700">sobran {{ fmt(diaria.S - per.dBaja, 1) }}</text>
              <text :x="diaria.tramos[2].x1 - 4" :y="diaria.tramos[2].yAlta + 14" text-anchor="end" font-size="10" fill="#C2410C" font-weight="700">faltan {{ fmt(Math.max(0, per.dAlta - diaria.S), 1) }}</text>
              <text :x="diaria.tramos[0].x0 + 8" :y="diaria.tramos[0].yS - 6" font-size="11" fill="#047857" font-weight="700">Producir S* = {{ diaria.S }}</text>
            </svg>
          </template>
        </div>

        <!-- ===================== Teoría de inventarios ===================== -->
        <!-- Revisión continua -->
        <div v-if="rc" class="card p-5">
          <h3 class="card-title">Modelo estocástico de revisión continua</h3>
          <p class="text-xs text-espresso-500 mt-1 mb-4">
            Insumo principal con demanda variable. Cuando el inventario llega a R se pide Q; el inventario de seguridad cubre la variación de la demanda mientras llega el pedido.
            <span class="formula">Q = √(2dK/h)·√((p+h)/p)</span>
            <span class="formula ml-1">Normal: R = μ + K₁₋L·σ</span>
            <span class="formula ml-1">Uniforme: R = a + L(b − a)</span>
            <span class="formula ml-1">SS = R − μ</span>
          </p>
          <div class="grid lg:grid-cols-2 gap-6">
            <div class="grid grid-cols-3 gap-2 content-start">
              <label><span class="label">d (por día)</span><input v-model.number="ins.d" type="number" class="input" /></label>
              <label><span class="label">K (Bs./pedido)</span><input v-model.number="ins.K" type="number" class="input" /></label>
              <label><span class="label">h (Bs./u/día)</span><input v-model.number="ins.h" type="number" step="0.001" class="input" /></label>
              <label><span class="label">p (faltante)</span><input v-model.number="ins.p" type="number" step="0.001" class="input" /></label>
              <label><span class="label">Plazo de entrega (días)</span><input v-model.number="ins.tiempoEntrega" type="number" step="0.1" class="input" /></label>
              <label><span class="label">c (Bs./unidad)</span><input v-model.number="ins.costo" type="number" step="0.001" class="input" /></label>
              <label class="col-span-3"><span class="label">Demanda durante el plazo de entrega</span>
                <select v-model="ins.distribucionLT" class="input">
                  <option value="normal">Normal (μ = d · plazo, σ)</option>
                  <option value="uniforme">Uniforme (a, b)</option>
                </select>
              </label>
              <label v-if="ins.distribucionLT !== 'uniforme'"><span class="label">σ</span><input v-model.number="ins.sigma" type="number" class="input" /></label>
              <template v-else>
                <label><span class="label">a</span><input v-model.number="ins.aLT" type="number" class="input" /></label>
                <label><span class="label">b</span><input v-model.number="ins.bLT" type="number" class="input" /></label>
              </template>
              <label class="col-span-2"><span class="label">Nivel de servicio L</span>
                <select v-model.number="ins.nivelServicio" class="input">
                  <option v-for="l in nivelesServicio" :key="l" :value="l">{{ Math.round(l * 100) }} % sin faltantes (L = {{ l }})</option>
                </select>
              </label>
            </div>
            <div class="space-y-3">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="rounded-xl bg-espresso text-crema p-3">
                  <div class="text-[10px] uppercase tracking-wider text-arena-300">Q óptima</div>
                  <div class="font-display text-2xl font-bold num">{{ fmt(rc.Q, 1) }}</div>
                </div>
                <div class="rounded-xl bg-ambar p-3">
                  <div class="text-[10px] uppercase tracking-wider">Reorden R</div>
                  <div class="font-display text-2xl font-bold num">{{ fmt(rc.R, 2) }}</div>
                </div>
                <div class="rounded-xl bg-red-100 p-3">
                  <div class="text-[10px] uppercase tracking-wider">Seguridad SS</div>
                  <div class="font-display text-2xl font-bold num">{{ fmt(rc.SS, 2) }}</div>
                </div>
              </div>
              <ol class="calc rounded-xl bg-arena/70 p-4 text-xs num space-y-1.5 list-decimal list-inside">
                <li>√(2dK/h) = √(2·{{ ins.d }}·{{ ins.K }}/{{ ins.h }}) = <b>{{ fmt(rc.Qeoq, 2) }}</b></li>
                <li>√((p+h)/p) = √(({{ ins.p }}+{{ ins.h }})/{{ ins.p }}) = <b>{{ fmt(rc.factor, 4) }}</b> → Q = <b>{{ fmt(rc.Q, 2) }}</b></li>
                <template v-if="ins.distribucionLT !== 'uniforme'">
                  <li>μ = d · plazo = {{ ins.d }}·{{ ins.tiempoEntrega }} = <b>{{ fmt(rc.mu, 2) }}</b></li>
                  <li>L = {{ ins.nivelServicio }} → K₁₋L = <b>{{ rc.z }}</b> (tabla normal Z)</li>
                  <li>R = μ + K₁₋L·σ = {{ fmt(rc.mu, 2) }} + {{ rc.z }}·{{ ins.sigma }} = <b>{{ fmt(rc.R, 2) }}</b></li>
                  <li>SS = R − μ = K₁₋L·σ = <b>{{ fmt(rc.SS, 2) }}</b></li>
                </template>
                <template v-else>
                  <li>R = a + L(b − a) = {{ ins.aLT }} + {{ ins.nivelServicio }}·({{ ins.bLT }} − {{ ins.aLT }}) = <b>{{ fmt(rc.R, 2) }}</b></li>
                  <li>E(D) = (a + b)/2 = <b>{{ fmt(rc.mu, 2) }}</b></li>
                  <li>SS = R − E(D) = (L − ½)(b − a) = <b>{{ fmt(rc.SS, 2) }}</b></li>
                </template>
              </ol>
              <div class="text-sm rounded-xl p-3" :class="ins.stock <= rc.R ? 'bg-alerta/10 text-alerta' : 'bg-esmeralda/10 text-esmeralda-700'">
                Stock {{ fmt(ins.stock) }} {{ ins.stock <= rc.R ? '≤' : '>' }} R = {{ fmt(rc.R, 2) }} →
                <b>{{ ins.stock <= rc.SS ? 'se está consumiendo el inventario de seguridad, pedir ya' : ins.stock <= rc.R ? `pedir Q = ${fmt(rc.Q, 0)} ${ins.unidad}` : 'no es necesario pedir todavía' }}</b>
              </div>
            </div>
          </div>
        </div>

        <!-- EOQ -->
        <div v-if="eq" class="card p-5">
          <h3 class="card-title">Modelo EOQ básico (demanda constante)</h3>
          <p class="text-xs text-espresso-500 mt-1 mb-4">
            <span class="formula">Q* = √(2dK/h)</span>
            <span class="formula ml-1">N = d/Q*</span>
            <span class="formula ml-1">T = Q*/d</span>
            <span class="formula ml-1">CTU = Kd/Q* + hQ*/2</span>
            <span class="formula ml-1">R = d·L</span>
          </p>
          <div class="grid lg:grid-cols-2 gap-6">
            <div class="grid grid-cols-3 gap-2 content-start">
              <label><span class="label">d (por día)</span><input v-model.number="ins.d" type="number" class="input" /></label>
              <label><span class="label">K (Bs./pedido)</span><input v-model.number="ins.K" type="number" class="input" /></label>
              <label><span class="label">h (Bs./u/día)</span><input v-model.number="ins.h" type="number" step="0.001" class="input" /></label>
              <label><span class="label">Plazo de entrega (días)</span><input v-model.number="ins.tiempoEntrega" type="number" step="0.1" class="input" /></label>
              <label><span class="label">c (Bs./unidad)</span><input v-model.number="ins.costo" type="number" step="0.01" class="input" /></label>
              <div class="col-span-3 mt-2">
                <div class="label">Costos por día según el tamaño del pedido Q</div>
                <svg :viewBox="`0 0 ${curvaEOQ.W} ${curvaEOQ.H}`" class="w-full bg-white rounded-xl border border-arena-300" font-family="Inter, system-ui, sans-serif">
                  <path :d="curvaEOQ.total" fill="none" stroke="#2C1E16" stroke-width="2.5" />
                  <path :d="curvaEOQ.mantener" fill="none" stroke="#D4A24C" stroke-width="2" />
                  <path :d="curvaEOQ.ordenar" fill="none" stroke="#10B981" stroke-width="2" />
                  <line :x1="curvaEOQ.xQ" :x2="curvaEOQ.xQ" :y1="curvaEOQ.pad" :y2="curvaEOQ.H - curvaEOQ.pad" stroke="#2C1E16" stroke-dasharray="4 3" />
                  <text :x="curvaEOQ.xQ + 4" :y="curvaEOQ.H - curvaEOQ.pad - 4" font-size="10" font-weight="700" fill="#2C1E16">Q* = {{ fmt(eq.Q, 0) }}</text>
                  <text :x="curvaEOQ.W - curvaEOQ.pad" :y="curvaEOQ.pad + 2" text-anchor="end" font-size="10" fill="#2C1E16" font-weight="700">Total</text>
                  <text :x="curvaEOQ.W - curvaEOQ.pad" :y="curvaEOQ.pad + 14" text-anchor="end" font-size="10" fill="#B9852F" font-weight="700">Mantener</text>
                  <text :x="curvaEOQ.W - curvaEOQ.pad" :y="curvaEOQ.pad + 26" text-anchor="end" font-size="10" fill="#047857" font-weight="700">Ordenar</text>
                </svg>
                <p class="text-[11px] text-espresso-500 mt-1">El costo total es mínimo donde se cruzan el costo de ordenar y el de mantener.</p>
              </div>
            </div>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div class="rounded-xl bg-espresso text-crema p-3">
                  <div class="text-[10px] uppercase tracking-wider text-arena-300">Q* óptimo</div>
                  <div class="font-display text-2xl font-bold num">{{ fmt(eq.Q, 1) }}</div>
                </div>
                <div class="rounded-xl bg-ambar p-3">
                  <div class="text-[10px] uppercase tracking-wider">Reorden R</div>
                  <div class="font-display text-2xl font-bold num">{{ fmt(eq.R, 2) }}</div>
                </div>
              </div>
              <ol class="calc rounded-xl bg-arena/70 p-4 text-xs num space-y-1.5 list-decimal list-inside">
                <li>Q* = √(2·{{ ins.d }}·{{ ins.K }}/{{ ins.h }}) = <b>{{ fmt(eq.Q, 2) }}</b></li>
                <li>N = {{ ins.d }}/{{ fmt(eq.Q, 2) }} = <b>{{ fmt(eq.pedidosPorDia, 4) }}</b> pedidos/día</li>
                <li>T = {{ fmt(eq.Q, 2) }}/{{ ins.d }} = <b>{{ fmt(eq.ciclo, 2) }}</b> días entre pedidos</li>
                <li>Costo ordenar = {{ ins.K }}·{{ ins.d }}/{{ fmt(eq.Q, 2) }} = <b>{{ bs(eq.costoOrdenar) }}</b>/día</li>
                <li>Costo mantener = {{ ins.h }}·{{ fmt(eq.Q, 2) }}/2 = <b>{{ bs(eq.costoMantener) }}</b>/día</li>
                <li>CTU = <b>{{ bs(eq.costoTotal) }}</b>/día · R = {{ ins.d }}·{{ ins.tiempoEntrega }} = <b>{{ fmt(eq.R, 2) }}</b></li>
              </ol>
            </div>
          </div>
        </div>

        <!-- Un solo periodo -->
        <div v-if="per" class="card p-5">
          <h3 class="card-title">Modelo estocástico de un solo periodo</h3>
          <p class="text-xs text-espresso-500 mt-1 mb-4">
            Producto perecedero: lo que no se vende hoy se pierde. Se elige la cantidad que maximiza la ganancia esperada.
            <span class="formula">F(S*) = (p − c)/(p + h)</span>
            <span class="formula ml-1">Uniforme: S* = a + F·(b − a)</span>
            <span class="formula ml-1">Normal: S* = μ + z·σ</span>
          </p>
          <div class="grid lg:grid-cols-3 gap-6">
            <div class="grid grid-cols-3 gap-2 content-start">
              <label><span class="label">p (faltante)</span><input v-model.number="ins.p" type="number" step="0.5" class="input" /></label>
              <label><span class="label">c (costo)</span><input v-model.number="ins.costo" type="number" step="0.1" class="input" /></label>
              <label><span class="label">h (sobrante − rescate)</span><input v-model.number="ins.h" type="number" step="0.1" class="input" /></label>
              <label><span class="label">K preparación</span><input v-model.number="ins.Kprep" type="number" min="0" step="0.5" class="input" /></label>
              <div class="col-span-2 rounded-lg bg-arena/60 px-3 py-1.5 text-xs">
                <div class="label !mb-0">Inventario inicial I</div>
                <span class="num font-bold">{{ fmt(ins.stock) }}</span> unid (stock actual)
              </div>
              <label class="col-span-3"><span class="label">Distribución de la demanda diaria</span>
                <select v-model="ins.distribucion" class="input">
                  <option value="uniforme">Uniforme (a, b)</option>
                  <option value="normal">Normal (μ, σ)</option>
                </select>
              </label>
              <template v-if="ins.distribucion === 'uniforme'">
                <label><span class="label">a</span><input v-model.number="ins.a" type="number" class="input" /></label>
                <label><span class="label">b</span><input v-model.number="ins.b" type="number" class="input" /></label>
              </template>
              <template v-else>
                <label><span class="label">μ</span><input v-model.number="ins.mu" type="number" class="input" /></label>
                <label><span class="label">σ</span><input v-model.number="ins.sigmaDemanda" type="number" class="input" /></label>
              </template>
            </div>
            <div class="space-y-3">
              <div class="calc rounded-xl bg-arena/70 p-3 num text-xs space-y-1">
                <div>F(S*) = ({{ ins.p }} − {{ ins.costo }}) / ({{ ins.p }} + {{ ins.h }}) = <b>{{ fmt(per.r.ratio, 4) }}</b></div>
                <div v-if="ins.Kprep > 0">C(s*) = K + C(S*) → s* = <b>{{ fmt(per.r.sMin, 2) }}</b></div>
                <div>I = {{ fmt(ins.stock) }} {{ ins.stock < (ins.Kprep > 0 ? per.r.sMin : per.r.S) ? '<' : '≥' }} {{ ins.Kprep > 0 ? 's*' : 'S*' }} → {{ per.r.ordenar ? `ordenar S* − I = ${per.r.ordenar}` : 'no ordenar' }}</div>
                <div v-if="ins.distribucion === 'uniforme'">S* = {{ ins.a }} + {{ fmt(per.r.ratio, 4) }}·({{ ins.b }} − {{ ins.a }}) = <b>{{ fmt(per.r.S, 2) }}</b></div>
                <div v-else>z = Φ⁻¹({{ fmt(per.r.ratio, 4) }}) = {{ fmt(per.r.z, 4) }} → S* = {{ ins.mu }} + {{ fmt(per.r.z, 4) }}·{{ ins.sigmaDemanda }} = <b>{{ fmt(per.r.S, 2) }}</b></div>
              </div>
              <div class="rounded-xl bg-espresso text-crema p-4">
                <div class="text-[10px] uppercase tracking-wider text-arena-300">Nivel óptimo del día S*</div>
                <div class="font-display text-3xl font-bold num">{{ per.r.Sentero }} <span class="text-base">unid</span></div>
                <div class="text-sm mt-1">
                  {{ per.r.ordenar ? `Hornear hoy: ${per.r.ordenar} (S* − I)` : 'Con el inventario actual no conviene hornear más' }}
                </div>
                <div v-if="ins.Kprep > 0" class="text-xs text-arena-300 num">Hornear solo si quedan menos de s* = {{ fmt(per.r.sMin, 1) }}</div>
                <div class="text-xs text-arena-300 mt-1 num">Ganancia esperada ≈ {{ bs(per.ganancia) }}/día · costo esperado {{ bs(per.costo) }}</div>
              </div>
            </div>
            <div>
              <div class="label">Costo esperado E[C(S)]</div>
              <svg :viewBox="`0 0 ${per.cw} ${per.ch}`" class="w-full bg-white rounded-xl border border-arena-300" font-family="Inter, system-ui, sans-serif">
                <path :d="per.path" fill="none" stroke="#2C1E16" stroke-width="2" />
                <line :x1="per.sx(per.r.S)" :x2="per.sx(per.r.S)" :y1="per.pad / 2" :y2="per.ch - per.pad" stroke="#10B981" stroke-dasharray="4 3" stroke-width="1.5" />
                <circle :cx="per.sx(per.r.S)" :cy="per.sy(costoEsperadoPeriodo(per.r.S, per.par))" r="4.5" fill="#10B981" />
                <text :x="per.sx(per.r.S) + 6" :y="per.pad" font-size="10" fill="#047857" font-weight="700">S* = {{ fmt(per.r.S, 2) }}</text>
                <text :x="per.pad" :y="per.ch - 8" font-size="9" fill="#6b4f3f">{{ fmt(per.lo, 0) }}</text>
                <text :x="per.cw - per.pad" :y="per.ch - 8" font-size="9" fill="#6b4f3f" text-anchor="end">{{ fmt(per.hi, 0) }}</text>
              </svg>
              <p class="text-[11px] text-espresso-500 mt-1">El mínimo del costo esperado es el máximo de la ganancia esperada.</p>
            </div>
          </div>
        </div>

        <!-- ===================== Movimientos reales ===================== -->
        <div v-if="movs" class="card p-5">
          <h3 class="card-title">Movimientos registrados en la demo</h3>
          <p class="text-xs text-espresso-500 mt-1 mb-3">Stock real tras cada venta del mostrador (●) y cada reposición (▲).</p>
          <div v-if="movs.lista.length < 2" class="text-sm text-espresso-500 py-4">Aún no hay ventas de este insumo. Registra pedidos en el Mostrador.</div>
          <svg v-else :viewBox="`0 0 ${movs.W} ${movs.H}`" class="w-full" font-family="Inter, system-ui, sans-serif">
            <line :x1="movs.M.l" :x2="movs.W - movs.M.r" :y1="movs.sy(0)" :y2="movs.sy(0)" stroke="#2C1E16" />
            <template v-if="a.R !== null">
              <line :x1="movs.M.l" :x2="movs.W - movs.M.r" :y1="movs.sy(a.R)" :y2="movs.sy(a.R)" stroke="#D4A24C" stroke-dasharray="6 4" stroke-width="1.5" />
              <text :x="movs.W - movs.M.r" :y="movs.sy(a.R) - 4" text-anchor="end" font-size="10" fill="#B9852F" font-weight="700">R</text>
            </template>
            <path :d="movs.d" fill="none" stroke="#2C1E16" stroke-width="2" />
            <template v-for="(m, i) in movs.lista" :key="i">
              <polygon v-if="m.tipo === 'reposicion'" :points="`${movs.sx(m.t) - 5},${movs.sy(m.stock) + 4} ${movs.sx(m.t) + 5},${movs.sy(m.stock) + 4} ${movs.sx(m.t)},${movs.sy(m.stock) - 5}`" fill="#10B981" />
              <circle v-else :cx="movs.sx(m.t)" :cy="movs.sy(m.stock)" r="3" :fill="a.R !== null && m.stock <= a.R ? '#C2410C' : '#2C1E16'" />
            </template>
            <text :x="movs.M.l" :y="movs.H - 8" font-size="10" fill="#6b4f3f" font-family="JetBrains Mono">{{ hora(movs.t0) }}</text>
            <text :x="movs.W - movs.M.r" :y="movs.H - 8" text-anchor="end" font-size="10" fill="#6b4f3f" font-family="JetBrains Mono">{{ hora(movs.t1) }}</text>
            <text :x="movs.M.l - 6" :y="movs.sy(movs.lista[0].stock) + 4" text-anchor="end" font-size="10" fill="#6b4f3f" font-family="JetBrains Mono">{{ fmt(movs.lista[0].stock, 0) }}</text>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Ventana con el reporte de una jornada cerrada
import { computed, onMounted, onUnmounted } from 'vue'
import { X, TrendingUp, Trophy, Coins, GitBranch, Users, Timer, Truck, Package } from 'lucide-vue-next'
import { estado, fmt, bs, hora, horaCorta } from '../store/useCafeteria.js'
import { analizarInsumo } from '../utils/inventarios.js'
import { ESCENARIOS } from '../data/datosCafeteria.js'

const props = defineProps({ reporte: Object })
const emit = defineEmits(['cerrar', 'ir'])
const r = computed(() => props.reporte)

const maxDemanda = computed(() => Math.max(1, ...r.value.productos.map((p) => p.demanda)))
const colorEscenario = ['bg-arena text-espresso', 'bg-ambar text-espresso', 'bg-esmeralda text-white']
const fecha = (t) => new Date(t).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })

// Qué tener en stock: con la demanda d ya actualizada por el historial
const stockSugerido = computed(() =>
  estado.insumos.map((i) => {
    const a = analizarInsumo(i)
    return { ...i, ...a, bajoR: a.R !== null && i.stock <= a.R }
  }),
)
const coincide = computed(() => r.value.masVendido.id === r.value.recomendacion?.id)

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
    <div class="mx-auto my-6 max-w-5xl bg-crema rounded-3xl shadow-2xl border border-arena-300">
      <!-- Encabezado -->
      <div class="sticky top-0 z-10 bg-espresso text-crema rounded-t-3xl px-6 py-4 flex items-center gap-3">
        <div class="flex-1">
          <div class="text-xs text-arena-300 capitalize">{{ fecha(r.fecha) }} · {{ horaCorta(r.inicio) }} – {{ horaCorta(r.cierre) }}</div>
          <h2 class="font-display text-2xl font-bold">Reporte del Día {{ r.dia }}</h2>
        </div>
        <span class="text-xs font-bold rounded-lg px-2.5 py-1" :class="colorEscenario[r.escenario.indice]">{{ r.escenario.nombre }}</span>
        <button class="h-9 w-9 rounded-xl bg-espresso-700 hover:bg-espresso-500 grid place-items-center" title="Cerrar (Esc)" @click="emit('cerrar')"><X :size="18" /></button>
      </div>

      <div class="p-6 space-y-6">
        <div v-if="r.parcial" class="rounded-xl bg-ambar/20 border border-ambar px-4 py-2.5 text-sm">
          Jornada parcial: la tienda estuvo abierta {{ fmt(r.horasAbierto, 1) }} h de {{ estado.tienda.horas }} h.
          Para el historial, la demanda se proyectó a la jornada completa (× {{ fmt(r.factorProyeccion, 2) }}).
        </div>

        <!-- KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="card p-4">
            <div class="label">Ingresos</div>
            <div class="font-display text-2xl font-bold num">{{ bs(r.ingresos) }}</div>
          </div>
          <div class="card p-4">
            <div class="label">Utilidad del día</div>
            <div class="font-display text-2xl font-bold num text-esmeralda-700">{{ bs(r.utilidadNeta) }}</div>
            <div class="text-[11px] text-espresso-500">ingresos − insumos − desperdicio</div>
          </div>
          <div class="card p-4">
            <div class="label">Clientes atendidos</div>
            <div class="font-display text-2xl font-bold num">{{ r.clientes.atendidos }} <span class="text-sm text-espresso-500">de {{ r.clientes.llegaron }}</span></div>
            <div class="text-[11px] text-espresso-500">{{ r.clientes.rechazados }} por local lleno · {{ r.clientes.perdidas }} sin producto</div>
          </div>
          <div class="card p-4">
            <div class="label">Croissants</div>
            <div class="font-display text-2xl font-bold num">{{ r.croissants.horneados }} <span class="text-sm text-espresso-500">horneados</span></div>
            <div class="text-[11px] text-espresso-500">{{ r.croissants.desperdicio }} desperdiciados ({{ bs(r.croissants.costoDesperdicio) }})</div>
          </div>
        </div>

        <!-- Conclusiones -->
        <div class="grid md:grid-cols-3 gap-4">
          <div class="card p-5">
            <div class="label flex items-center gap-1"><TrendingUp :size="13" /> Más vendido</div>
            <div class="font-display text-xl font-bold">{{ r.masVendido.emoji }} {{ r.masVendido.nombre }}</div>
            <div class="text-sm text-espresso-500 num">{{ r.masVendido.valor }} unidades</div>
          </div>
          <div class="card p-5">
            <div class="label flex items-center gap-1"><Coins :size="13" /> Más rentable del día</div>
            <div class="font-display text-xl font-bold">{{ r.masRentable.emoji }} {{ r.masRentable.nombre }}</div>
            <div class="text-sm text-espresso-500 num">{{ bs(r.masRentable.valor) }} de utilidad</div>
          </div>
          <div class="rounded-2xl bg-esmeralda text-white p-5">
            <div class="text-[11px] font-semibold opacity-90 flex items-center gap-1"><Trophy :size="13" /> Recomendación para mañana (VME)</div>
            <div class="font-display text-xl font-bold">{{ r.recomendacion?.emoji }} {{ r.recomendacion?.nombre }}</div>
            <div class="text-sm opacity-90 num">VME = {{ bs(r.recomendacion?.vme ?? 0) }}</div>
          </div>
        </div>
        <p class="text-sm text-espresso-700 -mt-2 px-1">
          <template v-if="coincide">El producto más vendido coincide con el que más ganancia esperada da con todo el historial.</template>
          <template v-else>
            El más vendido hoy no es necesariamente el que conviene: el árbol de decisión recomienda
            <b>{{ r.recomendacion?.nombre }}</b> porque, con todos los días del historial, es el que da mayor ganancia esperada (VME).
          </template>
        </p>

        <!-- Demanda por producto -->
        <div class="card p-5">
          <h3 class="card-title mb-1">Demanda por producto</h3>
          <p class="text-xs text-espresso-500 mb-4">Demanda = unidades vendidas + ventas perdidas por falta de insumos.</p>
          <div class="grid lg:grid-cols-2 gap-6 items-center">
            <div class="space-y-3">
              <div v-for="p in r.productos" :key="p.id">
                <div class="flex justify-between text-sm mb-1">
                  <span>{{ p.emoji }} {{ p.nombre }}</span>
                  <span class="num"><b>{{ p.demanda }}</b> <span class="text-espresso-500 text-xs">({{ p.vendidas }} vendidas<template v-if="p.perdidas"> · {{ p.perdidas }} perdidas</template>)</span></span>
                </div>
                <div class="h-4 rounded-full bg-arena overflow-hidden flex">
                  <div class="h-full bg-espresso" :style="{ width: (p.vendidas / maxDemanda) * 100 + '%' }" />
                  <div class="h-full bg-alerta" :style="{ width: (p.perdidas / maxDemanda) * 100 + '%' }" />
                </div>
              </div>
              <div class="flex gap-4 text-[11px] text-espresso-500">
                <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-espresso"></span> vendidas</span>
                <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-alerta"></span> perdidas</span>
              </div>
            </div>
            <table class="tabla">
              <thead><tr><th>Producto</th><th class="text-right">Vendidas</th><th class="text-right">Ingresos</th><th class="text-right">Utilidad</th></tr></thead>
              <tbody>
                <tr v-for="p in r.productos" :key="p.id">
                  <td>{{ p.emoji }} {{ p.nombre }}</td>
                  <td class="text-right num">{{ p.vendidas }}</td>
                  <td class="text-right num">{{ bs(p.ingresos) }}</td>
                  <td class="text-right num">{{ bs(p.utilidad) }}</td>
                </tr>
                <tr class="font-semibold">
                  <td>Total</td>
                  <td class="text-right num">{{ r.productos.reduce((s, p) => s + p.vendidas, 0) }}</td>
                  <td class="text-right num">{{ bs(r.ingresos) }}</td>
                  <td class="text-right num">{{ bs(r.utilidadBruta) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Colas: real vs teoría -->
        <div class="card p-5">
          <h3 class="card-title mb-1 flex items-center gap-2"><Users :size="18" /> Atención en el mostrador: simulación vs. modelo M/M/1/K</h3>
          <p class="text-xs text-espresso-500 mb-4">
            Lo que pasó en el día comparado con lo que predice la teoría de colas con λ = {{ r.colas.teorico.lambda }} y μ = {{ r.colas.teorico.mu }} clientes/h.
          </p>
          <div class="overflow-x-auto">
            <table class="tabla">
              <thead><tr><th>Medida</th><th class="text-right">Día simulado</th><th class="text-right">Modelo M/M/1/K</th></tr></thead>
              <tbody>
                <tr><td>Tasa de llegada (λ), cl/h</td><td class="text-right num">{{ fmt(r.colas.lambdaObs, 2) }}</td><td class="text-right num">{{ fmt(r.colas.teorico.lambda, 2) }}</td></tr>
                <tr><td>Tasa de servicio (μ), cl/h</td><td class="text-right num">{{ fmt(r.colas.muObs, 2) }}</td><td class="text-right num">{{ fmt(r.colas.teorico.mu, 2) }}</td></tr>
                <tr><td>Tiempo promedio de espera en cola (Wq), min</td><td class="text-right num font-semibold">{{ fmt(r.colas.esperaProm, 2) }}</td><td class="text-right num">{{ fmt(r.colas.teorico.Wq, 2) }}</td></tr>
                <tr><td>Tiempo promedio en el sistema (Ws), min</td><td class="text-right num font-semibold">{{ fmt(r.colas.sistemaProm, 2) }}</td><td class="text-right num">{{ fmt(r.colas.teorico.Ws, 2) }}</td></tr>
                <tr><td>Tiempo promedio de servicio, min</td><td class="text-right num">{{ fmt(r.colas.servicioProm, 2) }}</td><td class="text-right num">{{ fmt(60 / r.colas.teorico.mu, 2) }}</td></tr>
                <tr><td>Clientes rechazados por local lleno</td><td class="text-right num">{{ r.clientes.rechazados }} de {{ r.clientes.llegaron }}</td><td class="text-right num">{{ fmt(r.colas.teorico.PK * 100, 2) }} % esperado</td></tr>
                <tr><td>Fila más larga del día</td><td class="text-right num">{{ r.colas.maxCola }} clientes</td><td class="text-right num">máx. K = {{ estado.colas.K }}</td></tr>
              </tbody>
            </table>
          </div>
          <p class="text-[11px] text-espresso-500 mt-2">
            El modelo describe el régimen estable; en un día real la tienda abre vacía, por eso la espera simulada suele salir algo menor que la teórica.
          </p>
        </div>

        <!-- Inventario -->
        <div class="card p-5">
          <h3 class="card-title mb-4 flex items-center gap-2"><Package :size="18" /> Inventario del día</h3>
          <div class="grid lg:grid-cols-2 gap-6">
            <table class="tabla">
              <thead><tr><th>Insumo</th><th class="text-right">Inicio</th><th class="text-right">Consumo</th><th class="text-right">Cierre</th></tr></thead>
              <tbody>
                <tr v-for="i in r.insumos" :key="i.id">
                  <td>{{ i.nombre }}</td>
                  <td class="text-right num">{{ fmt(i.stockInicial, 0) }}</td>
                  <td class="text-right num">{{ fmt(i.consumo, 0) }} <span class="text-[10px] text-espresso-500">{{ i.unidad }}</span></td>
                  <td class="text-right num">{{ fmt(i.stockFinal, 0) }}</td>
                </tr>
              </tbody>
            </table>
            <div class="space-y-4">
              <div>
                <div class="label flex items-center gap-1"><Truck :size="12" /> Pedidos automáticos al proveedor (stock ≤ R)</div>
                <div v-if="!r.pedidosColocados.length" class="text-sm text-espresso-500">Ninguno.</div>
                <ul class="text-sm space-y-1">
                  <li v-for="(p, k) in r.pedidosColocados" :key="k" class="num">
                    {{ horaCorta(p.colocado) }} · {{ p.nombre }}: pedir {{ fmt(p.cantidad, 0) }} {{ p.unidad }}
                    <span class="text-espresso-500 text-xs">(llega {{ horaCorta(p.llegada) }}<template v-if="p.llegada > r.cierre"> del día siguiente</template>)</span>
                  </li>
                </ul>
              </div>
              <div>
                <div class="label">Pedidos recibidos</div>
                <div v-if="!r.pedidosRecibidos.length" class="text-sm text-espresso-500">Ninguno.</div>
                <ul class="text-sm space-y-1">
                  <li v-for="(p, k) in r.pedidosRecibidos" :key="k" class="num">{{ horaCorta(p.llegada) }} · {{ p.nombre }}: +{{ fmt(p.cantidad, 0) }} {{ p.unidad }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="mt-5">
            <div class="label">Qué tener en stock (con la demanda actualizada del historial)</div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1">
              <div v-for="i in stockSugerido" :key="i.id" class="rounded-xl border px-3 py-2 text-xs" :class="i.bajoR ? 'border-alerta bg-alerta/5' : 'border-arena-300 bg-crema'">
                <div class="font-semibold text-sm">{{ i.nombre }}</div>
                <div class="num text-espresso-700">
                  Demanda {{ fmt(i.d, 1) }} {{ i.unidad }}/día ·
                  <template v-if="i.R !== null">pedir {{ fmt(i.Q, 0) }} al llegar a {{ fmt(i.R, 0) }}</template>
                  <template v-else>hornear {{ i.Q }} por día</template>
                </div>
                <div v-if="i.bajoR" class="text-alerta font-semibold">Hoy cierra bajo el punto de reorden</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Historial / árbol -->
        <div class="rounded-2xl bg-espresso text-crema p-5 flex flex-wrap items-center gap-4">
          <GitBranch :size="22" class="text-ambar" />
          <div class="flex-1 min-w-60 text-sm">
            Este día llegaron {{ r.clientes.llegaron }} clientes (se esperaban {{ fmt(r.escenario.esperado, 0) }}), así que se registró como
            <b>{{ r.escenario.nombre.toLowerCase() }}</b> y se sumó al historial. Probabilidades actualizadas:
            <span class="num">{{ ESCENARIOS.map((e, j) => `${e.nombre.replace('Demanda ', '')} ${fmt(r.probabilidades?.[j] ?? 0, 2)}`).join(' · ') }}</span>.
          </div>
          <button class="btn-ambar" @click="emit('ir', 'decisiones')">Ver árbol de decisión</button>
        </div>
      </div>
    </div>
  </div>
</template>

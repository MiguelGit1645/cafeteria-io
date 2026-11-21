<script setup>
// Operación de la tienda (abrir/cerrar, simular días) e historial de reportes
import { computed } from 'vue'
import { Store, FastForward, CalendarDays, Settings2, BarChart3 } from 'lucide-vue-next'
import { estado, fmt, bs } from '../store/useCafeteria.js'
import { abrirTienda, cerrarTienda, simularDias, reporteAbierto } from '../store/simulacion.js'

const H = computed(() => estado.historialDias.slice().reverse())
const colorEscenario = ['bg-arena text-espresso', 'bg-ambar text-espresso', 'bg-esmeralda text-white']
const fechaCorta = (t) => new Date(t).toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' })

// Mezcla de productos en %
const sumaMezcla = computed(() => Object.values(estado.tienda.mezcla).reduce((a, b) => a + (Number(b) || 0), 0))

// Acumulados del historial
const acumulado = computed(() => {
  const dias = estado.historialDias
  if (!dias.length) return null
  const porProducto = estado.productos.map((p) => {
    const filas = dias.map((r) => r.productos.find((x) => x.id === p.id))
    const vendidas = filas.reduce((s, f) => s + (f?.vendidas ?? 0), 0)
    const demanda = filas.reduce((s, f) => s + (f?.demanda ?? 0), 0)
    const utilidad = filas.reduce((s, f) => s + (f?.utilidad ?? 0), 0)
    return { ...p, vendidas, demanda, utilidad, demandaDia: demanda / dias.length }
  })
  const maxD = Math.max(1, ...porProducto.map((p) => p.demandaDia))
  return {
    dias: dias.length,
    ingresos: dias.reduce((s, r) => s + r.ingresos, 0),
    utilidad: dias.reduce((s, r) => s + r.utilidadNeta, 0),
    clientes: dias.reduce((s, r) => s + r.clientes.llegaron, 0),
    porProducto,
    maxD,
    masVendido: porProducto.reduce((m, p) => (p.vendidas > m.vendidas ? p : m)),
    masRentable: porProducto.reduce((m, p) => (p.utilidad > m.utilidad ? p : m)),
    recomendacion: dias.at(-1).recomendacion,
  }
})

// Gráfica: utilidad por día
const grafica = computed(() => {
  const dias = estado.historialDias.slice(-20)
  if (!dias.length) return null
  const W = 720, Hh = 200, M = { l: 50, r: 16, t: 16, b: 30 }
  const maxU = Math.max(...dias.map((r) => r.utilidadNeta), 1) * 1.15
  const banda = (W - M.l - M.r) / dias.length
  const sy = (v) => Hh - M.b - (Math.max(0, v) / maxU) * (Hh - M.t - M.b)
  return {
    W, Hh, M, maxU, sy,
    barras: dias.map((r, i) => ({ r, x: M.l + i * banda + banda * 0.15, w: banda * 0.7, y: sy(r.utilidadNeta), cx: M.l + i * banda + banda / 2 })),
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Operación -->
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="card-title flex items-center gap-2"><Store :size="18" /> Operación de la tienda</h2>
          <p class="text-xs text-espresso-500 mt-1">
            Al abrir, los clientes llegan solos, piden y el barista los atiende en orden. Al cerrar se genera el reporte del día y se actualizan el árbol de decisión y la demanda de los insumos.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-if="!estado.tienda.abierta" class="btn-ok !py-2.5" @click="abrirTienda()"><Store :size="16" /> Abrir tienda</button>
          <button v-else class="btn !py-2.5 bg-alerta text-white hover:bg-red-700" @click="cerrarTienda()"><Store :size="16" /> Cerrar tienda</button>
          <button class="btn-ghost" :disabled="estado.tienda.abierta" @click="simularDias(1)"><FastForward :size="16" /> Simular 1 día</button>
          <button class="btn-primary" :disabled="estado.tienda.abierta" @click="simularDias(7)"><CalendarDays :size="16" /> Simular semana</button>
        </div>
      </div>

      <details class="mt-4 rounded-xl bg-arena/50 px-4 py-3">
        <summary class="cursor-pointer text-sm font-semibold flex items-center gap-1.5"><Settings2 :size="15" /> Configuración de la jornada</summary>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <label><span class="label">Hora de apertura</span>
            <input v-model.number="estado.tienda.horaApertura" type="number" min="5" max="12" class="input" :disabled="estado.tienda.abierta" />
          </label>
          <label><span class="label">Horas de atención</span>
            <input v-model.number="estado.tienda.horas" type="number" min="1" max="14" class="input" :disabled="estado.tienda.abierta" />
          </label>
          <label><span class="label">Velocidad (seg. reales por hora)</span>
            <input v-model.number="estado.tienda.velocidad" type="number" min="1" max="120" class="input" />
          </label>
          <label class="flex items-end gap-2 pb-1.5">
            <input v-model="estado.tienda.reposicionAuto" type="checkbox" class="h-4 w-4 accent-[#047857]" />
            <span class="text-sm">Pedir al proveedor automáticamente al llegar a R</span>
          </label>
        </div>
        <div class="mt-3">
          <div class="label">Qué piden los clientes (probabilidad de cada producto)</div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label v-for="p in estado.productos" :key="p.id" class="flex items-center gap-2 text-sm">
              <span class="w-28">{{ p.emoji }} {{ p.nombre }}</span>
              <input v-model.number="estado.tienda.mezcla[p.id]" type="number" min="0" max="1" step="0.01" class="input !w-20" />
            </label>
          </div>
          <div class="text-[11px] mt-1" :class="Math.abs(sumaMezcla - 1) < 0.01 ? 'text-esmeralda-700' : 'text-alerta'">
            Suma = {{ fmt(sumaMezcla, 2) }} {{ Math.abs(sumaMezcla - 1) < 0.01 ? '' : '(se normaliza automáticamente)' }}
          </div>
        </div>
        <p class="text-[11px] text-espresso-500 mt-2">
          Llegadas con λ = {{ estado.colas.lambda }} clientes/h y atención con μ = {{ estado.colas.mu }} clientes/h (se cambian en la pestaña Colas, modo Manual / referencia).
        </p>
      </details>
    </div>

    <div v-if="!acumulado" class="card p-10 text-center text-espresso-500">
      <CalendarDays :size="32" class="mx-auto mb-2 text-ambar-600" />
      Todavía no hay días cerrados. Abre la tienda o usa <b>Simular semana</b> para generar el historial.
    </div>

    <template v-else>
      <!-- Resumen acumulado -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="card p-4"><div class="label">Días registrados</div><div class="font-display text-2xl font-bold num">{{ acumulado.dias }}</div></div>
        <div class="card p-4"><div class="label">Clientes en total</div><div class="font-display text-2xl font-bold num">{{ acumulado.clientes }}</div></div>
        <div class="card p-4"><div class="label">Ingresos acumulados</div><div class="font-display text-2xl font-bold num">{{ bs(acumulado.ingresos) }}</div></div>
        <div class="card p-4"><div class="label">Utilidad acumulada</div><div class="font-display text-2xl font-bold num text-esmeralda-700">{{ bs(acumulado.utilidad) }}</div></div>
      </div>

      <div class="grid lg:grid-cols-5 gap-6">
        <!-- Demanda promedio por producto -->
        <div class="card p-5 lg:col-span-3">
          <h3 class="card-title mb-1 flex items-center gap-2"><BarChart3 :size="18" /> Demanda promedio por día</h3>
          <p class="text-xs text-espresso-500 mb-4">Con todos los días registrados (vendidas + ventas perdidas).</p>
          <div class="space-y-3">
            <div v-for="p in acumulado.porProducto" :key="p.id">
              <div class="flex justify-between text-sm mb-1">
                <span>{{ p.emoji }} {{ p.nombre }}</span>
                <span class="num"><b>{{ fmt(p.demandaDia, 1) }}</b> u/día · {{ p.vendidas }} vendidas · {{ bs(p.utilidad) }}</span>
              </div>
              <div class="h-3.5 rounded-full bg-arena overflow-hidden">
                <div class="h-full rounded-full" :class="p.id === acumulado.recomendacion?.id ? 'bg-esmeralda' : 'bg-espresso'" :style="{ width: (p.demandaDia / acumulado.maxD) * 100 + '%' }" />
              </div>
            </div>
          </div>
        </div>
        <div class="lg:col-span-2 space-y-3">
          <div class="card p-4">
            <div class="label">Más vendido (acumulado)</div>
            <div class="font-display text-lg font-bold">{{ acumulado.masVendido.emoji }} {{ acumulado.masVendido.nombre }}</div>
            <div class="text-xs text-espresso-500 num">{{ acumulado.masVendido.vendidas }} unidades</div>
          </div>
          <div class="card p-4">
            <div class="label">Más rentable (acumulado)</div>
            <div class="font-display text-lg font-bold">{{ acumulado.masRentable.emoji }} {{ acumulado.masRentable.nombre }}</div>
            <div class="text-xs text-espresso-500 num">{{ bs(acumulado.masRentable.utilidad) }}</div>
          </div>
          <div class="rounded-2xl bg-esmeralda text-white p-4">
            <div class="text-[11px] font-semibold opacity-90">Producto recomendado (árbol de decisión · VME)</div>
            <div class="font-display text-lg font-bold">{{ acumulado.recomendacion?.emoji }} {{ acumulado.recomendacion?.nombre }}</div>
            <div class="text-xs opacity-90 num">VME = {{ bs(acumulado.recomendacion?.vme ?? 0) }} por día</div>
          </div>
        </div>
      </div>

      <!-- Utilidad por día -->
      <div v-if="grafica" class="card p-5">
        <h3 class="card-title mb-3">Utilidad por día <span class="text-xs font-sans font-normal text-espresso-500">(últimos {{ grafica.barras.length }})</span></h3>
        <svg :viewBox="`0 0 ${grafica.W} ${grafica.Hh}`" class="w-full" font-family="Inter, system-ui, sans-serif">
          <line :x1="grafica.M.l" :x2="grafica.W - grafica.M.r" :y1="grafica.sy(0)" :y2="grafica.sy(0)" stroke="#2C1E16" />
          <text :x="grafica.M.l - 6" :y="grafica.sy(grafica.maxU / 1.15) + 4" text-anchor="end" font-size="10" fill="#6b4f3f" font-family="JetBrains Mono">{{ fmt(grafica.maxU / 1.15, 0) }}</text>
          <text :x="grafica.M.l - 6" :y="grafica.sy(0) + 4" text-anchor="end" font-size="10" fill="#6b4f3f">0</text>
          <g v-for="b in grafica.barras" :key="b.r.dia" class="cursor-pointer" @click="reporteAbierto = b.r">
            <rect :x="b.x" :y="b.y" :width="b.w" :height="grafica.sy(0) - b.y" rx="3"
              :fill="b.r.escenario.indice === 2 ? '#10B981' : b.r.escenario.indice === 0 ? '#E4D3B7' : '#D4A24C'" />
            <text :x="b.cx" :y="grafica.Hh - 12" text-anchor="middle" font-size="10" fill="#6b4f3f">D{{ b.r.dia }}</text>
          </g>
        </svg>
        <div class="flex gap-4 text-[11px] text-espresso-500 mt-1">
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-arena-300"></span> demanda baja</span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-ambar"></span> media</span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-esmeralda"></span> alta</span>
        </div>
      </div>

      <!-- Historial -->
      <div class="card p-5">
        <h3 class="card-title mb-3">Historial de días</h3>
        <div class="overflow-x-auto">
          <table class="tabla">
            <thead>
              <tr>
                <th>Día</th><th>Fecha</th><th>Escenario</th><th class="text-right">Clientes</th><th class="text-right">Rechazados</th>
                <th class="text-right">Ventas perdidas</th><th class="text-right">Ingresos</th><th class="text-right">Utilidad</th>
                <th class="text-right">Espera en cola (Wq), min</th><th>Más vendido</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in H" :key="r.dia" class="hover:bg-arena/40 cursor-pointer" @click="reporteAbierto = r">
                <td class="num font-bold">{{ r.dia }}</td>
                <td class="text-xs capitalize">{{ fechaCorta(r.fecha) }}</td>
                <td><span class="text-[11px] font-bold rounded px-2 py-0.5 whitespace-nowrap" :class="colorEscenario[r.escenario.indice]">{{ r.escenario.nombre.replace('Demanda ', '') }}</span></td>
                <td class="text-right num">{{ r.clientes.llegaron }}</td>
                <td class="text-right num">{{ r.clientes.rechazados }}</td>
                <td class="text-right num">{{ r.clientes.perdidas }}</td>
                <td class="text-right num">{{ bs(r.ingresos) }}</td>
                <td class="text-right num font-semibold">{{ bs(r.utilidadNeta) }}</td>
                <td class="text-right num">{{ fmt(r.colas.esperaProm, 2) }}</td>
                <td class="whitespace-nowrap">{{ r.masVendido.emoji }} {{ r.masVendido.nombre }}</td>
                <td class="text-xs font-semibold text-ambar-600">Ver reporte →</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

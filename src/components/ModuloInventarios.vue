<script setup>
// Inventario: una tarjeta por insumo; al tocarla se abre su ventana de detalle
import { ref, computed } from 'vue'
import { BarChart3, ChevronRight } from 'lucide-vue-next'
import { estado, insumosEnAlerta, fmt } from '../store/useCafeteria.js'
import { clasificacionABC, analizarInsumo } from '../utils/inventarios.js'
import DetalleInsumo from './DetalleInsumo.vue'

const seleccionado = ref(null)

const nombresModelo = { estocastico: 'Revisión continua', eoq: 'EOQ básico', perecedero: 'Un solo periodo' }
const iconos = { cafe: '🫘', leche: '🥛', vaso: '🥤', azucar: '🍬', chocolate: '🍫', croissant: '🥐' }
const colorClase = { A: 'bg-espresso text-crema', B: 'bg-ambar text-espresso', C: 'bg-arena text-espresso' }

const abc = computed(() => clasificacionABC(estado.insumos, estado.consumoVivo))
const clasePorId = computed(() => Object.fromEntries(abc.value.filas.map((f) => [f.id, f.clase])))

const tarjetas = computed(() =>
  estado.insumos.map((i) => {
    const a = analizarInsumo(i)
    const alerta = a.R === null ? i.stock <= 0 : i.stock <= a.R
    const critico = a.SS > 0 && i.stock <= a.SS
    const tope = Math.max(i.stock, a.R ?? 0, a.Q ?? 0) * 1.1 || 1
    return { ...i, ...a, alerta, critico, tope, dias: i.stock / i.d }
  }),
)

// Pareto SVG
const W = 640, H = 240, M = { l: 48, r: 44, t: 16, b: 44 }
const pareto = computed(() => {
  const filas = abc.value.filas
  const banda = (W - M.l - M.r) / filas.length
  const maxV = Math.max(...filas.map((f) => f.valor))
  const y = (v) => H - M.b - (v / maxV) * (H - M.t - M.b)
  const yp = (p) => H - M.b - (p / 100) * (H - M.t - M.b)
  const barras = filas.map((f, i) => ({
    ...f, x: M.l + i * banda + banda * 0.18, w: banda * 0.64, y: y(f.valor), h: H - M.b - y(f.valor),
    cx: M.l + i * banda + banda / 2, cy: yp(f.acumulado),
  }))
  return { barras, yp, linea: barras.map((b) => `${b.cx},${b.cy}`).join(' ') }
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="font-display text-2xl font-bold">Inventario</h2>
        <p class="text-sm text-espresso-500">Toca un insumo para ver cuánto queda, su gráfica y su modelo de inventario.</p>
      </div>
      <div v-if="insumosEnAlerta.length" class="text-sm font-semibold text-alerta">
        {{ insumosEnAlerta.length }} insumo(s) por reponer
      </div>
    </div>

    <!-- Tarjetas de insumos -->
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        v-for="i in tarjetas"
        :key="i.id"
        class="card p-5 text-left transition hover:shadow-lg hover:-translate-y-0.5 group"
        :class="i.alerta ? '!border-alerta ring-2 ring-alerta/30' : 'hover:border-ambar'"
        @click="seleccionado = i.id"
      >
        <div class="flex items-start gap-3">
          <span class="text-3xl">{{ iconos[i.id] ?? '📦' }}</span>
          <div class="flex-1">
            <div class="font-semibold text-lg leading-tight">{{ i.nombre }}</div>
            <div class="text-xs text-espresso-500">{{ nombresModelo[i.modelo] }}</div>
          </div>
          <span class="text-xs font-bold rounded px-2 py-0.5" :class="colorClase[clasePorId[i.id]]">{{ clasePorId[i.id] }}</span>
        </div>

        <div class="mt-4 flex items-end justify-between">
          <div class="font-display text-3xl font-bold num" :class="i.alerta ? 'text-alerta' : ''">
            {{ fmt(i.stock) }} <span class="text-base font-sans font-medium text-espresso-500">{{ i.unidad }}</span>
          </div>
          <span v-if="i.critico" class="text-[11px] font-bold text-white bg-red-700 rounded px-2 py-0.5">CRÍTICO</span>
          <span v-else-if="i.alerta" class="text-[11px] font-bold text-white bg-alerta rounded px-2 py-0.5 pulso">{{ i.R === null ? 'AGOTADO' : 'REPONER' }}</span>
          <span v-else class="text-[11px] font-bold text-white bg-esmeralda rounded px-2 py-0.5">OK</span>
        </div>

        <div class="relative h-2.5 mt-2 rounded-full bg-arena overflow-hidden">
          <div class="h-full rounded-full transition-all" :class="i.alerta ? 'bg-alerta' : 'bg-esmeralda'" :style="{ width: Math.min(100, (i.stock / i.tope) * 100) + '%' }" />
          <div v-if="i.R !== null" class="absolute top-0 h-full w-0.5 bg-espresso" :style="{ left: (i.R / i.tope) * 100 + '%' }" />
        </div>

        <div class="mt-3 grid grid-cols-3 gap-2 text-[11px] text-espresso-500 num">
          <div><div class="font-semibold text-espresso">{{ i.R === null ? '—' : fmt(i.R, 1) }}</div>Reorden R</div>
          <div><div class="font-semibold text-espresso">{{ fmt(i.Q, 0) }}</div>{{ i.modelo === 'perecedero' ? 'S* diario' : 'Pedir Q*' }}</div>
          <div><div class="font-semibold text-espresso">{{ fmt(i.dias, 1) }} d</div>Cobertura</div>
        </div>

        <div class="mt-3 text-xs font-semibold text-ambar-600 flex items-center gap-1 group-hover:gap-2 transition-all">
          Ver detalle <ChevronRight :size="14" />
        </div>
      </button>
    </div>

    <!-- Clasificación ABC general -->
    <div class="card p-5">
      <h2 class="card-title flex items-center gap-2"><BarChart3 :size="18" /> Clasificación ABC (Pareto) de todos los insumos</h2>
      <p class="text-xs text-espresso-500 mt-1 mb-4">
        Valor de consumo = unidades consumidas (30 días de historial + ventas en vivo) × costo unitario c.
        A ≤ 80 % acumulado · B ≤ 95 % · C resto.
      </p>
      <div class="grid lg:grid-cols-2 gap-6 items-start">
        <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" font-family="Inter, system-ui, sans-serif">
          <line v-for="p in [0, 25, 50, 80, 95, 100]" :key="p" :x1="M.l" :x2="W - M.r" :y1="pareto.yp(p)" :y2="pareto.yp(p)"
            :stroke="p === 80 || p === 95 ? '#D4A24C' : '#E4D3B7'" :stroke-dasharray="p === 80 || p === 95 ? '4 3' : ''" />
          <text v-for="p in [0, 50, 80, 95, 100]" :key="'t' + p" :x="W - M.r + 6" :y="pareto.yp(p) + 4" font-size="10" fill="#6b4f3f">{{ p }}%</text>
          <g v-for="b in pareto.barras" :key="b.id" class="cursor-pointer" @click="seleccionado = b.id">
            <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="4" :fill="b.clase === 'A' ? '#2C1E16' : b.clase === 'B' ? '#D4A24C' : '#E4D3B7'" />
            <text :x="b.cx" :y="b.y - 5" text-anchor="middle" font-size="10" fill="#2C1E16" font-family="JetBrains Mono">{{ Math.round(b.valor) }}</text>
            <text :x="b.cx" :y="H - M.b + 14" text-anchor="middle" font-size="10" fill="#2C1E16">{{ b.nombre.split(' ')[0] }}</text>
            <text :x="b.cx" :y="H - M.b + 28" text-anchor="middle" font-size="11" font-weight="700" fill="#6b4f3f">{{ b.clase }}</text>
          </g>
          <polyline :points="pareto.linea" fill="none" stroke="#10B981" stroke-width="2.5" />
          <circle v-for="b in pareto.barras" :key="'c' + b.id" :cx="b.cx" :cy="b.cy" r="3.5" fill="#10B981" />
          <text :x="M.l - 6" :y="M.t + 4" text-anchor="end" font-size="10" fill="#6b4f3f">Bs.</text>
        </svg>
        <table class="tabla">
          <thead><tr><th>Insumo</th><th class="text-right">Unidades</th><th class="text-right">c</th><th class="text-right">Valor (Bs.)</th><th class="text-right">%</th><th class="text-right">% acum.</th><th>Clase</th></tr></thead>
          <tbody>
            <tr v-for="f in abc.filas" :key="f.id" class="cursor-pointer hover:bg-arena/40" @click="seleccionado = f.id">
              <td>{{ f.nombre }}</td>
              <td class="text-right num">{{ fmt(f.unidades, 0) }}</td>
              <td class="text-right num">{{ fmt(f.costo, 3) }}</td>
              <td class="text-right num">{{ fmt(f.valor, 2) }}</td>
              <td class="text-right num">{{ fmt(f.porcentaje, 2) }}</td>
              <td class="text-right num">{{ fmt(f.acumulado, 2) }}</td>
              <td><span class="text-xs font-bold rounded px-2 py-0.5" :class="colorClase[f.clase]">{{ f.clase }}</span></td>
            </tr>
            <tr class="font-semibold"><td>Total</td><td></td><td></td><td class="text-right num">{{ fmt(abc.total, 2) }}</td><td class="text-right num">100</td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Ventana de detalle -->
    <Teleport to="body">
      <DetalleInsumo v-if="seleccionado" :insumo-id="seleccionado" @cerrar="seleccionado = null" />
    </Teleport>
  </div>
</template>

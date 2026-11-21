<script setup>
// Gráfica de inventario (diente de sierra): nivel vs tiempo con R, SS, pedidos y llegadas
import { computed } from 'vue'
import { proyeccionInventario } from '../utils/inventarios.js'
import { fmt } from '../store/useCafeteria.js'

const props = defineProps({
  stock: Number,
  d: Number,
  Q: Number,
  R: Number,
  SS: { type: Number, default: 0 },
  L: Number,
  unidad: String,
})

const W = 760, H = 300
const M = { l: 62, r: 20, t: 24, b: 40 }

const g = computed(() => {
  const p = proyeccionInventario({ stock: props.stock, d: props.d, Q: props.Q, R: props.R, L: props.L })
  const maxY = Math.max(props.stock, ...p.puntos.map((x) => x.nivel), props.R) * 1.12
  const minY = Math.min(0, ...p.puntos.map((x) => x.nivel))
  const sx = (t) => M.l + (t / p.horizonte) * (W - M.l - M.r)
  const sy = (v) => H - M.b - ((v - minY) / (maxY - minY)) * (H - M.t - M.b)
  const linea = p.puntos.map((q, i) => `${i ? 'L' : 'M'}${sx(q.t).toFixed(1)},${sy(q.nivel).toFixed(1)}`).join(' ')
  const area = `${linea} L${sx(p.puntos.at(-1).t).toFixed(1)},${sy(Math.max(minY, 0))} L${sx(0)},${sy(Math.max(minY, 0))} Z`
  // Marcas del eje X (días)
  const paso = p.horizonte > 20 ? 5 : p.horizonte > 8 ? 2 : p.horizonte > 3 ? 1 : 0.5
  const ticksX = []
  for (let t = 0; t <= p.horizonte + 1e-9; t += paso) ticksX.push(t)
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => minY + f * (maxY - minY))
  const primera = p.llegadas[0]
  return { ...p, sx, sy, linea, area, ticksX, ticksY, primera, maxY }
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" font-family="Inter, system-ui, sans-serif">
    <!-- Rejilla -->
    <g v-for="v in g.ticksY" :key="'y' + v">
      <line :x1="M.l" :x2="W - M.r" :y1="g.sy(v)" :y2="g.sy(v)" stroke="#F1E6D4" />
      <text :x="M.l - 8" :y="g.sy(v) + 4" text-anchor="end" font-size="10" fill="#6b4f3f" font-family="JetBrains Mono">{{ fmt(v, 0) }}</text>
    </g>
    <g v-for="t in g.ticksX" :key="'x' + t">
      <text :x="g.sx(t)" :y="H - M.b + 16" text-anchor="middle" font-size="10" fill="#6b4f3f" font-family="JetBrains Mono">{{ fmt(t, 1) }}</text>
    </g>
    <text :x="(W + M.l) / 2" :y="H - 6" text-anchor="middle" font-size="11" fill="#6b4f3f">Tiempo (días desde hoy)</text>
    <text :x="14" :y="(H - M.b + M.t) / 2" text-anchor="middle" font-size="11" fill="#6b4f3f" :transform="`rotate(-90 14 ${(H - M.b + M.t) / 2})`">Inventario ({{ unidad }})</text>

    <!-- Zona de inventario de seguridad -->
    <rect v-if="SS > 0" :x="M.l" :y="g.sy(SS)" :width="W - M.l - M.r" :height="g.sy(0) - g.sy(SS)" fill="#FEE2E2" opacity=".7" />
    <line :x1="M.l" :x2="W - M.r" :y1="g.sy(0)" :y2="g.sy(0)" stroke="#2C1E16" stroke-width="1.2" />

    <!-- Nivel de inventario -->
    <path :d="g.area" fill="#10B981" opacity=".12" />
    <path :d="g.linea" fill="none" stroke="#2C1E16" stroke-width="2.5" stroke-linejoin="round" />

    <!-- R y SS -->
    <line :x1="M.l" :x2="W - M.r" :y1="g.sy(R)" :y2="g.sy(R)" stroke="#D4A24C" stroke-width="2" stroke-dasharray="6 4" />
    <text :x="W - M.r - 4" :y="g.sy(R) - 6" text-anchor="end" font-size="11" font-weight="700" fill="#B9852F" paint-order="stroke" stroke="#fff" stroke-width="4">R = {{ fmt(R, 2) }}</text>
    <template v-if="SS > 0">
      <line :x1="M.l" :x2="W - M.r" :y1="g.sy(SS)" :y2="g.sy(SS)" stroke="#C2410C" stroke-width="1.5" stroke-dasharray="3 3" />
      <text :x="W - M.r - 4" :y="g.sy(SS) + 14" text-anchor="end" font-size="11" font-weight="700" fill="#C2410C" paint-order="stroke" stroke="#fff" stroke-width="4">SS = {{ fmt(SS, 2) }}</text>
    </template>

    <!-- Pedidos (cuando el nivel toca R) -->
    <g v-for="(p, i) in g.pedidos" :key="'p' + i">
      <line :x1="g.sx(p.t)" :x2="g.sx(p.t)" :y1="g.sy(p.nivel)" :y2="g.sy(0)" stroke="#D4A24C" stroke-dasharray="2 3" />
      <polygon :points="`${g.sx(p.t) - 6},${g.sy(p.nivel) - 14} ${g.sx(p.t) + 6},${g.sy(p.nivel) - 14} ${g.sx(p.t)},${g.sy(p.nivel) - 4}`" fill="#D4A24C" />
      <text :x="g.sx(p.t)" :y="g.sy(p.nivel) - 18" text-anchor="middle" font-size="10" font-weight="700" fill="#B9852F" paint-order="stroke" stroke="#fff" stroke-width="3">Pedir</text>
    </g>
    <!-- Llegadas (+Q) -->
    <g v-for="(a, i) in g.llegadas" :key="'a' + i">
      <circle :cx="g.sx(a.t)" :cy="g.sy(a.nivel)" r="4.5" fill="#10B981" stroke="#fff" stroke-width="1.5" />
    </g>
    <!-- Cota de Q en la primera llegada -->
    <g v-if="g.primera">
      <line :x1="g.sx(g.primera.t) + 10" :x2="g.sx(g.primera.t) + 10" :y1="g.sy(g.primera.nivel)" :y2="g.sy(g.primera.nivel - Q)" stroke="#047857" stroke-width="1.5" />
      <line :x1="g.sx(g.primera.t) + 6" :x2="g.sx(g.primera.t) + 14" :y1="g.sy(g.primera.nivel)" :y2="g.sy(g.primera.nivel)" stroke="#047857" stroke-width="1.5" />
      <line :x1="g.sx(g.primera.t) + 6" :x2="g.sx(g.primera.t) + 14" :y1="g.sy(g.primera.nivel - Q)" :y2="g.sy(g.primera.nivel - Q)" stroke="#047857" stroke-width="1.5" />
      <text :x="g.sx(g.primera.t) + 18" :y="(g.sy(g.primera.nivel) + g.sy(g.primera.nivel - Q)) / 2 + 4" font-size="11" font-weight="700" fill="#047857" paint-order="stroke" stroke="#fff" stroke-width="4">Q = {{ fmt(Q, 1) }}</text>
      <text :x="(g.sx(g.pedidos[0]?.t ?? 0) + g.sx(g.primera.t)) / 2" :y="g.sy(0) - 6" text-anchor="middle" font-size="10" fill="#6b4f3f">L = {{ L }} d</text>
    </g>
    <!-- Hoy -->
    <circle :cx="g.sx(0)" :cy="g.sy(stock)" r="5" fill="#2C1E16" />
    <text :x="g.sx(0) + 8" :y="g.sy(stock) - 8" font-size="11" font-weight="700" fill="#2C1E16" paint-order="stroke" stroke="#fff" stroke-width="4">Hoy: {{ fmt(stock) }}</text>
  </svg>
</template>

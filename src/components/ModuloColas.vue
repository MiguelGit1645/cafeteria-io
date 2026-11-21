<script setup>
// Teoría de colas del mostrador actual: M/M/1/K (1 barista, aforo K)
import { computed } from 'vue'
import { Users, Radio, SlidersHorizontal, ArrowRight } from 'lucide-vue-next'
import { estado, tasasHistorial, tasasEnUso, pedidosEnCola, fmt } from '../store/useCafeteria.js'
import { mm1k } from '../utils/colas.js'
import PanelSimulacion from './PanelSimulacion.vue'

const emit = defineEmits(['ir'])

const r1 = computed(() => mm1k({ lambda: tasasEnUso.value.lambda, mu: tasasEnUso.value.mu, K: estado.colas.K }))

const tarjetas = computed(() => [
  { s: 'ρ', n: 'Factor de utilización λ/μ', v: fmt(r1.value.rho, 4) },
  { s: 'P₀', n: 'Probabilidad sistema vacío', v: fmt(r1.value.P0, 4) },
  { s: 'P_K', n: 'Prob. rechazo (local lleno)', v: fmt(r1.value.PK, 4), alerta: r1.value.PK > 0.05 },
  { s: 'λ̄', n: 'Tasa efectiva de llegada', v: fmt(r1.value.lambdaEf, 4) + ' cl/h' },
  { s: 'Ls', n: 'Clientes en el sistema', v: fmt(r1.value.Ls, 4) },
  { s: 'Lq', n: 'Clientes en cola', v: fmt(r1.value.Lq, 4) },
  { s: 'Ws', n: 'Tiempo en el sistema', v: fmt(r1.value.Ws * 60, 2) + ' min', sub: fmt(r1.value.Ws, 4) + ' h' },
  { s: 'Wq', n: 'Tiempo en cola', v: fmt(r1.value.Wq * 60, 2) + ' min', sub: fmt(r1.value.Wq, 4) + ' h' },
])

const maxP = computed(() => Math.max(...r1.value.Pn))
</script>

<template>
  <div class="space-y-6">
    <PanelSimulacion />

    <!-- Parámetros -->
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="card-title flex items-center gap-2"><Users :size="18" /> Parámetros de la cola del mostrador</h2>
        <div class="flex rounded-lg bg-arena p-1 text-sm font-semibold">
          <button class="px-3 py-1 rounded-md flex items-center gap-1" :class="estado.colas.fuente === 'historial' ? 'bg-espresso text-crema' : ''" @click="estado.colas.fuente = 'historial'">
            <Radio :size="14" /> En vivo (historial)
          </button>
          <button class="px-3 py-1 rounded-md flex items-center gap-1" :class="estado.colas.fuente === 'manual' ? 'bg-espresso text-crema' : ''" @click="estado.colas.fuente = 'manual'">
            <SlidersHorizontal :size="14" /> Manual
          </button>
        </div>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
        <div class="rounded-xl border border-arena-300 p-3" :class="tasasEnUso.enVivo ? 'bg-esmeralda/10' : 'bg-crema'">
          <div class="label">λ en uso (cl/h)</div>
          <div class="font-display text-2xl font-bold num">{{ fmt(tasasEnUso.lambda, 3) }}</div>
          <div class="text-[11px] text-espresso-500">{{ tasasEnUso.enVivo ? `estimada de ${tasasHistorial.nLlegadas} llegadas` : 'valor manual' }}</div>
        </div>
        <div class="rounded-xl border border-arena-300 p-3" :class="tasasEnUso.enVivo ? 'bg-esmeralda/10' : 'bg-crema'">
          <div class="label">μ en uso (cl/h)</div>
          <div class="font-display text-2xl font-bold num">{{ fmt(tasasEnUso.mu, 3) }}</div>
          <div class="text-[11px] text-espresso-500">{{ tasasEnUso.enVivo ? `estimada de ${tasasHistorial.nServicios} servicios` : 'valor manual' }}</div>
        </div>
        <label class="rounded-xl border border-arena-300 p-3 bg-crema">
          <span class="label">λ manual / referencia</span>
          <input v-model.number="estado.colas.lambda" type="number" step="0.5" min="0.1" class="input" />
          <span class="text-[11px] text-espresso-500">usada para simular llegadas</span>
        </label>
        <label class="rounded-xl border border-arena-300 p-3 bg-crema">
          <span class="label">μ manual / referencia</span>
          <input v-model.number="estado.colas.mu" type="number" step="0.5" min="0.1" class="input" />
          <span class="text-[11px] text-espresso-500">usada para simular servicios</span>
        </label>
        <label class="rounded-xl border border-arena-300 p-3 bg-crema">
          <span class="label">Aforo K (clientes)</span>
          <input v-model.number="estado.colas.K" type="number" min="1" max="40" class="input" />
          <span class="text-[11px] text-espresso-500">ahora en el sistema: <b>{{ pedidosEnCola.length }}</b></span>
        </label>
      </div>
    </div>

    <!-- M/M/1/K -->
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 class="card-title">Modelo M/M/1/K — 1 barista, capacidad K = {{ estado.colas.K }}</h2>
        <span class="text-xs rounded-full px-3 py-1 font-semibold" :class="r1.rho < 1 ? 'bg-esmeralda/15 text-esmeralda-700' : 'bg-alerta/15 text-alerta'">
          {{ r1.rho < 1 ? 'ρ < 1: sistema estable' : 'ρ ≥ 1: el aforo K limita la cola' }}
        </span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="t in tarjetas" :key="t.s" class="rounded-xl border p-3" :class="t.alerta ? 'border-alerta bg-alerta/5' : 'border-arena-300 bg-crema'">
          <div class="flex items-baseline justify-between">
            <span class="font-display text-lg font-bold text-ambar-600">{{ t.s }}</span>
            <span class="text-[10px] text-espresso-500 text-right">{{ t.n }}</span>
          </div>
          <div class="font-display text-2xl font-bold num mt-1">{{ t.v }}</div>
          <div v-if="t.sub" class="text-[11px] text-espresso-500 num">{{ t.sub }}</div>
        </div>
      </div>
      <div class="calc mt-4 flex flex-wrap gap-1.5 text-[11px]">
        <span class="formula">ρ = λ/μ</span>
        <span class="formula">P₀ = (1−ρ)/(1−ρ^(K+1))</span>
        <span class="formula">Pₙ = P₀·ρⁿ</span>
        <span class="formula">Ls = ρ/(1−ρ) − (K+1)ρ^(K+1)/(1−ρ^(K+1))</span>
        <span class="formula">Lq = Ls − (1−P₀)</span>
        <span class="formula">λ̄ = λ(1 − P₀ρ^K)</span>
        <span class="formula">Ws = Ls/λ̄</span>
        <span class="formula">Wq = Lq/λ̄</span>
      </div>
    </div>

    <!-- Distribución Pn -->
    <div class="card p-5">
      <h2 class="card-title mb-1">Distribución Pₙ (clientes en el sistema)</h2>
      <p class="text-xs text-espresso-500 mb-4">La última barra (n = K) es la probabilidad de rechazar clientes por local lleno.</p>
      <div class="flex items-end gap-2 h-44">
        <div v-for="(p, n) in r1.Pn" :key="n" class="flex-1 flex flex-col items-center justify-end h-full">
          <div class="text-[10px] num text-espresso-500 mb-0.5">{{ p.toFixed(3) }}</div>
          <div class="w-full max-w-10 rounded-t transition-all" :class="n === r1.K ? 'bg-alerta' : 'bg-espresso'" :style="{ height: (p / maxP) * 85 + '%' }" />
          <div class="text-[10px] num mt-1">{{ n }}</div>
        </div>
      </div>
    </div>

    <button class="w-full card p-4 flex items-center justify-between hover:border-esmeralda transition" @click="emit('ir', 'simulaciones')">
      <span class="text-left">
        <span class="font-display text-lg font-bold block">¿Cómo mejorar el servicio?</span>
        <span class="text-xs text-espresso-500">Compara M/M/1/K con M/M/s/K agregando baristas en hora pico</span>
      </span>
      <ArrowRight :size="20" class="text-esmeralda-700" />
    </button>
  </div>
</template>

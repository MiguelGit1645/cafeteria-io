<script setup>
// Simulaciones para mejorar el servicio: M/M/1/K vs M/M/s/K (s baristas en hora pico)
import { ref, computed } from 'vue'
import { TrendingDown, Target, RotateCcw, Lightbulb } from 'lucide-vue-next'
import { estado, tasasEnUso, fmt } from '../store/useCafeteria.js'
import { mm1k, mmsk } from '../utils/colas.js'

// Parámetros del escenario (por defecto, los del mostrador actual)
const lambdaManual = ref(null)
const metaWq = ref(5)
const lambda = computed({
  get: () => lambdaManual.value ?? +tasasEnUso.value.lambda.toFixed(3),
  set: (v) => (lambdaManual.value = v),
})
const mu = computed(() => tasasEnUso.value.mu)
const K = computed(() => estado.colas.K)
const OPCIONES_S = [1, 2, 3, 4]

const escenarios = computed(() =>
  OPCIONES_S.filter((s) => s <= K.value).map((s) =>
    s === 1 ? mm1k({ lambda: lambda.value, mu: mu.value, K: K.value }) : mmsk({ lambda: lambda.value, mu: mu.value, s, K: K.value }),
  ),
)
const recomendado = computed(() => escenarios.value.find((e) => e.Wq * 60 <= metaWq.value) ?? null)

const base = computed(() => escenarios.value[0])
const elegido = computed(() => escenarios.value.find((e) => e.s === estado.colas.sComparar) ?? escenarios.value[1] ?? base.value)

const comparativa = computed(() => {
  const a = base.value, b = elegido.value
  const filas = [
    ['Factor de utilización por barista (ρ)', a.rho, b.rho, 4],
    ['Probabilidad de que el sistema esté vacío (P₀)', a.P0, b.P0, 4],
    ['Probabilidad de rechazo por local lleno (P_K)', a.PK, b.PK, 5],
    ['Tasa efectiva de llegada, cl/h (λ̄)', a.lambdaEf, b.lambdaEf, 4],
    ['Promedio de clientes en el sistema (Ls)', a.Ls, b.Ls, 4],
    ['Promedio de clientes en cola (Lq)', a.Lq, b.Lq, 4],
    ['Tiempo promedio en el sistema, min (Ws)', a.Ws * 60, b.Ws * 60, 2],
    ['Tiempo promedio de espera en cola, min (Wq)', a.Wq * 60, b.Wq * 60, 2],
    ['Clientes rechazados por hora (λ·P_K)', a.rechazadosPorHora, b.rechazadosPorHora, 4],
  ]
  return filas.map(([n, x, y, d]) => ({ n, x, y, d, cambio: x !== 0 ? ((y - x) / x) * 100 : 0 }))
})

const maxP = computed(() => Math.max(...base.value.Pn, ...elegido.value.Pn))
</script>

<template>
  <div class="space-y-6">
    <!-- Escenario -->
    <div class="card p-5">
      <h2 class="card-title flex items-center gap-2"><TrendingDown :size="18" /> Simulaciones para mejorar el servicio</h2>
      <p class="text-xs text-espresso-500 mt-1 mb-4">
        ¿Qué pasa si en hora pico atienden más baristas? Se compara el mostrador actual (M/M/1/K) con M/M/s/K.
        Por defecto usa λ y μ del módulo de Colas; puedes probar una λ de hora pico.
      </p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <label class="rounded-xl border border-arena-300 p-3 bg-crema">
          <span class="label">Tasa de llegada (λ), cl/h</span>
          <div class="flex gap-1">
            <input v-model.number="lambda" type="number" step="0.5" min="0.1" class="input" />
            <button class="btn-ghost !px-2" title="Usar λ actual" @click="lambdaManual = null"><RotateCcw :size="14" /></button>
          </div>
          <span class="text-[11px] text-espresso-500">{{ lambdaManual === null ? 'λ actual del mostrador' : 'λ de prueba' }}</span>
        </label>
        <div class="rounded-xl border border-arena-300 p-3 bg-crema">
          <div class="label">Tasa de servicio por barista (μ), cl/h</div>
          <div class="font-display text-2xl font-bold num">{{ fmt(mu, 3) }}</div>
        </div>
        <div class="rounded-xl border border-arena-300 p-3 bg-crema">
          <div class="label">Capacidad máxima del local (K)</div>
          <div class="font-display text-2xl font-bold num">{{ K }}</div>
        </div>
        <label class="rounded-xl border border-arena-300 p-3 bg-crema">
          <span class="label flex items-center gap-1"><Target :size="12" /> Meta: tiempo de espera en cola (Wq), min</span>
          <input v-model.number="metaWq" type="number" step="0.5" min="0" class="input" />
        </label>
        <div class="rounded-xl p-3" :class="recomendado ? 'bg-esmeralda text-white' : 'bg-alerta text-white'">
          <div class="text-[11px] font-semibold opacity-90">Baristas recomendados</div>
          <div class="font-display text-3xl font-bold">{{ recomendado ? `s = ${recomendado.s}` : '> 4' }}</div>
          <div class="text-[11px] opacity-90">mínimo con espera en cola (Wq) ≤ {{ metaWq }} min</div>
        </div>
      </div>
    </div>

    <!-- Tabla de escenarios s = 1..4 -->
    <div class="card p-5">
      <h3 class="card-title mb-3">Escenarios por número de baristas</h3>
      <div class="overflow-x-auto">
        <table class="tabla">
          <thead>
            <tr class="align-bottom">
              <th>Modelo</th>
              <th class="text-right">Utilización por barista (ρ)</th>
              <th class="text-right">Prob. sistema vacío (P₀)</th>
              <th class="text-right">Prob. de rechazo (P_K)</th>
              <th class="text-right">Clientes en el sistema (Ls)</th>
              <th class="text-right">Clientes en cola (Lq)</th>
              <th class="text-right">Tiempo en el sistema, min (Ws)</th>
              <th class="text-right">Tiempo de espera en cola, min (Wq)</th>
              <th>Meta</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in escenarios" :key="e.s" :class="recomendado && e.s === recomendado.s ? 'bg-esmeralda/10' : ''">
              <td class="font-semibold whitespace-nowrap">{{ e.s === 1 ? 'M/M/1/K (actual)' : `M/M/${e.s}/K` }}</td>
              <td class="text-right num">{{ fmt(e.rho, 4) }}</td>
              <td class="text-right num">{{ fmt(e.P0, 4) }}</td>
              <td class="text-right num">{{ fmt(e.PK, 5) }}</td>
              <td class="text-right num">{{ fmt(e.Ls, 4) }}</td>
              <td class="text-right num">{{ fmt(e.Lq, 4) }}</td>
              <td class="text-right num">{{ fmt(e.Ws * 60, 2) }}</td>
              <td class="text-right num font-bold">{{ fmt(e.Wq * 60, 2) }}</td>
              <td>
                <span class="text-[11px] font-bold rounded px-2 py-0.5 whitespace-nowrap" :class="e.Wq * 60 <= metaWq ? 'bg-esmeralda text-white' : 'bg-arena'">
                  {{ e.Wq * 60 <= metaWq ? 'Cumple' : 'No cumple' }}
                </span>
              </td>
              <td class="text-right">
                <button v-if="e.s > 1" class="text-xs font-semibold hover:underline" :class="estado.colas.sComparar === e.s ? 'text-esmeralda-700' : 'text-ambar-600'" @click="estado.colas.sComparar = e.s">
                  {{ estado.colas.sComparar === e.s ? 'Comparando' : 'Comparar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Comparativa lado a lado -->
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="card-title">Comparativa: s = 1 vs s = {{ elegido.s }}</h3>
        <div class="flex items-center gap-2 text-sm">
          <span class="font-semibold">Baristas s =</span>
          <button v-for="s in OPCIONES_S.filter((x) => x > 1 && x <= K)" :key="s" class="h-8 w-8 rounded-lg font-bold" :class="estado.colas.sComparar === s ? 'bg-esmeralda text-white' : 'bg-arena'" @click="estado.colas.sComparar = s">{{ s }}</button>
        </div>
      </div>
      <div class="grid lg:grid-cols-5 gap-6">
        <div class="lg:col-span-3 overflow-x-auto">
          <table class="tabla">
            <thead>
              <tr><th>Medida</th><th class="text-right">s = 1</th><th class="text-right">s = {{ elegido.s }}</th><th class="text-right">Cambio</th></tr>
            </thead>
            <tbody>
              <tr v-for="f in comparativa" :key="f.n">
                <td>{{ f.n }}</td>
                <td class="text-right num">{{ fmt(f.x, f.d) }}</td>
                <td class="text-right num font-semibold text-esmeralda-700">{{ fmt(f.y, f.d) }}</td>
                <td class="text-right num text-xs text-espresso-500">{{ f.cambio > 0 ? '↑' : f.cambio < 0 ? '↓' : '' }} {{ fmt(Math.abs(f.cambio), 1) }} %</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="lg:col-span-2 space-y-4">
          <div class="rounded-xl bg-esmeralda/10 border border-esmeralda/40 p-4 text-sm">
            <Lightbulb :size="18" class="text-esmeralda-700 mb-1" />
            Con <b>{{ elegido.s }} baristas</b> el tiempo de espera en cola (Wq) baja de
            <b class="num">{{ fmt(base.Wq * 60, 2) }} min</b> a <b class="num text-esmeralda-700">{{ fmt(elegido.Wq * 60, 2) }} min</b>
            y el tiempo promedio en el sistema (Ws) de <b class="num">{{ fmt(base.Ws * 60, 2) }}</b> a <b class="num text-esmeralda-700">{{ fmt(elegido.Ws * 60, 2) }} min</b>.
            La probabilidad de rechazo por local lleno (P_K) pasa de {{ fmt(base.PK * 100, 2) }} % a {{ fmt(elegido.PK * 100, 3) }} %.
          </div>
          <div>
            <div class="label">Probabilidad de n clientes en el sistema (Pₙ) · oscuro s = 1 · verde s = {{ elegido.s }}</div>
            <div class="flex items-end gap-1 h-36 mt-2">
              <div v-for="(p, n) in base.Pn" :key="n" class="flex-1 flex flex-col items-center justify-end h-full">
                <div class="flex items-end gap-px w-full justify-center h-full">
                  <div class="w-1/2 rounded-t" :class="n === K ? 'bg-alerta' : 'bg-espresso'" :style="{ height: (p / maxP) * 100 + '%' }" :title="`s=1 P${n} = ${p.toFixed(4)}`" />
                  <div class="w-1/2 rounded-t bg-esmeralda" :style="{ height: (elegido.Pn[n] / maxP) * 100 + '%' }" :title="`s=${elegido.s} P${n} = ${elegido.Pn[n].toFixed(4)}`" />
                </div>
                <div class="text-[9px] num mt-1">{{ n }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="calc mt-4 flex flex-wrap gap-1.5 text-[11px]">
        <span class="formula">ρ = λ/(sμ)</span>
        <span class="formula">P₀ = 1/[Σₙ₌₀ˢ (λ/μ)ⁿ/n! + (λ/μ)ˢ/s! · Σₙ₌ₛ₊₁ᴷ ρ^(n−s)]</span>
        <span class="formula">Lq = P₀(λ/μ)ˢρ/(s!(1−ρ)²)·[1 − ρ^(K−s) − (K−s)ρ^(K−s)(1−ρ)]</span>
        <span class="formula">Ls = Σₙ₌₀ˢ⁻¹ nPₙ + Lq + s(1 − Σₙ₌₀ˢ⁻¹ Pₙ)</span>
        <span class="formula">λ̄ = λ(1 − P_K)</span>
        <span class="formula">Ws = Ls/λ̄ ; Wq = Lq/λ̄</span>
      </div>
    </div>
  </div>
</template>

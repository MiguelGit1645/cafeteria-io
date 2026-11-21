<script setup>
import { computed } from 'vue'
import { GitBranch, Trophy, RotateCcw, Scale } from 'lucide-vue-next'
import { ref } from 'vue'
import { estado, fmt, bs } from '../store/useCafeteria.js'
import { ESCENARIOS } from '../data/datosCafeteria.js'
import { resolverArbol, ajustarProbabilidades, criteriosIncertidumbre } from '../utils/decisiones.js'

const arbol = computed(() =>
  resolverArbol({
    alternativas: estado.decisiones.alternativas,
    productos: estado.productos,
    insumos: estado.insumos,
    probabilidades: estado.decisiones.probabilidades,
  }),
)

function cambiarP(j, v) {
  estado.decisiones.probabilidades = ajustarProbabilidades(estado.decisiones.probabilidades, j, Number(v))
}
function restaurarHistorial() {
  const hist = estado.decisiones.historial
  const total = hist.reduce((s, e) => s + e.dias, 0)
  estado.decisiones.probabilidades = hist.map((e) => Math.round((e.dias / total) * 1000) / 1000)
}

// ---------- Criterios en condiciones de incertidumbre ----------
const alfa = ref(0.5)
const crit = computed(() => criteriosIncertidumbre(arbol.value.ramas, alfa.value))
const CRITERIOS = [
  { id: 'maximax', nombre: 'MaxiMax', desc: 'Optimista: el mejor de los mejores resultados', col: 'max' },
  { id: 'maximin', nombre: 'MaxiMin', desc: 'Pesimista: el mejor de los peores resultados', col: 'min' },
  { id: 'laplace', nombre: 'Laplace', desc: 'Todos los escenarios igual de probables (promedio)', col: 'laplace' },
  { id: 'hurwicz', nombre: 'Hurwicz', desc: 'Mezcla optimista/pesimista con coeficiente α', col: 'hurwicz' },
  { id: 'savage', nombre: 'Savage', desc: 'Mínimo arrepentimiento (costo de oportunidad)', col: 'savage' },
]
const nombreAlt = (i) => arbol.value.ramas[i].emoji + ' ' + arbol.value.ramas[i].nombre

// ---------- Geometría del árbol (SVG) ----------
const W = 980, H = 600
const xDec = 70, xAzar = 400, xHoja = 740
const yDec = H / 2
const yAzar = [110, 300, 490]
const dyHoja = 62

const nodos = computed(() =>
  arbol.value.ramas.map((r, i) => {
    const gana = r.indice === arbol.value.mejor.indice
    return {
      ...r,
      gana,
      y: yAzar[i],
      hojas: r.resultados.map((res, j) => ({ res, j, y: yAzar[i] + (j - 1) * dyHoja })),
    }
  }),
)
</script>

<template>
  <div class="space-y-6">
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="card-title flex items-center gap-2"><GitBranch :size="18" /> Árbol de decisión — ¿En qué producto enfocar el próximo día?</h2>
        <div class="flex items-center gap-3 text-xs text-espresso-500">
          <span class="flex items-center gap-1"><span class="inline-block h-3 w-3 bg-espresso"></span> Nodo de decisión</span>
          <span class="flex items-center gap-1"><span class="inline-block h-3 w-3 rounded-full bg-ambar"></span> Nodo de incertidumbre</span>
          <span class="flex items-center gap-1"><span class="inline-block h-0 w-0 border-y-[6px] border-y-transparent border-r-[10px] border-r-espresso-500"></span> Resultado r<sub>ij</sub></span>
        </div>
      </div>

      <div class="overflow-x-auto mt-4">
        <svg :viewBox="`0 0 ${W} ${H}`" class="w-full min-w-[720px]" font-family="Inter, system-ui, sans-serif">
          <!-- Ramas de decisión -->
          <g v-for="n in nodos" :key="'rama' + n.indice">
            <path
              :d="`M${xDec + 26},${yDec} C${xDec + 160},${yDec} ${xAzar - 160},${n.y} ${xAzar - 24},${n.y}`"
              fill="none"
              :stroke="n.gana ? '#10B981' : '#C9B79C'"
              :stroke-width="n.gana ? 5 : 2.5"
            />
            <!-- Rama podada (||) -->
            <g v-if="!n.gana" :transform="`translate(${xAzar - 70}, ${n.y})`">
              <line x1="-5" y1="-9" x2="-1" y2="9" stroke="#2C1E16" stroke-width="2.5" />
              <line x1="3" y1="-9" x2="7" y2="9" stroke="#2C1E16" stroke-width="2.5" />
            </g>
            <text :x="(xDec + xAzar) / 2 - 10" :y="(yDec + n.y) / 2 - 14" text-anchor="middle" font-size="14" font-weight="700" paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" :fill="n.gana ? '#047857' : '#2C1E16'">
              {{ n.emoji }} {{ n.nombre }}
            </text>
            <text :x="(xDec + xAzar) / 2 - 10" :y="(yDec + n.y) / 2 + 2" text-anchor="middle" font-size="11" fill="#6b4f3f" font-family="JetBrains Mono" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">
              util. {{ fmt(n.utilidad, 2) }} · CF {{ fmt(n.costoFijo, 0) }}
            </text>

            <!-- Sub-ramas de escenarios -->
            <g v-for="h in n.hojas" :key="'h' + n.indice + h.j">
              <line :x1="xAzar + 24" :y1="n.y" :x2="xHoja - 14" :y2="h.y"
                :stroke="n.gana ? '#10B981' : '#D8C8AE'" :stroke-width="n.gana ? 3 : 1.8" />
              <text :x="xHoja - 24" :y="h.j === 2 ? h.y + 18 : h.y - 8" text-anchor="end" font-size="11" fill="#2C1E16" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">
                {{ ESCENARIOS[h.j].nombre }} · p={{ fmt(estado.decisiones.probabilidades[h.j], 2) }} · {{ fmt(n.unidades[h.j], 1) }} u.
              </text>
              <!-- Nodo terminal (triángulo) -->
              <polygon :points="`${xHoja - 14},${h.y} ${xHoja + 2},${h.y - 9} ${xHoja + 2},${h.y + 9}`" :fill="n.gana ? '#047857' : '#6b4f3f'" />
              <text :x="xHoja + 12" :y="h.y + 4" font-size="12" font-family="JetBrains Mono" :fill="h.res < 0 ? '#B91C1C' : '#2C1E16'" font-weight="600">
                r = {{ fmt(h.res, 2) }}
              </text>
              <text class="calc" :x="xHoja + 120" :y="h.y + 4" font-size="10" font-family="JetBrains Mono" fill="#6b4f3f">
                {{ n.unidades[h.j] }}×{{ fmt(n.utilidad, 2) }}−{{ n.costoFijo }}
              </text>
            </g>

            <!-- Nodo de incertidumbre (círculo) -->
            <circle :cx="xAzar" :cy="n.y" r="24" :fill="n.gana ? '#10B981' : '#D4A24C'" stroke="#2C1E16" stroke-width="2" />
            <text :x="xAzar" :y="n.y + 4" text-anchor="middle" font-size="11" font-weight="700" :fill="n.gana ? '#fff' : '#2C1E16'">{{ n.indice + 1 }}</text>
            <rect :x="xAzar - 58" :y="n.y + 30" width="116" height="22" rx="6" :fill="n.gana ? '#047857' : '#2C1E16'" />
            <text :x="xAzar" :y="n.y + 45" text-anchor="middle" font-size="11" fill="#FBF6EE" font-family="JetBrains Mono" font-weight="600">
              VME = {{ fmt(n.vme, 2) }}
            </text>
          </g>

          <!-- Nodo de decisión (cuadrado) -->
          <rect :x="xDec - 26" :y="yDec - 26" width="52" height="52" fill="#2C1E16" rx="3" />
          <text :x="xDec" :y="yDec + 5" text-anchor="middle" font-size="13" fill="#D4A24C" font-weight="700">D</text>
          <rect :x="xDec - 60" :y="yDec + 34" width="120" height="22" rx="6" fill="#10B981" />
          <text :x="xDec" :y="yDec + 49" text-anchor="middle" font-size="11" fill="#fff" font-family="JetBrains Mono" font-weight="700">
            VME* = {{ fmt(arbol.mejor.vme, 2) }}
          </text>
        </svg>
      </div>
      <p class="calc text-xs text-espresso-500 mt-2">
        Se resuelve de derecha a izquierda: en cada ○ se calcula VME<sub>i</sub> = Σ r<sub>ij</sub>·p<sub>j</sub>; en el □ se elige el mayor VME y se podan (||) las demás ramas.
      </p>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Probabilidades -->
      <div class="card p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="card-title">Probabilidades pⱼ</h3>
          <button class="btn-ghost !py-1 text-xs" @click="restaurarHistorial"><RotateCcw :size="12" /> Historial</button>
        </div>
        <p class="text-xs text-espresso-500 mb-4">
          Calculadas del historial de {{ estado.decisiones.historial.reduce((s, e) => s + e.dias, 0) }} días
          (baja {{ estado.decisiones.historial[0].dias }} · media {{ estado.decisiones.historial[1].dias }} · alta {{ estado.decisiones.historial[2].dias }}). Se actualizan al cerrar cada día.
          Puedes moverlas para probar sensibilidad.
        </p>
        <div v-for="(e, j) in ESCENARIOS" :key="e.id" class="mb-4">
          <div class="flex justify-between text-sm">
            <span class="font-medium">{{ e.nombre }}</span>
            <span class="num font-bold text-ambar-600">{{ fmt(estado.decisiones.probabilidades[j], 2) }}</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" class="w-full accent-[#2C1E16]"
            :value="estado.decisiones.probabilidades[j]" @input="cambiarP(j, $event.target.value)" />
        </div>
        <div class="text-xs num" :class="Math.abs(arbol.sumaProbabilidades - 1) < 0.005 ? 'text-esmeralda-700' : 'text-alerta'">
          Σ pⱼ = {{ fmt(arbol.sumaProbabilidades, 2) }}
        </div>
      </div>

      <!-- Matriz de pagos -->
      <div class="card p-5 lg:col-span-2">
        <h3 class="card-title mb-1">Matriz de resultados r<sub>ij</sub> (Bs.)</h3>
        <p class="text-xs text-espresso-500 mb-3">
          <span class="formula">rᵢⱼ = Unidadesⱼ × (Precio − Costo receta)ᵢ − Costo fijoᵢ</span>
          Ganancia neta de cada alternativa en cada escenario de demanda. La utilidad por unidad se recalcula sola con los costos de Inventarios.
        </p>
        <div class="overflow-x-auto">
          <table class="tabla">
            <thead>
              <tr>
                <th>Alternativa</th><th class="text-right">Utilidad u.</th><th>Costo fijo</th>
                <th v-for="e in ESCENARIOS" :key="e.id" class="text-center">{{ e.nombre.replace('Demanda ', '') }} (u. → r)</th>
                <th class="text-right">VME</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in arbol.ramas" :key="r.productoId" :class="r.indice === arbol.mejor.indice ? 'bg-esmeralda/10' : ''">
                <td class="font-medium whitespace-nowrap">{{ r.emoji }} {{ r.nombre }}</td>
                <td class="text-right num text-xs"><span class="calc">{{ fmt(r.precio, 2) }} − {{ fmt(r.costoReceta, 2) }} = </span><b>{{ fmt(r.utilidad, 2) }}</b></td>
                <td><input v-model.number="estado.decisiones.alternativas[i].costoFijo" type="number" step="10" class="input !w-20" /></td>
                <td v-for="(res, j) in r.resultados" :key="j" class="text-center">
                  <input v-model.number="estado.decisiones.alternativas[i].unidades[j]" type="number" min="0" class="input !w-16 inline-block text-center" />
                  <div class="num text-xs mt-0.5" :class="res < 0 ? 'text-red-700' : ''">{{ fmt(res, 2) }}</div>
                </td>
                <td class="text-right num font-bold" :class="r.indice === arbol.mejor.indice ? 'text-esmeralda-700' : ''">{{ fmt(r.vme, 2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>


    <!-- Criterios en condiciones de incertidumbre -->
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 class="card-title flex items-center gap-2"><Scale :size="18" /> Si no se confía en las probabilidades: criterios de incertidumbre</h3>
        <label class="flex items-center gap-2 text-sm">
          <span class="font-semibold">Optimismo α (Hurwicz)</span>
          <input v-model.number="alfa" type="range" min="0" max="1" step="0.05" class="accent-[#2C1E16]" />
          <span class="num font-bold text-ambar-600 w-10">{{ fmt(alfa, 2) }}</span>
        </label>
      </div>
      <p class="text-xs text-espresso-500 mb-4">Cada criterio refleja una actitud distinta del dueño frente al riesgo y usa la misma matriz de resultados.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div v-for="c in CRITERIOS" :key="c.id" class="rounded-xl border p-3"
          :class="crit.ganadores[c.id] === arbol.mejor.indice ? 'border-esmeralda bg-esmeralda/10' : 'border-arena-300 bg-crema'">
          <div class="font-display font-bold text-lg">{{ c.nombre }}</div>
          <div class="text-[11px] text-espresso-500 leading-tight min-h-8">{{ c.desc }}</div>
          <div class="mt-2 text-sm font-semibold">{{ nombreAlt(crit.ganadores[c.id]) }}</div>
          <div class="text-xs num text-espresso-500">
            {{ c.id === 'savage' ? 'arrepentimiento máx.' : 'valor' }} {{ fmt(crit.filas[crit.ganadores[c.id]][c.col], 2) }}
          </div>
        </div>
      </div>
      <div class="grid lg:grid-cols-2 gap-6">
        <div class="overflow-x-auto">
          <table class="tabla">
            <thead><tr><th>Alternativa</th><th class="text-right">Máximo</th><th class="text-right">Mínimo</th><th class="text-right">Laplace</th><th class="text-right">Hurwicz</th></tr></thead>
            <tbody>
              <tr v-for="f in crit.filas" :key="f.indice">
                <td class="whitespace-nowrap">{{ f.emoji }} {{ f.nombre }}</td>
                <td class="text-right num" :class="crit.ganadores.maximax === f.indice ? 'font-bold text-esmeralda-700' : ''">{{ fmt(f.max, 2) }}</td>
                <td class="text-right num" :class="crit.ganadores.maximin === f.indice ? 'font-bold text-esmeralda-700' : ''">{{ fmt(f.min, 2) }}</td>
                <td class="text-right num" :class="crit.ganadores.laplace === f.indice ? 'font-bold text-esmeralda-700' : ''">{{ fmt(f.laplace, 2) }}</td>
                <td class="text-right num" :class="crit.ganadores.hurwicz === f.indice ? 'font-bold text-esmeralda-700' : ''">{{ fmt(f.hurwicz, 2) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="calc mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span class="formula">Laplace = Σⱼ rᵢⱼ / n</span>
            <span class="formula">Hurwicz = α·Máx(rᵢⱼ) + (1 − α)·Mín(rᵢⱼ)</span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <div class="label">Matriz de arrepentimiento (Savage)</div>
          <table class="tabla">
            <thead><tr><th>Alternativa</th><th v-for="e in ESCENARIOS" :key="e.id" class="text-right">{{ e.nombre.replace('Demanda ', '') }}</th><th class="text-right">Máx.</th></tr></thead>
            <tbody>
              <tr v-for="f in crit.filas" :key="f.indice">
                <td class="whitespace-nowrap">{{ f.emoji }} {{ f.nombre }}</td>
                <td v-for="(x, j) in f.arrepentimientos" :key="j" class="text-right num">{{ fmt(x, 2) }}</td>
                <td class="text-right num" :class="crit.ganadores.savage === f.indice ? 'font-bold text-esmeralda-700' : ''">{{ fmt(f.savage, 2) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="calc mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span class="formula">arrepentimiento = máx. de la columna − rᵢⱼ</span>
            <span class="formula">Savage: MiniMax del arrepentimiento</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Resumen -->
    <div class="rounded-2xl bg-espresso text-crema p-6 flex flex-wrap items-center gap-6">
      <div class="h-14 w-14 rounded-2xl bg-esmeralda grid place-items-center">
        <Trophy :size="28" />
      </div>
      <div class="flex-1 min-w-60">
        <div class="text-xs uppercase tracking-wider text-arena-300">Decisión óptima recomendada</div>
        <div class="font-display text-2xl font-bold">
          Enfocar la compra/producción en <span class="text-esmeralda">{{ arbol.mejor.emoji }} {{ arbol.mejor.nombre }}</span>
        </div>
        <div class="calc text-sm text-arena-300 mt-1 num">
          VME = {{ arbol.mejor.resultados.map((r, j) => `${fmt(r, 2)}·${fmt(estado.decisiones.probabilidades[j], 2)}`).join(' + ') }}
          = <b class="text-crema">{{ bs(arbol.mejor.vme) }}</b>
        </div>
      </div>
      <div class="flex gap-3">
        <div v-for="r in arbol.ramas" :key="r.productoId" class="rounded-xl px-4 py-2 text-center"
          :class="r.indice === arbol.mejor.indice ? 'bg-esmeralda text-white' : 'bg-espresso-700'">
          <div class="text-[11px]">{{ r.nombre }}</div>
          <div class="num font-bold">{{ fmt(r.vme, 2) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

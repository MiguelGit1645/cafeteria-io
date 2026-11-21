<script setup>
import { ref, onMounted } from 'vue'
import { Coffee, Store, Package, Users, GitBranch, RotateCcw, Clock, AlertTriangle, FlaskConical, ClipboardList, DoorOpen, DoorClosed } from 'lucide-vue-next'
import VistaMostrador from './components/VistaMostrador.vue'
import ModuloInventarios from './components/ModuloInventarios.vue'
import ModuloColas from './components/ModuloColas.vue'
import ModuloDecisiones from './components/ModuloDecisiones.vue'
import ModuloSimulaciones from './components/ModuloSimulaciones.vue'
import ModuloReportes from './components/ModuloReportes.vue'
import BarraTienda from './components/BarraTienda.vue'
import ReporteDia from './components/ReporteDia.vue'
import { abrirTienda, cerrarTienda, reporteAbierto, reanudarSiCorresponde } from './store/simulacion.js'
import { toasts, reiniciarDemo, relojVirtual, insumosEnAlerta, pedidosEnCola, estado, hora } from './store/useCafeteria.js'

const pestanas = [
  { id: 'mostrador', nombre: 'Mostrador', icono: Store, comp: VistaMostrador },
  { id: 'inventarios', nombre: 'Inventarios', icono: Package, comp: ModuloInventarios },
  { id: 'colas', nombre: 'Colas', icono: Users, comp: ModuloColas },
  { id: 'simulaciones', nombre: 'Simulaciones', icono: FlaskConical, comp: ModuloSimulaciones },
  { id: 'decisiones', nombre: 'Decisiones', icono: GitBranch, comp: ModuloDecisiones },
  { id: 'reportes', nombre: 'Reportes', icono: ClipboardList, comp: ModuloReportes },
]
const activa = ref('mostrador')

function confirmarReinicio() {
  if (window.confirm('¿Restaurar todos los valores iniciales de la demo?')) {
    reporteAbierto.value = null
    reiniciarDemo()
  }
}
function irDesdeReporte(destino) {
  reporteAbierto.value = null
  activa.value = destino
}
onMounted(reanudarSiCorresponde)

const estiloToast = {
  info: 'bg-espresso text-crema',
  ok: 'bg-esmeralda-700 text-white',
  error: 'bg-red-700 text-white',
  alerta: 'bg-alerta text-white pulso',
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Barra superior -->
    <header class="sticky top-0 z-30 bg-espresso text-crema shadow-lg">
      <div class="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2.5 mr-2">
          <div class="h-9 w-9 rounded-xl bg-ambar grid place-items-center text-espresso">
            <Coffee :size="20" />
          </div>
          <div class="leading-tight">
            <div class="font-display text-lg font-bold">Café Mostrador IO</div>
            <div class="text-[11px] text-arena-300/80">Inventarios · Colas · Decisiones</div>
          </div>
        </div>

        <nav class="flex gap-1 bg-espresso-700 rounded-xl p-1 order-3 w-full xl:order-none xl:w-auto overflow-x-auto">
          <button
            v-for="p in pestanas"
            :key="p.id"
            @click="activa = p.id"
            class="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition whitespace-nowrap"
            :class="activa === p.id ? 'bg-crema text-espresso' : 'text-arena-300 hover:text-crema'"
          >
            <component :is="p.icono" :size="16" />
            {{ p.nombre }}
            <span
              v-if="p.id === 'inventarios' && insumosEnAlerta.length"
              class="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-alerta text-white text-[11px] grid place-items-center"
            >{{ insumosEnAlerta.length }}</span>
            <span
              v-if="p.id === 'colas'"
              class="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-ambar text-espresso text-[11px] grid place-items-center"
            >{{ pedidosEnCola.length }}</span>
          </button>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <div class="hidden sm:flex items-center gap-1.5 text-xs bg-espresso-700 rounded-lg px-2.5 py-1.5 font-mono" title="Reloj del mostrador (avanza al simular)">
            <Clock :size="14" class="text-ambar" />
            {{ hora(relojVirtual) }}
          </div>
          <button v-if="!estado.tienda.abierta" class="btn-ok" title="Abrir la tienda y simular la jornada" @click="abrirTienda()">
            <DoorOpen :size="16" /> Abrir tienda
          </button>
          <button v-else class="btn bg-alerta text-white hover:bg-red-700" title="Cerrar y generar el reporte del día" @click="cerrarTienda()">
            <DoorClosed :size="16" /> Cerrar tienda
          </button>
          <button class="btn-ambar" @click="confirmarReinicio">
            <RotateCcw :size="16" /> <span class="hidden sm:inline">Reiniciar Demo</span>
          </button>
        </div>
      </div>

      <BarraTienda />

      <!-- Franja de alertas de reorden -->
      <div v-if="insumosEnAlerta.length" class="bg-alerta/95 text-white text-sm">
        <div class="mx-auto max-w-7xl px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span class="flex items-center gap-1.5 font-semibold"><AlertTriangle :size="15" /> Reordenar:</span>
          <button
            v-for="i in insumosEnAlerta"
            :key="i.id"
            class="underline-offset-2 hover:underline"
            @click="activa = 'inventarios'"
          >
            {{ i.nombre }} —
            <template v-if="estado.pedidosProveedor.some((p) => p.insumoId === i.id)">pedido en camino 🚚</template>
            <template v-else>pedir {{ Math.round(i.Q).toLocaleString('es-BO') }} {{ i.unidad }}</template>
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6">
      <KeepAlive>
        <component :is="pestanas.find((p) => p.id === activa).comp" @ir="activa = $event" />
      </KeepAlive>
    </main>

    <footer class="text-center text-xs text-espresso-500 pb-6 space-y-1">
      <div>Proyecto de Investigación Operativa · Datos guardados localmente en este navegador</div>
      <label class="inline-flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100">
        <input v-model="estado.mostrarCalculos" type="checkbox" class="accent-[#2C1E16]" />
        Mostrar fórmulas y cálculos (defensa)
      </label>
    </footer>

    <!-- Reporte del día -->
    <Teleport to="body">
      <ReporteDia v-if="reporteAbierto" :reporte="reporteAbierto" @cerrar="reporteAbierto = null" @ir="irDesdeReporte" />
    </Teleport>

    <!-- Toasts -->
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" class="rounded-xl px-4 py-3 shadow-xl text-sm font-medium" :class="estiloToast[t.tipo]">
          {{ t.mensaje }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style>
.toast-enter-active, .toast-leave-active { transition: all .3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(30px); }
</style>

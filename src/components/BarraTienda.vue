<script setup>
// Barra de estado de la jornada mientras la tienda está abierta
import { computed } from 'vue'
import { Users, Ban, PackageX, Truck, Gauge } from 'lucide-vue-next'
import { estado, relojVirtual, pedidosEnCola, hora, horaCorta, fmt } from '../store/useCafeteria.js'

const J = computed(() => estado.jornada)
const progreso = computed(() => {
  if (!J.value) return 0
  return Math.min(100, ((relojVirtual.value - J.value.inicio) / (J.value.fin - J.value.inicio)) * 100)
})
const atendidos = computed(() =>
  J.value ? estado.pedidos.filter((p) => p.estado === 'ENTREGADO' && p.hora_llegada >= J.value.inicio).length : 0,
)
const perdidas = computed(() => (J.value ? Object.values(J.value.perdidas).reduce((a, b) => a + b, 0) : 0))
const enCamino = computed(() => estado.pedidosProveedor.length)
const VELOCIDADES = [
  { v: 30, t: 'Lenta (1 h = 30 s)' },
  { v: 10, t: 'Normal (1 h = 10 s)' },
  { v: 4, t: 'Rápida (1 h = 4 s)' },
]
</script>

<template>
  <div v-if="J" class="bg-esmeralda-700 text-white text-sm">
    <div class="mx-auto max-w-7xl px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      <span class="font-bold flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-white animate-pulse"></span>
        Abierto · Día {{ J.dia }}
      </span>
      <span class="num">{{ horaCorta(relojVirtual) }} <span class="opacity-70">/ cierre {{ horaCorta(J.fin) }}</span></span>
      <div class="w-32 h-1.5 rounded-full bg-white/25 overflow-hidden">
        <div class="h-full bg-white transition-all" :style="{ width: progreso + '%' }" />
      </div>
      <span v-if="J.puertasCerradas" class="text-xs font-semibold bg-white/20 rounded px-2 py-0.5">Puertas cerradas: atendiendo a los últimos</span>
      <span class="flex items-center gap-1" title="Clientes que llegaron / atendidos"><Users :size="14" /> <b class="num">{{ J.llegadas }}</b> llegaron · <b class="num">{{ atendidos }}</b> atendidos · <b class="num">{{ pedidosEnCola.length }}</b> en fila</span>
      <span class="flex items-center gap-1" title="Rechazados por local lleno"><Ban :size="14" /> {{ J.rechazados }}</span>
      <span class="flex items-center gap-1" title="Ventas perdidas por falta de insumos"><PackageX :size="14" /> {{ perdidas }}</span>
      <span v-if="enCamino" class="flex items-center gap-1" title="Pedidos al proveedor en camino"><Truck :size="14" /> {{ enCamino }} en camino</span>
      <label class="ml-auto flex items-center gap-1.5">
        <Gauge :size="14" />
        <select v-model.number="estado.tienda.velocidad" class="bg-white/15 rounded px-1.5 py-0.5 text-xs">
          <option v-for="o in VELOCIDADES" :key="o.v" :value="o.v" class="text-espresso">{{ o.t }}</option>
        </select>
      </label>
    </div>
  </div>
</template>

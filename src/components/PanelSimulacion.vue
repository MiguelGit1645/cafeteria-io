<script setup>
// Simulación de flujo de clientes + registro de tiempos (alimenta λ y μ en vivo)
import { ref, computed } from 'vue'
import { Zap, Users, Timer, Ban, Pencil, ChevronDown } from 'lucide-vue-next'
import {
  estado, pedidosEntregados, tasasHistorial, simularLlegadas, simularEntrega, editarServicio,
  productoPorId, fmt, bs, hora,
} from '../store/useCafeteria.js'
import { tiemposDeServicio } from '../utils/colas.js'

const verHistorial = ref(false)
const tiempos = computed(() => Object.fromEntries(tiemposDeServicio(estado.pedidos).map((t) => [t.id, t])))
const editando = ref(null)
const valorEdicion = ref(0)
function iniciarEdicion(p) {
  editando.value = p.id
  valorEdicion.value = +tiempos.value[p.id].servicioMin.toFixed(2)
}
function guardarEdicion(p) {
  editarServicio(p.id, Number(valorEdicion.value), tiempos.value[p.id].inicio)
  editando.value = null
}
const resumenItems = (p) => p.items.map((i) => `${i.cantidad}× ${productoPorId(i.productoId).nombre}`).join(', ')
</script>

<template>
  <div class="card p-5">
    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Simulación -->
      <div>
        <h2 class="card-title flex items-center gap-2"><Zap :size="18" class="text-ambar-600" /> Simulación de clientes</h2>
        <p class="text-xs text-espresso-500 mt-1 mb-3">
          Llegadas exponenciales (media 60/λ = {{ fmt(60 / estado.colas.lambda, 2) }} min) y servicios exponenciales
          (media 60/μ = {{ fmt(60 / estado.colas.mu, 2) }} min). El reloj del sistema avanza solo.
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-primary col-span-2" :disabled="estado.tienda.abierta" @click="simularLlegadas(1)"><Zap :size="16" /> Simular Llegada Rápida</button>
          <button class="btn-ghost" :disabled="estado.tienda.abierta" @click="simularLlegadas(5)">+5 llegadas</button>
          <button class="btn-ghost" :disabled="estado.tienda.abierta" @click="simularEntrega()">Atender (sim.)</button>
        </div>
        <p v-if="estado.tienda.abierta" class="text-[11px] text-esmeralda-700 mt-2">La tienda está abierta: los clientes llegan y se atienden solos.</p>
      </div>

      <!-- Tasas observadas -->
      <div class="lg:col-span-2">
        <h2 class="card-title mb-3">Tasas observadas en el mostrador</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="rounded-xl bg-crema border border-arena-300 p-3">
            <div class="label flex items-center gap-1"><Users :size="12" /> λ llegadas</div>
            <div class="font-display text-2xl font-bold num">{{ fmt(tasasHistorial.lambda, 2) }}</div>
            <div class="text-[11px] text-espresso-500">cl/h · {{ tasasHistorial.nLlegadas }} llegadas</div>
          </div>
          <div class="rounded-xl bg-crema border border-arena-300 p-3">
            <div class="label flex items-center gap-1"><Timer :size="12" /> μ servicio</div>
            <div class="font-display text-2xl font-bold num">{{ fmt(tasasHistorial.mu, 2) }}</div>
            <div class="text-[11px] text-espresso-500">cl/h · {{ tasasHistorial.nServicios }} servicios</div>
          </div>
          <div class="rounded-xl bg-crema border border-arena-300 p-3">
            <div class="label">Prom. entre llegadas</div>
            <div class="num font-semibold text-lg">{{ fmt(tasasHistorial.promedioLlegadaMin, 2) }} min</div>
          </div>
          <div class="rounded-xl bg-crema border border-arena-300 p-3">
            <div class="label">Prom. servicio</div>
            <div class="num font-semibold text-lg">{{ fmt(tasasHistorial.promedioServicioMin, 2) }} min</div>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between text-sm">
          <span class="flex items-center gap-1.5 text-red-700"><Ban :size="14" /> Rechazados por local lleno: <b class="num">{{ estado.rechazados }}</b></span>
          <button class="text-xs font-semibold text-ambar-600 hover:underline flex items-center gap-1" @click="verHistorial = !verHistorial">
            {{ verHistorial ? 'Ocultar' : 'Ver' }} historial de tiempos
            <ChevronDown :size="14" :class="verHistorial ? 'rotate-180' : ''" class="transition" />
          </button>
        </div>
      </div>
    </div>

    <!-- Historial -->
    <div v-if="verHistorial" class="mt-5 pt-4 border-t border-arena-300">
      <p class="text-xs text-espresso-500 mb-2">
        Servicio = entrega − max(llegada, entrega anterior). Edita el tiempo de servicio con el lápiz para recalcular μ.
      </p>
      <div class="overflow-x-auto max-h-80">
        <table class="tabla">
          <thead>
            <tr><th>#</th><th>Pedido</th><th>Llegada</th><th>Entrega</th><th>Servicio (min)</th><th>En sistema (min)</th><th>Total</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in pedidosEntregados" :key="p.id">
              <td class="num">{{ p.id }}<span v-if="p.simulado" class="ml-1 text-[9px] rounded bg-espresso text-crema px-1">SIM</span></td>
              <td class="text-xs">{{ resumenItems(p) }}</td>
              <td class="num text-xs">{{ hora(p.hora_llegada) }}</td>
              <td class="num text-xs">{{ hora(p.hora_entrega) }}</td>
              <td class="num">
                <div v-if="editando === p.id" class="flex gap-1">
                  <input v-model="valorEdicion" type="number" min="0.1" step="0.5" class="input !w-20 !py-0.5" @keyup.enter="guardarEdicion(p)" />
                  <button class="btn-ok !py-0.5 !px-2 text-xs" @click="guardarEdicion(p)">OK</button>
                </div>
                <button v-else class="inline-flex items-center gap-1 hover:text-ambar-600" @click="iniciarEdicion(p)">
                  {{ fmt(tiempos[p.id]?.servicioMin, 2) }} <Pencil :size="12" />
                </button>
              </td>
              <td class="num">{{ fmt(tiempos[p.id]?.sistemaMin, 2) }}</td>
              <td class="num">{{ bs(p.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

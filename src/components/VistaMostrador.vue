<script setup>
// Vista del trabajador: solo tomar la orden y entregar pedidos pendientes.
import { ref, computed } from 'vue'
import { Plus, Minus, Trash2, CheckCircle2, Clock, ShoppingBag } from 'lucide-vue-next'
import {
  estado, pedidosEnCola, pedidosEntregados, disponible, registrarPedido, entregarPedido,
  productoPorId, notificar, fmt, bs, hora, horaCorta, relojVirtual,
} from '../store/useCafeteria.js'

// ---------- Pedido actual ----------
const carrito = ref({})
const lineas = computed(() =>
  Object.entries(carrito.value)
    .filter(([, c]) => c > 0)
    .map(([id, cantidad]) => ({ producto: productoPorId(id), cantidad })),
)
const totalCarrito = computed(() => lineas.value.reduce((s, l) => s + l.producto.precio * l.cantidad, 0))

function agregar(p, delta = 1) {
  const nuevo = Math.max(0, (carrito.value[p.id] || 0) + delta)
  if (delta > 0 && !disponible(p, nuevo)) {
    notificar(`No hay suficiente para ${nuevo} × ${p.nombre}`, 'error')
    return
  }
  carrito.value = { ...carrito.value, [p.id]: nuevo }
}
function quitar(id) {
  const c = { ...carrito.value }
  delete c[id]
  carrito.value = c
}

function confirmar() {
  const r = registrarPedido(lineas.value.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })))
  if (r.ok) {
    carrito.value = {}
    notificar(`Pedido #${r.pedido.id} registrado · ${bs(r.pedido.total)}`, 'ok', 2500)
  }
}

// ---------- Pendientes ----------
const espera = (p) => Math.max(0, (relojVirtual.value - p.hora_llegada) / 60000)
const entregadosRecientes = computed(() => pedidosEntregados.value.slice(0, 5))
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-5">
    <!-- ================= Menú ================= -->
    <section class="lg:col-span-3 card p-5">
      <h2 class="card-title mb-4">Menú</h2>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="p in estado.productos"
          :key="p.id"
          :disabled="!disponible(p)"
          @click="agregar(p)"
          class="relative rounded-2xl border-2 p-5 text-left transition active:scale-[.98]"
          :class="disponible(p)
            ? 'border-arena-300 bg-crema hover:border-ambar hover:shadow-md'
            : 'border-arena bg-arena/40 opacity-60 cursor-not-allowed'"
        >
          <span
            v-if="carrito[p.id]"
            class="absolute top-3 right-3 h-7 min-w-7 px-2 rounded-full bg-espresso text-crema text-sm font-bold grid place-items-center"
          >{{ carrito[p.id] }}</span>
          <div class="text-4xl">{{ p.emoji }}</div>
          <div class="mt-2 font-semibold text-lg leading-tight">{{ p.nombre }}</div>
          <div class="font-display text-xl font-bold text-ambar-600">{{ bs(p.precio) }}</div>
          <div v-if="!disponible(p)" class="mt-1 text-xs font-bold text-red-700 uppercase">Agotado</div>
        </button>
      </div>
    </section>

    <!-- ================= Pedido actual ================= -->
    <section class="lg:col-span-2 card p-5 flex flex-col">
      <h2 class="card-title mb-4 flex items-center gap-2"><ShoppingBag :size="18" /> Pedido actual</h2>
      <div v-if="!lineas.length" class="flex-1 grid place-items-center text-sm text-espresso-500 py-10 text-center">
        Toca un producto del menú para agregarlo.
      </div>
      <ul v-else class="flex-1 space-y-2">
        <li v-for="l in lineas" :key="l.producto.id" class="flex items-center gap-3 rounded-xl bg-crema border border-arena-300 px-3 py-2">
          <span class="text-2xl">{{ l.producto.emoji }}</span>
          <div class="flex-1">
            <div class="font-medium leading-tight">{{ l.producto.nombre }}</div>
            <div class="text-xs text-espresso-500 num">{{ bs(l.producto.precio) }} c/u</div>
          </div>
          <button class="h-8 w-8 rounded-lg bg-arena grid place-items-center" @click="agregar(l.producto, -1)"><Minus :size="14" /></button>
          <span class="w-6 text-center num font-bold">{{ l.cantidad }}</span>
          <button class="h-8 w-8 rounded-lg bg-espresso text-crema grid place-items-center" @click="agregar(l.producto, 1)"><Plus :size="14" /></button>
          <button class="h-8 w-8 rounded-lg text-red-700 hover:bg-red-50 grid place-items-center" @click="quitar(l.producto.id)"><Trash2 :size="15" /></button>
        </li>
      </ul>
      <div class="mt-4 pt-4 border-t border-arena-300">
        <div class="flex items-baseline justify-between mb-3">
          <span class="text-espresso-500">Total</span>
          <span class="font-display text-3xl font-bold">{{ bs(totalCarrito) }}</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button class="btn-ghost" :disabled="!lineas.length" @click="carrito = {}">Limpiar</button>
          <button class="btn-primary col-span-2 !py-3 text-base" :disabled="!lineas.length" @click="confirmar">Registrar pedido</button>
        </div>
      </div>
    </section>

    <!-- ================= Pedidos por entregar ================= -->
    <section class="lg:col-span-5 card p-5">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 class="card-title">Pedidos por entregar ({{ pedidosEnCola.length }})</h2>
        <span class="text-xs text-espresso-500">En orden de llegada · el primero es el que se está preparando</span>
      </div>
      <div v-if="!pedidosEnCola.length" class="text-center text-espresso-500 py-8">
        <CheckCircle2 :size="28" class="mx-auto text-esmeralda mb-2" />
        No hay pedidos pendientes.
      </div>
      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="(p, idx) in pedidosEnCola"
          :key="p.id"
          class="rounded-2xl border-2 p-4 flex flex-col"
          :class="idx === 0 ? 'border-ambar bg-ambar/10' : 'border-arena-300 bg-crema'"
        >
          <div class="flex items-center justify-between">
            <span class="font-display text-2xl font-bold">#{{ p.id }}</span>
            <span class="text-[11px] font-bold uppercase rounded-full px-2 py-0.5" :class="idx === 0 ? 'bg-ambar text-espresso' : 'bg-arena'">
              {{ idx === 0 ? 'Preparando' : `En espera · ${idx}°` }}
            </span>
          </div>
          <ul class="mt-2 flex-1 text-sm space-y-0.5">
            <li v-for="it in p.items" :key="it.productoId">
              <b class="num">{{ it.cantidad }}×</b> {{ productoPorId(it.productoId).emoji }} {{ productoPorId(it.productoId).nombre }}
            </li>
          </ul>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-xs text-espresso-500 flex items-center gap-1 num">
              <Clock :size="13" /> {{ horaCorta(p.hora_llegada) }} · {{ fmt(espera(p), 0) }} min
            </span>
            <button class="btn-ok" @click="entregarPedido(p.id)"><CheckCircle2 :size="16" /> Entregado</button>
          </div>
        </div>
      </div>

      <div v-if="entregadosRecientes.length" class="mt-5 pt-4 border-t border-arena-300">
        <div class="text-xs font-semibold text-espresso-500 mb-2">Últimos entregados</div>
        <div class="flex flex-wrap gap-2">
          <span v-for="p in entregadosRecientes" :key="p.id" class="text-xs rounded-full bg-esmeralda/10 text-esmeralda-700 px-3 py-1 num">
            #{{ p.id }} · {{ horaCorta(p.hora_entrega) }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

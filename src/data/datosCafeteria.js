// =====================================================================
//  DATOS INICIALES CALIBRADOS PARA LA DEFENSA (moneda: Bs.)
//  Todos los valores están elegidos para poder verificarse a mano.
// =====================================================================
//
//  Unidad de tiempo: 1 DÍA = 1 jornada de atención (08:00 a 15:00, 7 horas)
//    d  = demanda por día           K = costo de ordenar (Bs./pedido)
//    h  = costo de mantener (Bs./unidad/día)
//    p  = costo por faltante (Bs./unidad/día)
//    tiempoEntrega = plazo de entrega en días (jornadas) -> μ = d · tiempoEntrega
//
//  Coherencia con la simulación: λ = 8 clientes/h × 7 h = 56 clientes/día
//    Mezcla: Latte 30 %, Capuccino 25 %, Mocha 19 %, Croissant 26 %
//    → ≈ 41 bebidas/día × 18 g ≈ 750 g de café/día (d = 760) ; 15 croissants/día
//
//  VERIFICACIÓN RÁPIDA (valores iniciales):
//  • Café en grano: μ = 760·0,5 = 380 g ; R = 380 + 1,645·24 = 419,48 g
//      Stock 450 g → vender 2 Latte (2·18 g) deja 414 g ≤ R ⇒ ALERTA
//      Q = √(2·760·15/0,01)·√((0,04+0,01)/0,04) = 1509,97·1,1180 = 1688,2 g
//  • Leche: μ = 7000·0,3 = 2100 ml ; R = 2100 + 0,675·300 = 2302,5 ml
//      Q = √(2·7000·10/0,002)·√((0,006+0,002)/0,006) = 8366,6·1,1547 = 9660,9 ml
//  • Vasos (EOQ): Q* = √(2·40·20/0,01) = 400 vasos ; R = 40·0,5 = 20
//  • Azúcar (EOQ): Q* = √(2·40·10/0,005) = 400 sobres ; R = 40·1 = 40
//  • Chocolate (EOQ): Q* = √(2·250·15/0,0075) = 1000 g ; R = 250·1 = 250
//  • Croissant (un periodo): F(S*) = (10−3,5)/(10+1) = 0,5909
//      Uniforme(10, 20): S* = 10 + 0,5909·10 = 15,91 ≈ 16 croissants/día
//  • ABC (30 días): Café 2850, Leche 1680, Croissant 1575 → A (77,8 %)
//                   Vasos 960 → B (90,1 %) ; Chocolate 600, Azúcar 180 → C
// =====================================================================

export const INSUMOS = [
  {
    id: 'cafe',
    nombre: 'Café en grano',
    unidad: 'g',
    stock: 450,
    costo: 0.125, // Bs./g (125 Bs./kg)
    modelo: 'estocastico',
    d: 760,
    K: 15,
    h: 0.01,
    p: 0.04,
    tiempoEntrega: 0.5,
    sigma: 24,
    nivelServicio: 0.95,
    distribucionLT: 'normal', // demanda durante el tiempo de entrega: 'normal' | 'uniforme'
    aLT: 340,
    bLT: 420,
    consumoHistorico: 22800, // 30 días · 760 g
  },
  {
    id: 'leche',
    nombre: 'Leche entera',
    unidad: 'ml',
    stock: 3000,
    costo: 0.008, // 8 Bs./L
    modelo: 'estocastico',
    d: 7000,
    K: 10,
    h: 0.002,
    p: 0.006,
    tiempoEntrega: 0.3,
    sigma: 300,
    nivelServicio: 0.75,
    distribucionLT: 'normal',
    aLT: 1600,
    bLT: 2600,
    consumoHistorico: 210000,
  },
  {
    id: 'vaso',
    nombre: 'Vasos térmicos',
    unidad: 'unid',
    stock: 50,
    costo: 0.8,
    modelo: 'eoq',
    d: 40,
    K: 20,
    h: 0.01,
    tiempoEntrega: 0.5,
    consumoHistorico: 1200,
  },
  {
    id: 'azucar',
    nombre: 'Azúcar (sobres)',
    unidad: 'sobres',
    stock: 120,
    costo: 0.15,
    modelo: 'eoq',
    d: 40,
    K: 10,
    h: 0.005,
    tiempoEntrega: 1,
    consumoHistorico: 1200,
  },
  {
    id: 'chocolate',
    nombre: 'Salsa de chocolate',
    unidad: 'g',
    stock: 500,
    costo: 0.08,
    modelo: 'eoq',
    d: 250,
    K: 15,
    h: 0.0075,
    tiempoEntrega: 1,
    consumoHistorico: 7500,
  },
  {
    id: 'croissant',
    nombre: 'Croissants frescos',
    unidad: 'unid',
    stock: 15,
    costo: 3.5, // c: costo de producción
    modelo: 'perecedero',
    d: 15,
    p: 10, // precio perdido por faltante
    h: 1, // costo de mantener lo que sobra al final del día menos su valor de rescate (puede ser negativo)
    Kprep: 0, // costo de preparación del horneado (K); con K > 0 se usa la política (s*, S*)
    distribucion: 'uniforme',
    a: 10,
    b: 20,
    mu: 15,
    sigmaDemanda: 3,
    consumoHistorico: 450,
  },
]

// Recetas: cantidad de cada insumo que se descuenta por unidad vendida
export const PRODUCTOS = [
  {
    id: 'latte',
    nombre: 'Café Latte',
    precio: 15,
    emoji: '☕',
    receta: [
      { insumoId: 'cafe', cantidad: 18 },
      { insumoId: 'leche', cantidad: 200 },
      { insumoId: 'vaso', cantidad: 1 },
      { insumoId: 'azucar', cantidad: 1 },
    ],
  },
  {
    id: 'capuccino',
    nombre: 'Capuccino',
    precio: 14,
    emoji: '🥛',
    receta: [
      { insumoId: 'cafe', cantidad: 18 },
      { insumoId: 'leche', cantidad: 150 },
      { insumoId: 'vaso', cantidad: 1 },
      { insumoId: 'azucar', cantidad: 1 },
    ],
  },
  {
    id: 'mocha',
    nombre: 'Mocha Especial',
    precio: 20,
    emoji: '🍫',
    receta: [
      { insumoId: 'cafe', cantidad: 18 },
      { insumoId: 'leche', cantidad: 150 },
      { insumoId: 'chocolate', cantidad: 25 },
      { insumoId: 'vaso', cantidad: 1 },
      { insumoId: 'azucar', cantidad: 1 },
    ],
  },
  {
    id: 'croissant',
    nombre: 'Croissant del día',
    precio: 10,
    emoji: '🥐',
    receta: [{ insumoId: 'croissant', cantidad: 1 }],
  },
]
// Costos de receta: Latte 4,80 · Capuccino 4,40 · Mocha 6,40 · Croissant 3,50
// Utilidad unitaria: Latte 10,20 · Capuccino 9,60 · Mocha 13,60 · Croissant 6,50

// Colas: M/M/1/K con λ = 8 cl/h, μ = 10 cl/h, K = 10
export const PARAMETROS_COLAS = {
  K: 10,
  lambda: 8,
  mu: 10,
  sComparar: 2,
  fuente: 'historial', // 'historial' (en vivo) | 'manual'
}

// Operación de la tienda (simulación de jornadas)
export const PARAMETROS_TIENDA = {
  abierta: false,
  dia: 0,
  horaApertura: 8, // 08:00
  horas: 7, // jornada de 7 h (08:00 a 15:00)
  velocidad: 10, // segundos reales por cada hora de la cafetería
  reposicionAuto: true, // pedir Q al proveedor cuando el stock llega a R
  // Probabilidad de que un cliente pida cada producto
  mezcla: { latte: 0.3, capuccino: 0.25, mocha: 0.19, croissant: 0.26 },
}

/**
 * 3 pedidos entregados + 1 en cola, generados relativos al momento del reinicio.
 * Llegadas cada 7,5 min  → λ = 60/7,5 = 8 clientes/h
 * Servicios de 5, 6 y 7 min → media 6 min → μ = 60/6 = 10 clientes/h
 */
export function crearPedidosIniciales(ahora = Date.now()) {
  const min = 60 * 1000
  return [
    {
      id: 1,
      items: [{ productoId: 'latte', cantidad: 1 }],
      total: 15,
      estado: 'ENTREGADO',
      hora_llegada: ahora - 30 * min,
      hora_entrega: ahora - 25 * min,
      simulado: false,
    },
    {
      id: 2,
      items: [{ productoId: 'capuccino', cantidad: 1 }, { productoId: 'croissant', cantidad: 1 }],
      total: 24,
      estado: 'ENTREGADO',
      hora_llegada: ahora - 22.5 * min,
      hora_entrega: ahora - 16.5 * min,
      simulado: false,
    },
    {
      id: 3,
      items: [{ productoId: 'mocha', cantidad: 1 }],
      total: 20,
      estado: 'ENTREGADO',
      hora_llegada: ahora - 15 * min,
      hora_entrega: ahora - 8 * min,
      simulado: false,
    },
    {
      id: 4,
      items: [{ productoId: 'latte', cantidad: 1 }],
      total: 15,
      estado: 'EN_COLA',
      hora_llegada: ahora - 7.5 * min,
      hora_entrega: null,
      simulado: false,
    },
  ]
}

// Árbol de decisión: ¿en qué producto enfocar la compra/producción del próximo día?
// Historial inicial de 20 días: 5 de demanda baja, 10 media, 5 alta → p = 0,25 / 0,50 / 0,25
// Un día se clasifica por la cantidad de clientes que llegan, frente a lo esperado λ·horas = 56:
//   z = (N − 56)/√56 ;  z < −0,674 → baja ;  z > 0,674 → alta ;  si no → media
export const ESCENARIOS = [
  { id: 'baja', nombre: 'Demanda Baja', diasHistorial: 5 },
  { id: 'media', nombre: 'Demanda Media', diasHistorial: 10 },
  { id: 'alta', nombre: 'Demanda Alta', diasHistorial: 5 },
]

// r_ij = unidades_j · utilidad_i − costo fijo diario_i
//  Latte:     12/17/22 · 10,20 − 60 → 62,4 / 113,4 / 164,4   → VME = 113,4 ✔ ganador
//  Capuccino: 10/14/18 · 9,60  − 30 → 66 / 104,4 / 142,8     → VME = 104,4
//  Mocha:     4/10/18  · 13,60 − 70 → −15,6 / 66 / 174,8     → VME = 72,8
export const ALTERNATIVAS = [
  { productoId: 'latte', costoFijo: 60, unidades: [12, 17, 22] },
  { productoId: 'capuccino', costoFijo: 30, unidades: [10, 14, 18] },
  { productoId: 'mocha', costoFijo: 70, unidades: [4, 10, 18] },
]

export function crearEstadoInicial() {
  const total = ESCENARIOS.reduce((s, e) => s + e.diasHistorial, 0)
  const ahora = Date.now()
  return {
    version: 4,
    insumos: JSON.parse(JSON.stringify(INSUMOS)).map((i) => ({ ...i, d0: i.d })),
    productos: JSON.parse(JSON.stringify(PRODUCTOS)),
    pedidos: crearPedidosIniciales(ahora),
    siguienteId: 5,
    rechazados: 0,
    desfaseReloj: 0, // ms que el reloj virtual va adelantado (por simulaciones)
    colas: { ...PARAMETROS_COLAS },
    tienda: JSON.parse(JSON.stringify(PARAMETROS_TIENDA)),
    jornada: null, // contadores del día en curso
    pedidosProveedor: [], // pedidos de reposición en camino
    historialDias: [], // reportes de cada día cerrado
    decisiones: {
      alternativas: JSON.parse(JSON.stringify(ALTERNATIVAS)),
      probabilidades: ESCENARIOS.map((e) => e.diasHistorial / total),
      // Acumulado por escenario: días y demanda total por producto (para promediar unidades)
      historial: ESCENARIOS.map((e, j) => ({
        dias: e.diasHistorial,
        suma: Object.fromEntries(ALTERNATIVAS.map((a) => [a.productoId, a.unidades[j] * e.diasHistorial])),
      })),
    },
    consumoVivo: {}, // insumoId -> cantidad consumida en la demo
    // Historial de niveles de stock para la gráfica: insumoId -> [{ t, stock, tipo }]
    movimientos: Object.fromEntries(INSUMOS.map((i) => [i.id, [{ t: ahora, stock: i.stock, tipo: 'inicial' }]])),
    alertas: [],
    mostrarCalculos: false, // fórmulas y cálculos paso a paso (ocultos para el uso diario)
  }
}

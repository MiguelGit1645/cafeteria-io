# ☕ Café Mostrador IO — Investigación Operativa

Sistema de gestión operativa para una cafetería pequeña (moneda **Bs.**) que une en tiempo real
**Teoría de Inventarios**, **Teoría de Colas** y **Teoría de Decisiones**.
Stack: Vue 3 (`<script setup>`) + Vite + Tailwind CSS v4 + Lucide Icons. Sin backend: datos semilla + `localStorage`.

## Ejecutar localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera /dist
npm run preview    # sirve /dist en http://localhost:4173
```

Requiere Node.js 20.19+ o 22.12+.

## Desplegar en Vercel

**Opción A: CLI**
```bash
npm i -g vercel
vercel            # acepta los valores detectados (Framework: Vite)
vercel --prod
```

**Opción B: GitHub**
```bash
git init && git add . && git commit -m "Cafetería IO"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cafeteria-io.git
git push -u origin main
```
Luego en vercel.com → *Add New → Project* → importa el repo. Vercel detecta Vite solo
(Build: `npm run build`, Output: `dist`). No hace falta `vercel.json`.

## Estructura

```
src/
├── data/datosCafeteria.js     Datos iniciales calibrados (con la verificación manual comentada)
├── utils/inventarios.js       ABC, EOQ, revisión continua (Q, R, SS), un solo periodo (S*)
├── utils/colas.js             M/M/1/K, M/M/s/K, estimación de λ y μ desde el historial
├── utils/decisiones.js        r_ij, VME, ajuste de probabilidades
├── store/useCafeteria.js      Estado reactivo + localStorage + acciones del mostrador
├── components/
│   ├── VistaMostrador.vue      Vista del trabajador: menú, pedido actual, pedidos por entregar
│   ├── ModuloInventarios.vue   Tarjetas por insumo + ABC general
│   ├── DetalleInsumo.vue       Ventana del insumo: stock, gráfica y teoría de su modelo
│   ├── GraficaInventario.vue   Gráfica diente de sierra (R, SS, pedidos, llegadas)
│   ├── ModuloColas.vue         M/M/1/K del mostrador + PanelSimulacion.vue (llegadas/tiempos)
│   ├── ModuloSimulaciones.vue  Mejorar el servicio: M/M/1/K vs M/M/s/K
│   └── ModuloDecisiones.vue    Árbol de decisión y VME
├── App.vue                    Pestañas, reloj, alertas y botón "Reiniciar Demo"
├── main.js · style.css
```

## Abrir y cerrar tienda (simulación de jornadas)

- **Abrir tienda** (barra superior o pestaña Reportes): empieza una jornada de 08:00 a 15:00 con reloj acelerado
  (1 h = 10 s por defecto). Los clientes llegan solos (Poisson, λ = 8/h), piden según la mezcla de productos
  y el barista los entrega en orden (servicio exponencial, μ = 10/h). Con K = 10 en el local, el siguiente se va.
- Cada venta descuenta insumos. Si un insumo llega a R se pide Q al proveedor automáticamente y llega tras el
  plazo de entrega. Si falta un insumo, la venta se pierde. Al abrir se hornea S* − I de croissants y al cerrar
  lo que sobra se desperdicia.
- **Cerrar tienda**: se cierran las puertas, se atiende a quienes siguen adentro y se genera el **reporte del día**
  (ventas y demanda por producto, más vendido, más rentable, recomendación VME, espera real vs. M/M/1/K, inventario).
- El día se suma al historial: se clasifica como demanda baja/media/alta (por clientes que llegaron vs. λ·horas),
  se actualizan las probabilidades y unidades del árbol de decisión y la demanda d de cada insumo (Q, R, S*).
- **Simular semana**: corre 7 jornadas al instante.

## Guion sugerido para la defensa

1. **Reiniciar Demo**.
2. Mostrador → agrega **2 × Café Latte** → *Registrar pedido*.
   Café: 450 − 36 = **414 g ≤ R = 419,48 g** → salta la alerta "pedir Q = 1.688,19 g".
3. Colas → *Simular Llegada Rápida* / *Atender (sim.)* → λ y μ cambian en vivo.
4. Simulaciones → compara **s = 1 vs s = 2** (Wq ≈ 16,78 min → 1,14 min con λ = 8, μ = 10, K = 10).
5. Inventarios → toca **Café en grano**: stock, gráfica de inventario, Q, R y SS. Toca **Croissants**: S* = 16.
6. Decisiones → VME: Latte 113,4 · Capuccino 104,4 · Mocha 72,8 → gana **Latte**.
   MaxiMax elige Mocha, MaxiMin elige Capuccino: buena discusión de actitud frente al riesgo.
7. **Abrir tienda**, dejar correr la jornada (~70 s) o **Cerrar tienda** → reporte del día.
8. Reportes → **Simular semana** → historial, demanda promedio por producto y árbol actualizado.

## Fórmulas en pantalla

Las fórmulas y los cálculos paso a paso están ocultos para el uso diario de la cafetería.
Para la defensa, activa **"Mostrar fórmulas y cálculos (defensa)"** al pie de la página.

## Alineación con el material de la materia

- Colas: M/M/1/K y M/M/s/K (s ≤ K) con P₀, Pₙ, Ls, Lq, λ̄ = λ(1 − P_K), Ws = Ls/λ̄, Wq = Lq/λ̄.
- Inventarios: EOQ básico (con gráfica de costos), revisión continua con demanda en el tiempo de entrega
  Normal (R = μ + K₁₋L·σ) o Uniforme (R = a + L(b − a), SS = (L − ½)(b − a)), un solo periodo con
  F(S*) = (p − c)/(p + h), inventario inicial I (ordenar S* − I) y costo de preparación K (política s*, S*),
  clasificación ABC 80/15/5.
- Decisiones: matriz de pagos, VME y árbol (□ decisión, ○ incertidumbre), más MaxiMax, MaxiMin, Laplace,
  Hurwicz (α) y Savage (arrepentimiento).

## Valores de verificación (datos iniciales)

| Concepto | Cálculo | Resultado |
|---|---|---|
| R café | 380 + 1,645·24 | 419,48 g |
| Q café | √(2·760·15/0,01)·√(0,05/0,04) | 1.688,19 g |
| R leche | 2100 + 0,675·300 | 2.302,5 ml |
| EOQ vasos | √(2·40·20/0,01) | 400 |
| M/M/1/K P₀ | 0,2/(1−0,8¹¹) | 0,2188 |
| M/M/1/K P_K | 0,2188·0,8¹⁰ | 0,0235 |
| Ls / Lq | — | 2,9663 / 2,1851 |
| Ws / Wq | Ls/λ̄, Lq/λ̄ (λ̄ = 7,8121) | 22,78 / 16,78 min |
| M/M/2/K Wq | — | 1,14 min |

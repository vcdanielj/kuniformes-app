# PRD — Sistema Administrativo K-Uniformes (v1.3)

**Cliente:** K-Uniformes Venezuela (`@k_uniformesvzla`)
**Tipo:** Sistema administrativo interno (single-tenant)
**Plataforma:** Web responsive (PC + móvil)
**Stack:** Next.js (en Cloudflare Pages/Workers vía OpenNext o Hono+Vite) · **Cloudflare D1** (SQLite) · **R2** (imágenes/PDFs) · **Workers** (API) · **Cron Triggers** (tasa) · Auth propia (JWT/Lucia sobre D1)
**Despliegue objetivo:** **Plan gratuito de Cloudflare** (Workers Free)
**Autor:** Arizon Latinoamérica C.A.
**Estado:** Borrador para validación

> **Cambios v1.1:** módulos **Compras/Reposición**, **Clientes (CRM)**, **Devoluciones/Cambios** y **motor de documentos PDF con marca**.
>
> **Cambios v1.2:** **imagen por Modelo+Color**; ventas en Bs con **tasa paralelo por defecto** (editable); **productos sin tallas (gorros)**.
>
> **Cambios v1.3:** despliegue en **plan gratuito de Cloudflare**. Se migra el stack a **Cloudflare D1 + R2 + Workers**; se rediseña la generación de PDF para que funcione en Workers (sin headless Chrome); se añade la **§9 Arquitectura y restricciones del free tier**.

---

## 0. Resumen ejecutivo

K-Uniformes es una tienda online de uniformes médicos importados que opera principalmente vía Instagram/WhatsApp. Hoy la gestión de inventario, ventas, consignación y gastos es **manual e ineficiente** para su volumen. Este sistema reemplaza ese flujo con una herramienta web minimalista, elegante y altamente automatizada.

**Objetivos del producto:**
1. Centralizar el inventario por SKU (modelo + color + talla) con descuento automático de stock en cada venta.
2. Cerrar el ciclo de inventario: **compras suben stock, ventas lo bajan**, devoluciones lo reincorporan.
3. Registrar ventas multi-producto y multi-pago en segundos, con conversión automática USD/Bs.
4. Controlar la consignación (mercancía entregada a terceros) con cuenta corriente de abonos y devoluciones.
5. Llevar clientes, gastos y despachos.
6. Generar documentos comerciales con marca K-Uniformes: **Cotización, Venta, Nota de Entrega y catálogos**, todos exportables a PDF.
7. Ofrecer un panel inicial que resuma el estado del negocio de un vistazo.
8. Que **todo sea configurable** (colores, categorías, modelos, métodos de pago, transportistas, proveedores, umbrales).

**Principios de diseño:** lo menos manual posible · minimalista y profesional · UI limpia con UX impecable · responsive real (la dueña opera desde PC y teléfono).

---

## 1. Decisiones de diseño asumidas (validar)

Estas decisiones fueron tomadas como default donde el cliente respondió "tú decide". Confirmar antes de construir:

| # | Decisión | Default elegido | Razón |
|---|----------|-----------------|-------|
| D1 | Definición de SKU | **Modelo + Color + Talla** (ej. `42168-Z21-M`) generado automáticamente | Es la única forma de cuadrar el stock real visto en el catálogo |
| D2 | Costo de compra | **Sí — ahora derivado de Compras** (costo real por lote, costo promedio ponderado) | El módulo de Compras alimenta el costo; ya no es un campo manual suelto |
| D3 | Tasa de cambio | **Paralelo por defecto** para consolidar Bs→USD, automática con override manual + fallback. BCV disponible como alterna | Solicitado por el cliente: las ventas en Bs se consolidan a la tasa paralelo |
| D4 | Precio de venta | Por **modelo** (igual para todas sus tallas/colores), con override opcional por SKU | Simplifica la carga |
| D5 | Venta | **Carrito multi-ítem + pago mixto** | Refleja la operación real |
| D6 | Cliente en venta | **Opcional** pero con ficha CRM cuando se registra | Flexibilidad + historial |
| D7 | Documentos | **PDF con marca K-Uniformes**, numeración correlativa, no fiscal | Lo solicitado explícitamente |
| D8 | Abono de consignación | Contra **cuenta corriente** del consignatario (no por lote) | Coincide con lo descrito |
| D9 | Costeo de inventario | **Costo promedio ponderado** al recibir compras | Estándar para retail con importaciones a distinto costo |
| D10 | Imagen de producto | **Una imagen por Modelo + Color** (no por talla) | La foto cambia con el color, no con la talla |
| D11 | Tipos de producto | **Con matriz de tallas** (uniformes) y **sin tallas / talla única** (gorros y accesorios) | También se venden gorros |

---

## 2. Roles y usuarios (Módulo de usuarios)

Autenticación propia con **JWT/sesiones (Lucia u opción equivalente) sobre D1**. Control de acceso por rol aplicado en el Worker (middleware), no por RLS de base de datos.

| Rol | Permisos |
|-----|----------|
| **Administrador (dueña)** | Acceso total: configuración, usuarios, compras, inventario, ventas, devoluciones, clientes, consignación, gastos, despachos, documentos, reportes |
| **Vendedor** | Cotizaciones, ventas, consulta de stock, clientes, despachos, devoluciones. Sin acceso a compras, costos, gastos ni configuración |
| **Consignatario** *(opcional v2)* | Solo lectura de su propia cuenta de consignación |

**Funciones:** crear/editar/desactivar usuarios · asignar rol · audit trail (quién hizo qué).

---

## 3. Módulos funcionales

### 3.1 Panel inicial (Dashboard)

Pantalla de entrada. Tarjetas + gráficos. Selector de rango (Hoy / Semana / Mes / Personalizado).

**Métricas confirmadas:**
- Ventas del día / mes (USD y Bs, nº de transacciones).
- Facturación vs Gastos (gráfico → utilidad).
- Ganancia neta (con costo real de Compras).
- Stock bajo (SKUs bajo umbral configurable).
- Top productos más vendidos (por unidades / monto).
- Deuda total en consignación.
- Gastos del mes (total + desglose por categoría).
- Distribución por método de pago (Bs / Zelle / Binance / Efectivo).

**Extras:** tasa paralelo del día en el header · alertas de stock 0/umbral · valor total del inventario a costo (derivado de Compras).

---

### 3.2 Compras / Reposición de inventario  🆕

Reverso de las ventas. Registra entradas de mercancía (importaciones) y mantiene el costo real.

**Entidad Proveedor (configurable):**
- Nombre, contacto, país/origen, notas.

**Orden de Compra / Recepción:**
- Proveedor + fecha + moneda + (opcional) costos de importación (flete, aduana) prorrateables.
- Detalle por SKU: cantidad recibida + costo unitario del lote.
- Al confirmar la recepción → **suma stock automáticamente** y **recalcula el costo promedio ponderado** de cada SKU.
- Número de lote / referencia de importación.

**Impacto en el sistema:**
- El costo promedio alimenta el cálculo de **margen y ganancia neta** en ventas y dashboard.
- Historial de compras por proveedor y por producto.
- Valuación de inventario a costo (cuánto vale el stock actual).

**Estados:** borrador · recibida (parcial/total).

---

### 3.3 Inventario centralizado

**Tipos de producto:**
- **Con tallas** (uniformes): generan matriz de SKUs por talla.
- **Sin tallas / talla única** (gorros y accesorios): el SKU se define solo por Modelo + Color (o Modelo simple si tampoco tiene color). No se genera matriz de tallas.

**Jerarquía:** `Modelo → (colores × tallas) → SKU (stock propio)` para uniformes; `Modelo → colores → SKU` para gorros.

```
Modelo (producto base)
 ├─ código (42168), diseño, composición, categoría
 ├─ tipo: con_tallas | sin_tallas (gorros/accesorios)
 ├─ precio de venta base (USD)
 ├─ costo promedio (derivado de Compras)
 ├─ colores disponibles  ──┐   cada color lleva su IMAGEN
 └─ tallas disponibles  ───┴─→ SKU = Modelo+Color+Talla (o Modelo+Color en gorros)
                                ├─ código (42168-Z21-M)
                                ├─ stock
                                └─ precio override (opcional)
```

**Imagen por Modelo + Color:** cada combinación de color de un modelo tiene su propia imagen (la foto cambia con el color, no con la talla). Se almacena en **Cloudflare R2** (no en la base de datos) y se referencia por URL desde `model_color_images`. Se usa en el inventario, las cotizaciones/ventas y los catálogos PDF. Carga y previsualización desde la ficha del modelo, con compresión/redimensionado en el cliente antes de subir para ahorrar espacio.

**Catálogos globales configurables:** colores (código Z + nombre + muestra), tallas, categorías.

**Funciones:**
- Alta de modelo → elegir tipo (con/sin tallas) → seleccionar colores (y tallas si aplica) → matriz de SKUs generada.
- **Carga de imagen por color** en la ficha del modelo.
- Carga rápida tipo matriz (colores × tallas).
- Stock sube por **Compras**, baja por **Ventas/Consignación**, vuelve por **Devoluciones**.
- Ajustes manuales con motivo (kardex).
- Consulta desglosada + filtros + búsqueda.
- Umbral de stock bajo configurable (global / por modelo).

---

### 3.4 Cotizaciones  🆕

Documento previo a la venta. Misma mecánica que el carrito de venta pero **sin afectar stock**.

**Funciones:**
- Armar cotización (cliente opcional, ítems, cantidades, precios, tasa del día).
- Numeración correlativa propia (ej. `COT-0001`).
- Vigencia/validez configurable (ej. "válida 7 días").
- Exportable a **PDF con marca**.
- **Convertir cotización → venta** en un clic (hereda ítems; ahí sí descuenta stock).
- Estados: borrante · enviada · aceptada · vencida · convertida.

---

### 3.5 Ventas y facturación

**Flujo:** buscar producto → color (+ talla si aplica) → cantidad → carrito multi-ítem → (opcional) cliente → método(s) de pago (mixto) → tasa paralelo del día automática (editable) → confirmar → descuenta stock → genera Venta + Nota de Entrega.

**Métodos de pago (configurables):** Bolívares · Zelle · Binance · Efectivo divisas.

**Conversión de moneda:** las ventas en **Bs se consolidan a dólares usando la tasa paralelo por defecto**. La tasa se actualiza automáticamente con un **Cron Trigger de Cloudflare Workers** (disponible en el free tier) que consulta una fuente paralelo una o dos veces al día y la guarda en D1. La tasa aplicada es **visible y editable en cada venta** (override manual); BCV queda como alterna. Fallback a la última tasa guardada si la fuente falla. Cada venta guarda la tasa usada para reportes históricos correctos.

**Documentos generados:** comprobante de **Venta** y **Nota de Entrega**, ambos PDF con marca (ver §3.10).

---

### 3.6 Devoluciones y cambios de venta  🆕

Distinto de las devoluciones de consignación. Aplica a clientes finales.

**Devolución:**
- Seleccionar venta original → elegir ítem(s) a devolver.
- **Reingresa stock** del/los SKU.
- Resolver el dinero: reembolso (Bs/Zelle/Binance/efectivo) o **nota de crédito** (saldo a favor del cliente).

**Cambio (muy común en ropa):**
- Cambiar talla/color o producto.
- Sale el SKU nuevo del stock, entra el devuelto.
- Ajuste de diferencia de precio (cobro o devolución parcial).

**Registro:** motivo, fecha, usuario, vínculo a la venta original. Refleja en reportes y dashboard (ventas netas = ventas − devoluciones).

---

### 3.7 Clientes (CRM ligero)  🆕

**Ficha de cliente:**
- Nombre, teléfono/WhatsApp, Instagram, dirección, notas.
- **Historial de compras** (todas sus ventas y documentos).
- **Total gastado** y **frecuencia** de compra.
- **Tallas habituales** y modelos/colores preferidos (derivados de su historial).
- Saldo a favor (notas de crédito) y deuda (si compra a crédito).

**Valor:** identificar mejores clientes, recordar qué talla usa cada quien, segmentar para campañas. Alimenta cotizaciones y ventas (autocompletar).

---

### 3.8 Consignación

Mercancía entregada a terceros para reventa sin pago inmediato.

**Consignatario:** nombre, teléfono, notas, saldo pendiente (cuenta corriente).
**Entrega:** asocia SKUs (cantidad/color/talla) → descuenta inventario principal → pasa a "stock en consignación".
**Movimientos:** venta del consignatario (genera deuda) · devolución (reincorpora stock) · abono/pago parcial (contra deuda total).
**Estatus:** pendiente · devuelto · pagado parcial · liquidado.
**Vista:** qué tiene, qué vendió, cuánto debe + historial de abonos.

---

### 3.9 Gastos (egresos)

Registro manual (monto, moneda, fecha, categoría, nota, comprobante opcional).
**Categorías configurables**, iniciales: Publicidad y marketing · Suscripción/pago del sistema · Otros gastos operativos.
Reporte por categoría y período → alimenta "Facturación vs Gastos".

---

### 3.10 Motor de documentos PDF con marca K-Uniformes  🆕

Sistema unificado de generación de PDFs. **Todos** llevan identidad K-Uniformes (logo, colores negro/blanco de marca, datos de contacto, pie con WhatsApp/Instagram).

**Documentos transaccionales:**
| Documento | Numeración | Afecta stock | Notas |
|-----------|-----------|--------------|-------|
| **Cotización** | `COT-####` | No | Vigencia configurable, convertible a venta |
| **Venta (comprobante)** | `VEN-####` | Sí | Detalle, totales USD/Bs, pagos |
| **Nota de Entrega** | `NE-####` | Sí | Para entregar al cliente con el despacho |

Contenido común: encabezado con marca, nº correlativo, fecha, datos del cliente (si aplica), tabla de ítems (código, modelo, color, talla, cantidad, precio unit., subtotal), totales en USD y Bs, tasa aplicada, método(s) de pago, condiciones/notas. Descargable · imprimible · compartible por WhatsApp.

**Catálogos dinámicos en PDF:**
- Generación **dinámica** desde el inventario vivo (seleccionar modelos/categorías/colores a incluir).
- Plantilla con marca: portada, ficha por modelo con **imagen por color**, diseño, composición, tabla de tallas (si aplica), colores disponibles, precio opcional.
- Soporta uniformes (con tallas) y gorros/accesorios (sin tallas).
- Opción "solo productos con stock" para no ofrecer lo agotado.
- Útil para enviar por WhatsApp/Instagram como el catálogo actual, pero auto-generado y siempre actualizado.

**Requisitos técnicos (compatibles con Cloudflare Workers free):** Headless Chrome/Puppeteer **no está disponible** en el free tier, así que los PDF se generan con **librería JS pura** (`pdf-lib` o `@react-pdf/renderer`) que corre dentro del límite de CPU del Worker. Plantilla central reutilizable (header/footer de marca compartidos) · numeración correlativa persistente por tipo de documento (tabla `documents` en D1) · el PDF generado se **guarda en R2** y se sirve por URL firmada/pública · alternativa ligera: vista HTML con marca + "imprimir a PDF" del navegador para documentos puntuales. Mantener cada PDF por debajo de unos pocos MB para no agotar memoria del isolate (128 MB).

---

### 3.11 Logística y despachos

Registrar envío asociado a venta (transportista, guía/tracking, destino, fecha, costo opcional). Historial. **Transportistas configurables:** MRW · Zoom · Domesa · Tealca. Estado: pendiente · despachado · entregado.

---

### 3.12 Configuración (todo configurable)

Colores · tallas · categorías (producto/gasto) · métodos de pago · transportistas · **proveedores** · umbral de stock bajo · **tasa de cambio (fuente paralelo por defecto / BCV alterna / manual)** · **datos e identidad de marca para PDFs (logo, colores, contacto, pie)** · vigencia de cotizaciones · numeraciones · usuarios y roles.

---

## 4. Modelo de datos (esquema lógico)

Tablas principales (**Cloudflare D1 / SQLite**). 🆕 = nuevas en v1.1+. Las imágenes y PDFs se guardan en R2; en D1 solo se referencian sus URLs.

- `users` — id, nombre, email, rol, activo.
- `colors`, `sizes`, `categories`.
- `models` — id, codigo, nombre, diseño, composicion, categoria_id, **tipo (con_tallas|sin_tallas)**, precio_base, costo_promedio.
- `model_colors` / `model_sizes` — N:M. (`model_sizes` vacío en productos sin tallas.)
- 🆕 `model_color_images` — id, model_id, color_id, image_url. **Una imagen por Modelo+Color.**
- `skus` — id, model_id, color_id, size_id **(nullable para gorros)**, codigo_compuesto, stock, costo_promedio, precio_override.
- 🆕 `suppliers` — id, nombre, contacto, origen, notas.
- 🆕 `purchases` — id, supplier_id, fecha, moneda, costos_importacion, estado, referencia_lote.
- 🆕 `purchase_items` — id, purchase_id, sku_id, cantidad, costo_unit.
- 🆕 `quotes` — id, cliente_id (nullable), usuario_id, fecha, vigencia, total_usd, total_bs, tasa, estado, numero (COT-####).
- 🆕 `quote_items` — id, quote_id, sku_id, cantidad, precio_unit.
- `sales` — id, quote_id (nullable), cliente_id (nullable), usuario_id, fecha, total_usd, total_bs, tasa, estado, numero (VEN-####).
- `sale_items` — id, sale_id, sku_id, cantidad, precio_unit.
- `sale_payments` — id, sale_id, metodo, monto, moneda.
- 🆕 `returns` — id, sale_id, tipo (devolucion|cambio), fecha, usuario_id, motivo, resolucion (reembolso|nota_credito|cambio), monto.
- 🆕 `return_items` — id, return_id, sku_id_out, sku_id_in (nullable), cantidad.
- `customers` — id, nombre, telefono, instagram, direccion, notas, saldo_favor.
- `consignees`, `consignment_lots`, `consignment_items`, `consignment_payments`.
- `expenses` — id, fecha, categoria_id, monto, moneda, nota.
- `shipments`, `carriers`.
- `exchange_rates` — id, fecha, tasa, fuente (**paralelo** | bcv | manual), tipo_default.
- 🆕 `documents` — id, tipo (cotizacion|venta|nota_entrega|catalogo), ref_id, numero, pdf_url, fecha.
- `settings` (incluye identidad de marca para PDFs), `audit_log`.

---

## 5. Requisitos no funcionales

- **UI/UX:** minimalista, elegante, profesional, acorde a marca (negro/blanco). Mobile-first responsive.
- **Rendimiento:** registro de venta < 30 s; generación de PDF < 5 s.
- **Disponibilidad:** desplegado en **Cloudflare (Workers/Pages free tier)**, sin servidor propio que mantener.
- **Seguridad:** auth propia (JWT) + control de rol en el Worker; costos/gastos ocultos a vendedores. Imágenes/PDFs en R2 con acceso controlado.
- **Auditoría:** acciones críticas registradas.
- **Idioma:** español (Venezuela).
- **Backups:** export periódico de D1 (`wrangler d1 export`) a un respaldo externo.
- **Eficiencia (free tier):** consultas indexadas para minimizar *rows read*; evitar `SELECT *` en tablas grandes; paginación en listados. Ver §9.

---

## 6. Roadmap sugerido (sprints)

| Sprint | Entregable |
|--------|-----------|
| **S0** | Setup Cloudflare: proyecto Workers/Pages, D1, R2, bindings, Wrangler, CI deploy |
| **S1** | Auth propia (JWT/Lucia sobre D1) + roles + configuración base (colores, tallas, categorías, marca). Esqueleto UI |
| **S2** | Inventario: modelos, generación de SKUs, consulta |
| **S3** | **Compras/Reposición** + proveedores + costo promedio (alimenta stock y costo) |
| **S4** | Ventas: carrito, pago mixto, tasa USD/Bs, descuento de stock |
| **S5** | **Motor de PDF con marca** + Cotizaciones + Nota de Entrega + comprobante de Venta |
| **S6** | **Clientes (CRM ligero)** + **Devoluciones/cambios** |
| **S7** | Consignación: entregas, devoluciones, cuenta corriente, abonos, estatus |
| **S8** | Gastos + despachos |
| **S9** | **Catálogos dinámicos en PDF** |
| **S10** | Dashboard completo + reportes exportables |
| **S11** | Pulido UI/UX, audit log, backups, QA |

---

## 7. Mejoras propuestas (backlog futuro)

Carga matriz colores×tallas · tasa histórica por venta · alertas stock bajo (Telegram/WhatsApp) · reportes exportables Excel/PDF · audit log · dashboard de consignatario (v2) · integración Ari/WhatsApp (venta por chat descuenta stock) · catálogo público en vivo · códigos de barras/QR · cuentas por cobrar/pagar · multi-ubicación.

---

## 8. Preguntas abiertas / pendientes de validar

- Confirmar decisiones D1–D11 (§1).
- ¿El costo de importación (flete/aduana) se prorratea al costo de cada SKU o se lleva como gasto aparte?
- ¿Las devoluciones generan **nota de crédito** (saldo a favor) por defecto, o reembolso directo?
- ¿Los catálogos PDF muestran **precio** o solo modelos/disponibilidad?
- ¿Los gorros manejan **colores** (con imagen por color) o son talla y color únicos?
- ¿Quién registra la venta del consignatario: la dueña o el consignatario con su acceso?
---

## 9. Arquitectura y restricciones del plan gratuito de Cloudflare

El sistema se despliega íntegramente sobre el **Workers Free plan**. Esta sección documenta los límites vigentes (junio 2026) y cómo el diseño se mantiene dentro de ellos. Para un negocio de un solo local con uso interno, el free tier es **holgadamente suficiente**.

### 9.1 Componentes y su capa gratuita

| Componente | Servicio Cloudflare | Límite free (jun 2026) | Uso esperado K-Uniformes |
|------------|--------------------|------------------------|--------------------------|
| API / backend | **Workers** | 100.000 requests/día · 10 ms CPU/request | Muy por debajo: uso interno de pocos usuarios |
| Frontend | **Pages** | Sitios estáticos + funciones, generoso | Holgado |
| Base de datos | **D1 (SQLite)** | 5 GB almacenamiento · 5 M filas leídas/día · 100.000 filas escritas/día | Holgado con índices y paginación |
| Imágenes y PDFs | **R2** | 10 GB almacenamiento · 1 M operaciones/mes | Suficiente para fotos por color + PDFs |
| Tasa automática | **Cron Triggers** | Incluidos en free | 1–2 ejecuciones/día |
| Auth | Propia (JWT) sobre D1 | — | Sin costo |

### 9.2 Restricciones que condicionan el diseño

1. **Sin headless Chrome / Puppeteer.** La generación de PDF usa librería JS pura (`pdf-lib` / `@react-pdf/renderer`) o impresión del navegador. (Ver §3.10.)
2. **CPU de 10 ms por request.** Tareas pesadas (generar un catálogo PDF grande, reportes amplios) se hacen **bajo demanda y por partes**, paginadas o divididas; nada de procesamiento masivo en un solo request.
3. **Memoria 128 MB por isolate.** Mantener los PDFs y respuestas por debajo de ese tope; redimensionar imágenes en el cliente antes de subirlas.
4. **D1 cobra por filas leídas.** Todas las listas usan **índices y paginación**; se evita `SELECT *` sobre tablas grandes. El dashboard usa consultas agregadas eficientes o tablas resumen.
5. **50 subrequests externos por request.** La consulta de tasa y subidas a R2 se mantienen acotadas.
6. **KV es eventualmente consistente** (hasta ~60 s). Por eso el stock vive en **D1 (consistente)**, no en KV; KV se reserva para configuración/cache no crítica.

### 9.3 Camino de escalado (si algún día hace falta)

El **Workers Paid ($5/mes)** eleva CPU a 30 s, requests a 10 M/mes y quita los topes diarios de D1. La migración es solo de plan, sin reescribir código. Solo se necesitaría si el volumen creciera mucho o si se quisiera generar PDFs muy pesados con headless Chrome (Browser Rendering, que es de pago).

### 9.4 Notas de implementación

- Definir bindings en `wrangler.toml`: D1, R2, variables de entorno (secreto JWT, fuente de tasa).
- Migraciones de esquema con `wrangler d1 migrations`.
- Respaldos con `wrangler d1 export` programado.
- El esquema relacional del §4 es compatible con SQLite (ajustar tipos: `INTEGER`/`TEXT`/`REAL`, claves foráneas, `AUTOINCREMENT` donde aplique).

# Sinceramiento de inventario — BORRADOR (no aplicado a producción)

Fecha de análisis: 2026-06-25. Fuente: `media/inventario-inicial/`.
Respaldo de prod previo: `scripts/prod-backup-20260625-113307/` (todas las tablas).

## Estado actual de producción (antes de cambios)
- Stock total: **3499 u** / 385 SKUs / 8 modelos. Compras: 4. Ventas: 1 (NE-00185). Clientes: 3. Consignación: 0.
- Por modelo: 22S=500, 42015=490, 42019=450, 42108=100, 42122=200, 42168=1249, 42187=260, 42342=250.

## Totales por modelo ANOTADOS a mano en las fotos (alta confianza)
- 42168: **747 total**
- 42015: **305 total** ("exactos")
- 42122: **170 total**
- 42342: **155 total**
- 42187: "19 despachados" (no es total de existencias)
- 42015: "58 por todo / modelo viejo" (sublote Azul Cielo/Melón, etc.)
- Gorros (22S): planillas de VENTAS con totales de página 427 / 87 / 84 / 96 (a confirmar significado)

> Los totales sincerados son MUY inferiores al stock cargado de fábrica (p.ej. 42168: 1249 → ~747).
> Es consistente con la idea de "sincerar", pero es un ajuste de gran magnitud (≈ −1900 u) que debe confirmarse.

## Planillas de conteo de almacén con CHECKSUM OK (suma de tallas == TOTAL impreso)
Formato por fila: modelo-colorZ (talla:XS,S,M,L,XL,2XL) = TOTAL

### 42168 (Cuello V Bota recta)
- Z15 Lila: 0,8,10,6,1,0 = 25
- Z35 Marrón Café: 8,4,2,3,5,4 = 26
- Z3 Fucsia: 2,6,10,5,0,0 = 23
- Z14 Blanco: 4,12,11,7,4,0 = 38  (atribución de columna dudosa)
- Z27 Gris: 0,14,14,9,5,0 = 42
- Z21 Negro: 10,3,6,11,2,5 = 37
- Z16 Verde Oliva: 5,9,13,5,4,0 = 36  (foto nítida 2.50)
- Z8 Vinotinto: 7,7,7,5,4,5 = 35  (foto nítida 2.50)
- Z4 Coral: 4,13,10,6,3,0 = 36  (foto nítida 2.50)
- Z29 Verde Pizarra: 2,9,10,6,2,0 = 29  (rotada, baja conf.)
- Z25 Beige: 1,9,11,10,4,0 = 35  (rotada, baja conf.)
- Z11 Pistacho: 0,4,9,6,1,3 = 23  (rotada, baja conf.)
- Z26 Azul Rómulo: 12,21,20,17,8,5 = 83  (visto directo; un subagente la omitió)

### 42019 (Cuello V Caballero Bota recta)
- Z2 Azul Celeste: 0,8,16,8,9,4 = 45
- Z27 Gris: 0,10,12,8,5,2 = 37  (columna sin fecha)
- Z10 Verde Petróleo: 0,8,12,7,7,1 = 35  (columna sin fecha)
- Z25 Beige: 10,14,10,10,5,0 = 49  (columna sin fecha)
- Z22 Azul Rey: 9,11,9,6,1,0 = 36  (columna sin fecha)

### 42187 (Mao con cierre Jogger)
- Z22 Azul Rey: 2,12,10,8,0,3 = 35

### 42122 (Cuello V Bota jogger)
- Z35 Marrón Café: 8,6,8,7,5,4 = 38  (sin fecha; código leído "42102")

### 42342 (Cuello V Bota ancha)
- Z21 Negro: 10,1,0,5,3,0 = 19  (rotada, dígitos inciertos)

### 42108 (Cuello Neru Bota recta) — conteos muy bajos (unidades sueltas)
- Z34 Gris Plomo: 9,6,1,4,3,3 = 26
- Z40 Rojo: 0,0,1,1,0,0 = 2

## Planillas con CHECKSUM FALLIDO / celdas tapadas (NO confiables — requieren mejor foto)
42168: Z40 Rojo(~28), Z34(~34), Z22 Azul Rey(51 vs 52), Z17 Morado(~21), Z9 Azul Marino(41 vs 42), Z1 Marrón(?), Z19 Verde Navidad(en blanco).
42019: Z21 Negro(28 vs 29), Z1 Marrón(~47), Z16 Verde Oliva(~43), Z14 Blanco(~48).
42015: Z21 Negro(~31), Z24 Rosa Vieja(~38), color? (32 ok), Vinotinto Z8(4), Azul Marino Z9(2), Azul Cielo Z2(7), Melón(4, color no mapeado), varios sueltos.
42187: Z20 Morado(37 vs 39), Marrón(28), Gris(?), Verde/Azul(?).
42342: Z32 Amarillo(~41), Z20 Morado(28), Z7 Azul Bebé(30), + otros.
42122: Z22 Azul Rey(43, 2XL tapado), Z4 Coral(~45), Z21 Negro(~44), Naranja Z13(4), Rosado(3), Azul(7), Lila Z15, Pistacho Z11.
42108: muchas unidades sueltas (Blanco, Pistacho, Verde Agua, Azul Rómulo, Rosado, Azul Rey) con 1-2 u c/u.

## Fotos que NO son conteo de almacén
- `1.44.23 PM (2),(3),(4),(5)`, `1.44.24 PM (1)`, `1.44.24 PM`: planillas de VENTAS de gorros (22xxx) — columnas N°/Fecha/Código/Color/talla/Nombre/Precio/Efectivo/Zelle/Pago móvil. Totales de página 427/87/84/96.

## Consignación (planillas legibles)
- **Melsy** ("Uniformes Por Vender"): 26 unidades listadas (1 por fila) + nota "Faltan 3 que tiene Melsy" + filas 27,28 (Gris caballero XXL, Marrón Bota recta XXL). Modelos por nombre informal (Bola campana=42342, Bota recta=42168/42019, Joger cuello Mao=42015/42187, Joger cuello V=42122).
- **Maglly**: "27 (−3)" unidades, 24-06-26, con cantidad por fila; incluye códigos 42108 y 42168.
- Decisión del usuario: consignación va APARTE (no está en los conteos de almacén); total = almacén + consignación.

## Decisiones del usuario (2026-06-25)
1. Limpieza: transacciones + clientes. **PERO** los 3 clientes tienen nombres/teléfonos reales → pendiente reconfirmar.
2. Consignación aparte.
3. Stock por ajuste de inventario (fijar al conteo, registrar delta en stock_adjustments, motivo "Sinceramiento de inventario 2026-06"). Conservar compras.

## BLOQUEANTE
No es posible reconstruir un conteo SKU-por-SKU confiable solo con estas fotos (rotadas, solapadas, tapadas; códigos mal leídos; columnas sin fecha). Se requiere mejor fuente para las planillas con checksum fallido y para gorros.

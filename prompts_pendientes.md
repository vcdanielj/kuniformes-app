Trabaja en tres mejoras de experiencia de usuario en el sistema. Aplica los cambios directamente y muéstrame el antes/después de cada uno.

1) PERFECCIONAR LA GENERACIÓN DE PDF
Lleva todos los PDF (Cotización, Venta, Nota de Entrega y catálogo) a un acabado impecable y alineado con la estética del sistema:
- Incluir el logo de K-Uniformes y respetar la identidad visual (negro/blanco, misma tipografía y estilo que la app).
- Composición profesional: márgenes consistentes, tablas bien alineadas, jerarquía clara, totales en USD y Bs destacados, tasa aplicada, numeración y pie de página con datos de contacto.
- Que las imágenes por color salgan nítidas en el catálogo, sin cortes ni desbordes.
- Deben verse como documentos listos para enviar a un cliente por WhatsApp o imprimir.

2) BUSCADORES CON ESCRITURA Y CREACIÓN EN LÍNEA ("buscar o crear")
Convierte todos los selectores/buscadores del sistema en campos donde se pueda TIPEAR para filtrar, y que desde el mismo desplegable se pueda CREAR el registro si no existe todavía.
Ejemplo concreto: en una venta, en el campo Cliente debo poder escribir el nombre y ver coincidencias; si el cliente no existe, que aparezca una opción tipo "+ Crear cliente «nombre escrito»" que lo dé de alta ahí mismo sin salir del flujo de venta.
Aplica este patrón a todos los campos equivalentes: cliente, producto, color, categoría, proveedor, consignatario, transportista, método de pago, etc. Si creas un registro nuevo en línea, debe quedar seleccionado automáticamente y persistir en su módulo.

3) MINIMIZAR ESCRITURA Y MEJORAR EL MODAL DE NUEVA VENTA
El principio general es: escribir lo menos posible y que todo sea lo más intuitivo posible (autocompletado, selección por toque, valores por defecto sensatos, atajos).
En específico, rediseña el modal de Nueva Venta para que se parezca más al diseño del handoff/prototipo y mejóralo:
- Hazlo más grande y cómodo.
- La selección de talla y color debe ser visual y por toque (chips/botones de talla y muestras de color, similar al handoff), no menús pequeños.
- Flujo ágil: buscar producto → elegir color y talla de forma visual → cantidad → agregar al carrito, todo con el mínimo de tecleo.
- Mantener la coherencia estética con el resto del sistema.

Al terminar, dame un resumen de qué cambiaste en cada punto, qué componentes reutilizaste y si algo quedó pendiente.



---



Entra en modo de refinamiento visual fino. Ya no busques errores de estructura, sino llevar la interfaz y los documentos a un acabado profesional impecable.

En la UI: recorre cada pantalla en escritorio y móvil y pule los detalles: alineaciones, espaciados consistentes, jerarquía tipográfica, uso coherente del negro/blanco de la marca, estados hover/activo/deshabilitado, transiciones suaves, y que nada se vea apretado, desbordado o desalineado. Que todo respire y se sienta cuidado.

En los PDF (Cotización, Venta, Nota de Entrega y catálogo): genera ejemplos reales de cada uno y revísalos como si fueran a enviarse a un cliente. Verifica que el logo y la identidad de K-Uniformes se vean nítidos, que los márgenes, tablas, totales en USD y Bs, tasa, numeración y pie de página estén bien compuestos, que las imágenes por color salgan correctas en el catálogo, y que no haya cortes raros, texto pegado al borde, ni elementos desalineados. Deben verse profesionales e imprimibles.

Aplica las mejoras directamente y muéstrame el antes/después de lo que ajustaste.



---



Haz un barrido funcional exhaustivo para garantizar que TODO en la interfaz hace algo y funciona. Recorre cada pantalla y prueba cada elemento interactivo: botones, enlaces, íconos, menús, filtros, selectores, tabs, campos y acciones.

Detecta y corrige: botones o íconos sin función o que no responden, acciones que no guardan o no actualizan los datos, subida de imágenes que falle o no persista (prueba cargar una imagen por modelo+color de inicio a fin), formularios que no validan, modales que no cierran, enlaces rotos, y cualquier flujo que quede a medias.

Además, evalúa si falta alguna función necesaria para que el sistema sea realmente usable en el día a día (por ejemplo: editar o eliminar un registro, buscar, duplicar, exportar, cancelar una operación, volver atrás, confirmaciones antes de borrar). Si identificas un vacío funcional importante, impleméntalo.

Corrige lo que encuentres y entrégame un resumen de: qué estaba roto o muerto, qué funciones agregaste, y qué quedó pendiente si algo no se pudo resolver.
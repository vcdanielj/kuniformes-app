"use client";

import { useState, useMemo } from "react";
import { useUser } from "../UserContext";

/* ─── Types ─── */
type CategoryTab =
  | "todos"
  | "diagramas"
  | "inicio"
  | "inventario"
  | "ventas"
  | "consignacion"
  | "despachos"
  | "finanzas"
  | "faqs";

type RoleFilter = "all" | "admin" | "vendedor" | "usuario";

interface WorkflowStep {
  step: number;
  title: string;
  desc: string;
  uiHint?: string;
}

interface WorkflowCard {
  id: string;
  category: CategoryTab;
  title: string;
  icon: string;
  roles: Array<"admin" | "vendedor" | "usuario">;
  badgeText: string;
  summary: string;
  steps: WorkflowStep[];
  tip?: string;
  visualMock?: {
    type: "badges" | "flow" | "pdf" | "rates" | "pwa" | "table";
    labels?: string[];
  };
}

interface FAQItem {
  id: string;
  category: CategoryTab;
  question: string;
  answer: string;
  tip?: string;
  roles: Array<"admin" | "vendedor" | "usuario">;
}

interface DiagramFlow {
  id: string;
  title: string;
  icon: string;
  desc: string;
  nodes: Array<{ title: string; subtitle: string; color: string }>;
}

/* ─── Diagram Flows Data ─── */
const DIAGRAMS: DiagramFlow[] = [
  {
    id: "flow-ventas",
    title: "Ciclo Completo de Venta y Facturación",
    icon: "🧾",
    desc: "Flujo desde la solicitud inicial del cliente hasta la entrega final y registro de pago.",
    nodes: [
      { title: "1. Cotización (COT)", subtitle: "Propuesta informativa. No descuenta stock.", color: "#2A5B8A" },
      { title: "2. Aprobación Cliente", subtitle: "Confirmación de modelos, tallas y cantidades.", color: "#7C3AED" },
      { title: "3. Nota de Entrega (NE)", subtitle: "Genera cobro y descuenta inventario disponible.", color: "#B07A1A" },
      { title: "4. Despacho & Pago", subtitle: "Asignación de envío y registro de cobro USD/Bs.", color: "#1E7A4D" },
    ],
  },
  {
    id: "flow-consignacion",
    title: "Flujo de Gestión de Consignación",
    icon: "🤝",
    desc: "Control de mercancía prestada a aliados comerciales sin registro de venta inmediata.",
    nodes: [
      { title: "1. Entrega Consignación", subtitle: "Se prestan uniformes a vendedora/aliado.", color: "#B07A1A" },
      { title: "2. Reporte de Ventas", subtitle: "El aliado notifica las prendas vendidas.", color: "#2A5B8A" },
      { title: "3. Abono o Devolución", subtitle: "Ingresa pago parcial o regresan prendas intactas.", color: "#7C3AED" },
      { title: "4. Liquidación Final", subtitle: "Saldo $0 y cierre del registro prestado.", color: "#1E7A4D" },
    ],
  },
  {
    id: "flow-devolucion",
    title: "Proceso de Devolución de Mercancía (DV)",
    icon: "🔄",
    desc: "Protocolo para procesamiento de cambios de talla o prendas defectuosas.",
    nodes: [
      { title: "1. Solicitud de Cliente", subtitle: "Recepción de prenda y comprobante NE.", color: "#C2392E" },
      { title: "2. Evaluación Motivo", subtitle: "Cambio de talla vs. Defecto de fábrica.", color: "#B07A1A" },
      { title: "3. Reingreso / Descarte", subtitle: "Vuelve a stock o se da de baja por falla.", color: "#2A5B8A" },
      { title: "4. Ajuste de Saldo", subtitle: "Emisión de reemplazo o saldo a favor.", color: "#1E7A4D" },
    ],
  },
  {
    id: "flow-tasas",
    title: "Manejo de Tasas de Cambio Multimoneda",
    icon: "💱",
    desc: "Dinámica de precios base en USD y recálculo automático en Bolívares.",
    nodes: [
      { title: "1. Precio Base USD ($)", subtitle: "Valor fijo de cada uniforme en catálogo.", color: "#1E7A4D" },
      { title: "2. Actualización Tasa", subtitle: "Carga diaria de tasa BCV y Paralelo.", color: "#2A5B8A" },
      { title: "3. Conversión Automática", subtitle: "Recálculo instantáneo en presupuestos.", color: "#7C3AED" },
      { title: "4. Emisión con Tasa Fija", subtitle: "La NE congela la tasa del momento.", color: "#1E7A4D" },
    ],
  },
];

/* ─── Workflows Data ─── */
const WORKFLOWS: WorkflowCard[] = [
  {
    id: "pwa-install",
    category: "inicio",
    title: "Instalación de la App en Celular o PC (PWA)",
    icon: "📱",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Inicio Rápido",
    summary: "Instala KUniformes directamente en tu iPhone, Android o Computadora para un acceso instantáneo sin pasar por la App Store.",
    steps: [
      {
        step: 1,
        title: "Abrir enlace en el navegador",
        desc: "Ingresa a la app desde Safari (en iPhone) o Chrome (en Android / PC).",
        uiHint: "Navega a la URL de KUniformes",
      },
      {
        step: 2,
        title: "Presionar botón de Instalación",
        desc: "En el menú superior o en la barra lateral, presiona 'Instalar App' o 'Agregar a pantalla de inicio'.",
        uiHint: "iOS: Compartir ➔ Agregar a Inicio | Android: Instalar App",
      },
      {
        step: 3,
        title: "Activar Notificaciones Push",
        desc: "Acepta el permiso de notificaciones para recibir alertas instantáneas de stock bajo y despachos.",
        uiHint: "Botón 'Activar Notificaciones'",
      },
    ],
    tip: "La app funcionará de manera fluida y ultra rápida ocupando muy poco espacio en tu dispositivo.",
    visualMock: {
      type: "pwa",
      labels: ["Icono KUniformes", "Pantalla Completa", "Notificaciones Push Activas"],
    },
  },
  {
    id: "inventario-nuevo",
    category: "inventario",
    title: "Registro de Uniformes y Control de Stock",
    icon: "📦",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Inventario",
    summary: "Añade nuevos uniformes, asigna variantes (Damas, Caballeros, Unisex, Niños), tallas y umbral de stock bajo.",
    steps: [
      {
        step: 1,
        title: "Entrar a Inventario",
        desc: "Haz clic en 'Inventario' en el menú lateral izquierdo.",
        uiHint: "Ruta: /inventario",
      },
      {
        step: 2,
        title: "Crear Producto",
        desc: "Presiona '+ Nuevo Producto'. Llena Nombre, Categoría, Modelo, Talla, Color, Precio USD y Cantidad Inicial.",
        uiHint: "Asigna las variaciones correspondientes",
      },
      {
        step: 3,
        title: "Definir Umbral de Alerta",
        desc: "Establece el número mínimo de prendas (ej. 5 piezas). Si baja de esa cantidad, la app enviará una alerta.",
        uiHint: "Etiqueta visual: Stock Bajo",
      },
    ],
    tip: "Filtra rápidamente por modelo (Damas o Caballeros) al atender a un cliente para consultar disponibilidades al instante.",
    visualMock: {
      type: "badges",
      labels: ["Disponible (>5)", "Stock Bajo (1-5)", "Agotado (0)"],
    },
  },
  {
    id: "catalogo-pdf",
    category: "inventario",
    title: "Exportación de Catálogo PDF Visual 2x2",
    icon: "📄",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Catálogo",
    summary: "Genera catálogos visuales en formato PDF con cuadrícula limpia 2x2, precios en USD/Bs y marca oficial de la empresa.",
    steps: [
      {
        step: 1,
        title: "Ir al Catálogo",
        desc: "Ingresa a 'Catálogo' en la barra lateral.",
        uiHint: "Ruta: /catalogo",
      },
      {
        step: 2,
        title: "Aplicar Filtros",
        desc: "Filtra por Categoría o Género si deseas generar un catálogo específico (ej. Gorros Medicinales).",
        uiHint: "Filtro activo ➔ Muestra ítems seleccionados",
      },
      {
        step: 3,
        title: "Descargar PDF",
        desc: "Haz clic en 'Descargar Catálogo PDF'. Se generará un PDF de 4 productos por página perfectamente centrado.",
        uiHint: "Listo para compartir por WhatsApp o imprimir",
      },
    ],
    tip: "El catálogo impreso incluye la tasa de cambio del día y los datos de contacto corporativos automáticamente.",
    visualMock: {
      type: "pdf",
      labels: ["Cuadrícula 2x2 Centrada", "Precios en USD y Bs", "Logo & Contacto KUniformes"],
    },
  },
  {
    id: "ventas-cotizacion",
    category: "ventas",
    title: "Emisión de Nota de Entrega (NE) y Cotización (COT)",
    icon: "🧾",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Ventas",
    summary: "Genera cotizaciones informativas previas o emite la Nota de Entrega definitiva descontando inventario.",
    steps: [
      {
        step: 1,
        title: "Crear Venta / Presupuesto",
        desc: "En 'Ventas', haz clic en '+ Nueva Nota / Cotización'. Selecciona o crea el cliente.",
        uiHint: "Ruta: /ventas",
      },
      {
        step: 2,
        title: "Agregar Prendas al Carrito",
        desc: "Elige producto, modelo, talla y cantidad. Revisa el importe en USD, Bs. Paralelo y Bs. BCV en tiempo real.",
        uiHint: "Cálculo instantáneo multimoneda",
      },
      {
        step: 3,
        title: "Seleccionar Tipo de Comprobante",
        desc: "Selecciona 'Nota de Entrega (NE)' (descuenta stock) o 'Cotización (COT)' (reserva informativa).",
        uiHint: "Puedes convertir COT a NE con 1 solo clic",
      },
    ],
    tip: "Las Cotizaciones permiten enviar opciones de compra al cliente sin bloquear el stock disponible en tienda.",
    visualMock: {
      type: "flow",
      labels: ["Cotización (COT)", "➔ Aprobación", "➔ Nota de Entrega (NE)"],
    },
  },
  {
    id: "consignacion-flujo",
    category: "consignacion",
    title: "Control de Mercancía en Consignación",
    icon: "🤝",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Consignación",
    summary: "Administra uniformes entregados a aliados o vendedoras sin registrar venta inmediata hasta su liquidación.",
    steps: [
      {
        step: 1,
        title: "Registrar Consignación",
        desc: "En 'Consignación' ➔ '+ Nueva Consignación'. Asigna el aliado comercial y las unidades prestadas.",
        uiHint: "El inventario pasa a estado 'En Consignación'",
      },
      {
        step: 2,
        title: "Registrar Abonos Parciales",
        desc: "Conforme el consignatario vende prendas, ingresa a su registro y presiona 'Registrar Abono'.",
        uiHint: "Registra cobros en USD o Bs",
      },
      {
        step: 3,
        title: "Devolución o Liquidación",
        desc: "Para prendas devueltas presiona 'Registrar Devolución'. Al completar todos los pagos, presiona 'Liquidar'.",
        uiHint: "Estados: Activa ➔ Parcial ➔ Liquidada",
      },
    ],
    tip: "El sistema mantiene una cuenta clara de prendas en poder del aliado vs. dinero cobrado.",
    visualMock: {
      type: "badges",
      labels: ["Activa (Fuera)", "Parcialmente Pagada", "Liquidada (Cerrada)"],
    },
  },
  {
    id: "despachos-devoluciones",
    category: "despachos",
    title: "Gestión de Despachos y Devoluciones (DV)",
    icon: "🚚",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Operaciones",
    summary: "Asigna agencias de envío a las Notas de Entrega y procesa devoluciones por cambio de talla o imperfección.",
    steps: [
      {
        step: 1,
        title: "Asignar Envíos y Agencias",
        desc: "En 'Despachos', selecciona la Nota de Entrega y asigna la empresa de envío (Zoom, MRW, Tealca, Delivery).",
        uiHint: "Registra número de guía de seguimiento",
      },
      {
        step: 2,
        title: "Actualizar Estado de Entrega",
        desc: "Cambia el estatus de 'En Camino' a 'Entregado' al recibir la confirmación de la recepcionista o cliente.",
        uiHint: "Estatus: Pendiente ➔ En Camino ➔ Entregado",
      },
      {
        step: 3,
        title: "Registrar Devolución (DV)",
        desc: "En 'Devoluciones' ➔ '+ Registrar Devolución'. Especifica motivo (Talla/Defecto) y si reingresa al inventario apto.",
        uiHint: "Ajusta saldo del cliente e inventario",
      },
    ],
    tip: "Las prendas devueltas por falla de fabricación quedan registradas en el historial de inservibles para control interno.",
    visualMock: {
      type: "flow",
      labels: ["Despacho Creado", "➔ En Camino", "➔ Entregado / DV"],
    },
  },
  {
    id: "tasas-cambio",
    category: "finanzas",
    title: "Actualización de Tasas de Cambio (BCV / Paralelo)",
    icon: "💱",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Finanzas",
    summary: "Administra las equivalencias oficiales y de mercado para la emisión de cuentas de cobro y presupuestos en Bolívares.",
    steps: [
      {
        step: 1,
        title: "Consultar Tasa Vigente",
        desc: "En la parte inferior de la barra lateral siempre está visible la Tasa Paralela y BCV activa.",
        uiHint: "Visible en todo momento en la app",
      },
      {
        step: 2,
        title: "Sincronizar o Cargar Tasa Manual",
        desc: "Solo Administradores: En 'Configuración' ➔ 'Tasas de Cambio', presiona 'Sincronizar BCV' o ingresa los montos manuales.",
        uiHint: "Botón 'Guardar Tasas'",
      },
      {
        step: 3,
        title: "Recálculo Automático",
        desc: "Los montos en Bolívares se actualizan al instante en el catálogo y nuevas cotizaciones, manteniendo fijo el precio base en USD.",
        uiHint: "Preserva los precios base en Dólares ($)",
      },
    ],
    tip: "Las Notas de Entrega ya emitidas no cambian su monto en Bolívares original, congelando la tasa del momento de la venta.",
    visualMock: {
      type: "rates",
      labels: ["Tasa USD Paralelo", "Tasa USD BCV", "Euro Paralelo / BCV"],
    },
  },
  {
    id: "roles-usuarios",
    category: "finanzas",
    title: "Administración de Usuarios y Permisos de Acceso",
    icon: "👥",
    roles: ["admin"],
    badgeText: "Seguridad",
    summary: "Crea cuentas individuales para el equipo y asigna el rol según su función (Administradora, Vendedora, Operador).",
    steps: [
      {
        step: 1,
        title: "Acceder a Módulo Usuarios",
        desc: "Ingresa a 'Configuración' ➔ pestaña 'Usuarios' (exclusivo para Administradoras).",
        uiHint: "Ruta: /configuracion?tab=usuarios",
      },
      {
        step: 2,
        title: "Crear Cuenta de Usuario",
        desc: "Presiona '+ Agregar Usuario'. Ingresa Nombre, Correo Electrónico, Contraseña y selecciona el Rol.",
        uiHint: "Roles: Admin | Vendedor | Operador",
      },
      {
        step: 3,
        title: "Gestionar Contraseñas y Accesos",
        desc: "Puedes cambiar contraseñas, editar roles o suspender accesos desactivando el interruptor de estado.",
        uiHint: "Estado: Activo / Inactivo",
      },
    ],
    tip: "El rol 'Vendedor' oculta automáticamente los módulos financieros delicados como Gastos, Compras y Usuarios.",
    visualMock: {
      type: "table",
      labels: ["Admin (Control Total)", "Vendedor (Ventas & Clientes)", "Operador (Logística)"],
    },
  },
];

/* ─── FAQs Data ─── */
const FAQS: FAQItem[] = [
  {
    id: "faq-1",
    category: "ventas",
    question: "¿Qué diferencia hay entre una Cotización (COT) y una Nota de Entrega (NE)?",
    answer: "La Cotización (COT) es una propuesta comercial informativa para el cliente y NO descuenta mercancía del inventario. La Nota de Entrega (NE) es un documento formal de venta que descuenta inmediatamente las piezas del stock disponible y genera el cobro.",
    tip: "Puedes convertir cualquier Cotización a Nota de Entrega con un solo clic desde el menú de la venta.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-2",
    category: "finanzas",
    question: "¿Qué ocurre con los montos si cambia la tasa de cambio durante la jornada?",
    answer: "El precio base de todos los uniformes está fijado en dólares (USD). Al actualizar la tasa de cambio en Configuración, los precios equivalentes en Bolívares se recalculan automáticamente en el catálogo y nuevas cotizaciones. Las Notas de Entrega emitidas con anterioridad congelan la tasa histórica del momento en que se crearon.",
    tip: "Revisa la tasa activa en la parte inferior de la barra lateral antes de presupuestar.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-3",
    category: "inventario",
    question: "¿Cómo funciona la alerta de Stock Bajo y cómo se configura?",
    answer: "En Configuración ➔ Umbral de Stock se define el número mínimo de piezas (por defecto 5 unidades). Cuando la existencia de cualquier modelo o talla cae por debajo de esa cifra, la app resalta la prenda en color amarillo/rojo y genera una notificación de alerta.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-4",
    category: "consignacion",
    question: "¿Qué debo hacer si un cliente devuelve prendas de consignación no vendidas?",
    answer: "Ingresa al módulo de Consignación, busca el registro del aliado y presiona 'Registrar Devolución'. Marca las prendas exactas que están retornando. Las unidades ingresarán nuevamente al inventario disponible para la venta y el saldo adeudado por el aliado se descontará.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-5",
    category: "inicio",
    question: "¿Puedo instalar la aplicación en mi teléfono iPhone o Android?",
    answer: "¡Sí! KUniformes es una PWA (Aplicación Web Progresiva). En iPhone abre Safari ➔ Compartir ➔ 'Agregar a inicio'. En Android abre Chrome ➔ 'Instalar aplicación'. Se creará un icono directo en tu celular para usar la app a pantalla completa.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-6",
    category: "finanzas",
    question: "¿Por qué el rol 'Vendedor' no puede ver Gastos ni Compras?",
    answer: "Por seguridad organizativa, las vendedoras tienen un perfil enfocado comercialmente en Catálogo, Inventario, Ventas, Clientes, Consignación y Despachos. Los registros de compras de insumos, egresos generales y gestión de usuarios están restringidos al rol Administrador.",
    roles: ["admin"],
  },
  {
    id: "faq-7",
    category: "inventario",
    question: "¿Cómo envío el catálogo por WhatsApp a un cliente?",
    answer: "Ve a 'Catálogo', aplica los filtros si deseas un modelo en específico (ej. Gorros o Batas) y presiona 'Descargar Catálogo PDF'. El archivo descargado quedará guardado en tu dispositivo listo para enviarlo por WhatsApp.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-8",
    category: "despachos",
    question: "¿Cómo se procesa una devolución por falla de fabricación?",
    answer: "En 'Devoluciones' ➔ '+ Registrar Devolución', selecciona la Nota de Entrega, marca el motivo 'Defecto de Fábrica' y desmarca la opción 'Reingresar a inventario disponible'. La prenda quedará dada de baja por falla sin inflar el stock vendible.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-9",
    category: "inicio",
    question: "¿Dónde consulto quién editó un precio o modificó un inventario?",
    answer: "Las usuarias con rol Administrador pueden ingresar al módulo 'Actividad' en el menú lateral. Allí se guarda la bitácora de auditoría detallada con la fecha, hora, usuario y cambio exacto realizado en la base de datos.",
    roles: ["admin"],
  },
  {
    id: "faq-10",
    category: "ventas",
    question: "¿Se pueden registrar pagos parciales en las ventas?",
    answer: "Sí. Al abrir la Nota de Entrega, presiona 'Registrar Pago / Abono', introduce el monto recibido (en USD, Pago Móvil, Zelle o Efectivo en Bs) y la app calculará automáticamente el saldo pendiente del cliente.",
    roles: ["admin", "vendedor", "usuario"],
  },
];

export default function ManualPage() {
  const user = useUser();
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("todos");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>("faq-1");

  const userRole = user?.role || "admin";

  /* Categories list */
  const categories: Array<{ id: CategoryTab; label: string; icon: string }> = [
    { id: "todos", label: "Todos los Temas", icon: "📚" },
    { id: "diagramas", label: "Diagramas de Proceso", icon: "📊" },
    { id: "inicio", label: "Inicio & PWA", icon: "📱" },
    { id: "inventario", label: "Inventario & Catálogo", icon: "📦" },
    { id: "ventas", label: "Ventas & Cotizaciones", icon: "🧾" },
    { id: "consignacion", label: "Consignación", icon: "🤝" },
    { id: "despachos", label: "Despachos & Devoluciones", icon: "🚚" },
    { id: "finanzas", label: "Tasas, Gastos & Roles", icon: "💱" },
    { id: "faqs", label: "Preguntas Frecuentes (FAQs)", icon: "❓" },
  ];

  /* Roles filter options */
  const roleFilters: Array<{ id: RoleFilter; label: string; icon: string }> = [
    { id: "all", label: "Todos los Roles", icon: "👥" },
    { id: "admin", label: "Administradora", icon: "👑" },
    { id: "vendedor", label: "Vendedora", icon: "🛍️" },
    { id: "usuario", label: "Operador", icon: "📦" },
  ];

  /* Filter Workflows */
  const filteredWorkflows = useMemo(() => {
    return WORKFLOWS.filter((wf) => {
      if (roleFilter !== "all" && !wf.roles.includes(roleFilter)) return false;
      if (!wf.roles.includes(userRole as any)) return false;

      if (activeCategory !== "todos" && activeCategory !== "diagramas" && activeCategory !== "faqs" && wf.category !== activeCategory) {
        return false;
      }

      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchTitle = wf.title.toLowerCase().includes(q);
        const matchSummary = wf.summary.toLowerCase().includes(q);
        const matchStep = wf.steps.some((s) => s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
        return matchTitle || matchSummary || matchStep;
      }

      return true;
    });
  }, [activeCategory, roleFilter, searchQuery, userRole]);

  /* Filter FAQs */
  const filteredFaqs = useMemo(() => {
    return FAQS.filter((faq) => {
      if (roleFilter !== "all" && !faq.roles.includes(roleFilter)) return false;
      if (!faq.roles.includes(userRole as any)) return false;

      if (activeCategory !== "todos" && activeCategory !== "faqs" && faq.category !== activeCategory) {
        return false;
      }

      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          faq.question.toLowerCase().includes(q) ||
          faq.answer.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [activeCategory, roleFilter, searchQuery, userRole]);

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <div style={{ paddingBottom: 60, fontFamily: "var(--font-sans, 'Hanken Grotesk', sans-serif)" }}>
      {/* ── Banner Principal (Fondo Oscuro #101014 + Borde #26262E estilo K-Uniformes) ── */}
      <div
        style={{
          background: "var(--bg-sidebar, #101014)",
          borderRadius: 14,
          padding: "24px 28px",
          border: "1px solid var(--border-sidebar, #26262E)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12)",
          marginBottom: 24,
          color: "var(--text-sidebar, #EDEDEA)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 22,
                  background: "var(--bg-sidebar-tasa, #1A1A20)",
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-sidebar, #26262E)",
                }}
              >
                📘
              </span>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.01em", color: "#FFFFFF" }}>
                Manual de Uso & Centro de Ayuda K-Uniformes
              </h1>
            </div>
            <p style={{ margin: 0, color: "var(--text-sidebar-muted, #7E7E86)", fontSize: 13, maxWidth: 720, lineHeight: 1.5 }}>
              Guía práctica interactiva para el manejo de Inventario, Catálogos PDF 2x2, Ventas, Consignaciones, Tasas de Cambio y Configuración del sistema.
            </p>
          </div>

          <div
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "var(--bg-sidebar-tasa, #1A1A20)",
              border: "1px solid var(--border-sidebar, #26262E)",
              fontSize: 12,
              color: "var(--text-sidebar-muted, #7E7E86)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Rol Activo:</span>
            <strong style={{ color: "#FFFFFF", textTransform: "capitalize" }}>
              {userRole === "admin" ? "Administradora" : userRole === "usuario" ? "Operador" : "Vendedora"}
            </strong>
          </div>
        </div>

        {/* Buscador Rápido con Tipografía Monospaced en la búsqueda */}
        <div style={{ marginTop: 20, position: "relative", maxWidth: 600 }}>
          <input
            type="text"
            placeholder="🔍 Buscar función (ej. 'Cotización', 'PDF 2x2', 'Consignación', 'Stock bajo')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: 8,
              border: "1px solid var(--border-sidebar, #26262E)",
              background: "var(--bg-sidebar-tasa, #1A1A20)",
              color: "#FFFFFF",
              fontSize: 13,
              outline: "none",
              fontFamily: "var(--font-sans)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#7E7E86",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Filtros por Rol y Categoría ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {/* Selector de Rol */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary, #6A6A63)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Filtrar por Rol:
          </span>
          {roleFilters.map((r) => {
            const isActive = roleFilter === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRoleFilter(r.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: "var(--radius-base, 8px)",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  border: isActive ? "1px solid var(--text-primary, #15151A)" : "1px solid var(--border-main, #E5E3DC)",
                  background: isActive ? "var(--text-primary, #15151A)" : "var(--bg-card, #FFFFFF)",
                  color: isActive ? "#FFFFFF" : "var(--text-secondary, #4A4A45)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{r.icon}</span>
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Pestañas de Categoría */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: "var(--radius-base, 8px)",
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 500,
                  border: isActive ? "1px solid var(--text-primary, #15151A)" : "1px solid var(--border-main, #E5E3DC)",
                  background: isActive ? "var(--text-primary, #15151A)" : "var(--bg-card, #FFFFFF)",
                  color: isActive ? "#FFFFFF" : "var(--text-primary, #15151A)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SECCIÓN: DIAGRAMAS DE PROCESO (FLUJOGRAMAS VISUALES) ── */}
      {(activeCategory === "todos" || activeCategory === "diagramas") && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary, #15151A)", marginBottom: 14 }}>
            📊 Diagramas de Procesos Principales
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {DIAGRAMS.map((diag) => (
              <div
                key={diag.id}
                style={{
                  background: "var(--bg-card, #FFFFFF)",
                  borderRadius: "var(--radius-lg, 9px)",
                  border: "1px solid var(--border-main, #E5E3DC)",
                  padding: 18,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{diag.icon}</span>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary, #15151A)", margin: 0 }}>
                    {diag.title}
                  </h3>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-tertiary, #6A6A63)", margin: "0 0 14px 0", lineHeight: 1.4 }}>
                  {diag.desc}
                </p>

                {/* Nodes Timeline con colores semánticos de KUniformes */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {diag.nodes.map((node, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-md, 6px)",
                        background: "var(--bg-subtle, #F0EEE8)",
                        borderLeft: `3.5px solid ${node.color}`,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary, #15151A)" }}>
                        {node.title}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary, #4A4A45)", marginTop: 2 }}>
                        {node.subtitle}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECCIÓN: GUÍAS PASO A PASO ── */}
      {activeCategory !== "diagramas" && activeCategory !== "faqs" && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary, #15151A)", marginBottom: 14 }}>
            💡 Guías de Uso Paso a Paso ({filteredWorkflows.length})
          </h2>

          {filteredWorkflows.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                background: "var(--bg-card, #FFFFFF)",
                borderRadius: "var(--radius-lg, 9px)",
                border: "1px dashed var(--border-main, #E5E3DC)",
                color: "var(--text-tertiary, #6A6A63)",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>🔎</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No se encontraron guías para tu consulta o filtro de rol</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Cambia el filtro a 'Todos los Roles' o modifica los términos de búsqueda.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 }}>
              {filteredWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  style={{
                    background: "var(--bg-card, #FFFFFF)",
                    borderRadius: "var(--radius-lg, 9px)",
                    border: "1px solid var(--border-main, #E5E3DC)",
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{wf.icon}</span>
                        <div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "var(--info-bg, #E6EEF7)",
                              color: "var(--info, #2A5B8A)",
                            }}
                          >
                            {wf.badgeText}
                          </span>
                          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "3px 0 0 0", color: "var(--text-primary, #15151A)" }}>
                            {wf.title}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: 12, color: "var(--text-tertiary, #6A6A63)", margin: "0 0 16px 0", lineHeight: 1.45 }}>
                      {wf.summary}
                    </p>

                    {/* Timeline de Pasos con JetBrains Mono en los números */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
                      {wf.steps.map((st) => (
                        <div key={st.step} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "var(--text-primary, #15151A)",
                              color: "#FFFFFF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: "var(--font-mono, monospace)",
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            0{st.step}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #15151A)" }}>
                              {st.title}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary, #4A4A45)", marginTop: 2, lineHeight: 1.4 }}>
                              {st.desc}
                            </div>
                            {st.uiHint && (
                              <div
                                style={{
                                  display: "inline-block",
                                  marginTop: 4,
                                  padding: "2px 6px",
                                  background: "var(--bg-subtle, #F0EEE8)",
                                  borderRadius: 4,
                                  fontSize: 10.5,
                                  color: "var(--text-secondary, #4A4A45)",
                                  fontFamily: "var(--font-mono, monospace)",
                                }}
                              >
                                📍 {st.uiHint}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mockup de Interfaz */}
                    {wf.visualMock && (
                      <div
                        style={{
                          background: "var(--bg-subtle, #F0EEE8)",
                          border: "1px solid var(--border-light, #F2F0EA)",
                          borderRadius: "var(--radius-base, 8px)",
                          padding: 10,
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary, #6A6A63)", textTransform: "uppercase", marginBottom: 6 }}>
                          🖼️ Vista en Pantalla
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {wf.visualMock.labels?.map((lbl, idx) => (
                            <span
                              key={idx}
                              style={{
                                padding: "3px 8px",
                                borderRadius: 5,
                                background: "#FFFFFF",
                                border: "1px solid var(--border-main, #E5E3DC)",
                                fontSize: 11,
                                color: "var(--text-primary, #15151A)",
                                fontWeight: 500,
                              }}
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {wf.tip && (
                    <div
                      style={{
                        padding: 8,
                        background: "var(--warning-info-bg, #FBF6EC)",
                        border: "1px solid var(--warning-info-border, #F0E6D2)",
                        borderRadius: "var(--radius-base, 8px)",
                        fontSize: 11.5,
                        color: "var(--warning-info-text, #8A6A2A)",
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13 }}>💡</span>
                      <span><strong>Consejo Pro:</strong> {wf.tip}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN: PREGUNTAS FRECUENTES (FAQS) ACCORDION ── */}
      {(activeCategory === "todos" || activeCategory === "faqs") && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary, #15151A)", marginBottom: 14 }}>
            ❓ Preguntas Frecuentes ({filteredFaqs.length})
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredFaqs.map((faq) => {
              const isOpen = expandedFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  style={{
                    background: "var(--bg-card, #FFFFFF)",
                    borderRadius: "var(--radius-base, 8px)",
                    border: isOpen ? "1px solid var(--text-primary, #15151A)" : "1px solid var(--border-main, #E5E3DC)",
                    overflow: "hidden",
                    transition: "all 0.15s ease",
                  }}
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    style={{
                      width: "100%",
                      padding: "14px 18px",
                      background: "none",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary, #15151A)" }}>
                      {faq.question}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        color: "var(--text-tertiary, #6A6A63)",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: "0 18px 16px 18px",
                        fontSize: 13,
                        color: "var(--text-secondary, #4A4A45)",
                        lineHeight: 1.55,
                        borderTop: "1px solid var(--border-light, #F2F0EA)",
                        marginTop: 2,
                        paddingTop: 10,
                      }}
                    >
                      <p style={{ margin: 0 }}>{faq.answer}</p>
                      {faq.tip && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "6px 10px",
                            background: "var(--success-bg, #E8F3ED)",
                            border: "1px solid var(--success-glow, rgba(70, 194, 142, 0.18))",
                            borderRadius: 6,
                            fontSize: 11.5,
                            color: "var(--success, #1E7A4D)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>✅</span>
                          <span>{faq.tip}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

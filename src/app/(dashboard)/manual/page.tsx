"use client";

import { useState, useMemo } from "react";
import { useUser } from "../UserContext";

/* ─── Type Definitions ─── */
type CategoryTab =
  | "todos"
  | "inicio"
  | "inventario"
  | "ventas"
  | "consignacion"
  | "despachos"
  | "finanzas"
  | "faqs";

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
    type: "badges" | "flow" | "pdf" | "rates" | "pwa";
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

/* ─── Workflows Data ─── */
const WORKFLOWS: WorkflowCard[] = [
  {
    id: "pwa-install",
    category: "inicio",
    title: "Instalación de la App (PWA en Celular / PC)",
    icon: "📱",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Inicio Rápido",
    summary: "Instala KUniformes directamente en la pantalla de inicio de tu iPhone, Android o Computadora sin pasar por App Stores.",
    steps: [
      {
        step: 1,
        title: "Abrir enlace en el navegador",
        desc: "Ingresa a la app desde Safari (iOS) o Chrome (Android / PC).",
        uiHint: "Navega a la URL oficial de KUniformes",
      },
      {
        step: 2,
        title: "Presionar botón de Instalación",
        desc: "En el menú superior o en la barra lateral, haz clic en 'Instalar App' o usa la opción 'Agregar a pantalla de inicio'.",
        uiHint: "En iPhone: Compartir ➔ Agregar a Inicio. En Android: 'Instalar Aplicación'",
      },
      {
        step: 3,
        title: "Activar Notificaciones Push",
        desc: "Acepta el permiso de notificaciones para recibir alertas instantáneas de stock bajo y nuevos despachos.",
        uiHint: "Clic en el botón flotante 'Activar Notificaciones'",
      },
    ],
    tip: "La app funcionará como una aplicación nativa, ocupando menos memoria y cargando de forma ultra rápida.",
    visualMock: {
      type: "pwa",
      labels: ["Icono KUniformes", "Sin Barra de Dirección", "Acceso Directo"],
    },
  },
  {
    id: "inventario-nuevo",
    category: "inventario",
    title: "Registro y Ajuste de Inventario",
    icon: "📦",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Inventario",
    summary: "Añade nuevos uniformes, asigna tallas, modelo (Damas/Caballeros/Unisex/Niños) y gestiona el umbral de stock bajo.",
    steps: [
      {
        step: 1,
        title: "Entrar al Módulo de Inventario",
        desc: "Haz clic en 'Inventario' en el menú lateral izquierdo.",
        uiHint: "Ruta: /inventario",
      },
      {
        step: 2,
        title: "Crear o Editar Prenda",
        desc: "Presiona el botón '+ Nuevo Producto' en la esquina superior derecha.",
        uiHint: "Llena: Nombre, Categoría, Modelo, Talla, Color, Precio USD y Cantidad Inicial",
      },
      {
        step: 3,
        title: "Configurar Umbral de Stock Bajo",
        desc: "Indica la cantidad mínima para alertas (ej. 5 unidades). Si la existencia cae por debajo, aparecerá en amarillo/rojo.",
        uiHint: "El sistema marcará la prenda con la etiqueta 'Stock Bajo'",
      },
    ],
    tip: "Usa el filtro por género/modelo para encontrar rápido prendas de Damas o Caballeros al momento de atender a un cliente.",
    visualMock: {
      type: "badges",
      labels: ["Disponible (Alto)", "Stock Bajo (<5)", "Agotado (0)"],
    },
  },
  {
    id: "catalogo-pdf",
    category: "inventario",
    title: "Generación de Catálogo Digital & PDF 2x2",
    icon: "📄",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Catálogo",
    summary: "Crea y comparte listas de precios y catálogos visuales en PDF con retícula 2x2 optimizada para imprimir o enviar por WhatsApp.",
    steps: [
      {
        step: 1,
        title: "Ir al Catálogo",
        desc: "Ingresa a 'Catálogo' en la barra lateral.",
        uiHint: "Ruta: /catalogo",
      },
      {
        step: 2,
        title: "Aplicar Filtros Deseados",
        desc: "Filtra por Categoría, Género o Disponibilidad según la solicitud del cliente.",
        uiHint: "Ejemplo: 'Filtrar por Gorros Medicinales Unisex'",
      },
      {
        step: 3,
        title: "Exportar PDF",
        desc: "Haz clic en 'Descargar Catálogo PDF'. El sistema generará un documento en formato 2x2 perfectamente centrado y con precios en USD/Bs.",
        uiHint: "Genera vista en retícula limpia de 4 productos por página",
      },
    ],
    tip: "El PDF incluye automáticamente la tasa de cambio vigente y los datos de contacto configurados en el sistema.",
    visualMock: {
      type: "pdf",
      labels: ["Grid 2x2 Centrado", "Precios en USD y Bs", "Encabezado Oficial KUniformes"],
    },
  },
  {
    id: "ventas-cotizacion",
    category: "ventas",
    title: "Emisión de Nota de Entrega (NE) y Cotización (COT)",
    icon: "🧾",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Ventas",
    summary: "Registra solicitudes de clientes, emite cotizaciones previas o genera la Nota de Entrega definitiva descontando inventario.",
    steps: [
      {
        step: 1,
        title: "Crear Nueva Venta o Cotización",
        desc: "Haz clic en 'Ventas' y luego en '+ Nueva Nota / Cotización'.",
        uiHint: "Selecciona el cliente existente o crea uno rápido",
      },
      {
        step: 2,
        title: "Agregar Productos al Carrito",
        desc: "Selecciona el producto, talla y cantidad. El sistema calcula en tiempo real los precios en USD, Bs. Paralelo y Bs. BCV.",
        uiHint: "Revisa disponibilidad en stock antes de agregar",
      },
      {
        step: 3,
        title: "Seleccionar Tipo de Documento",
        desc: "Elige entre 'Nota de Entrega (NE)' (descuenta stock) o 'Cotización (COT)' (reserva informativa).",
        uiHint: "Puedes convertir una COT a NE más adelante con un solo clic",
      },
    ],
    tip: "Las Cotizaciones (COT) vencen automáticamente en el tiempo configurado si no son confirmadas.",
    visualMock: {
      type: "flow",
      labels: ["Cotización (COT)", "➔ Confirmación", "➔ Nota de Entrega (NE)"],
    },
  },
  {
    id: "consignacion-flujo",
    category: "consignacion",
    title: "Gestión de Mercancía en Consignación",
    icon: "🤝",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Consignación",
    summary: "Controla uniformes entregados a aliados o vendedores externos sin registrarlos como venta inmediata hasta su liquidación.",
    steps: [
      {
        step: 1,
        title: "Registrar Entrega a Consignación",
        desc: "En 'Consignación', haz clic en '+ Nueva Consignación'. Asigna el consignatario (cliente/aliado) y las piezas prestadas.",
        uiHint: "Las piezas cambian a estado 'En Consignación'",
      },
      {
        step: 2,
        title: "Registrar Abonos o Ventas Parciales",
        desc: "A medida que el consignatario vende prendas, ingresa a la ficha y registra los pagos/abonos recibidos.",
        uiHint: "Boton: 'Registrar Abono'",
      },
      {
        step: 3,
        title: "Devolución o Liquidación Final",
        desc: "Si devuelven prendas no vendidas, presiona 'Registrar Devolución' para reincorporarlas al inventario disponible. Al completar el pago, marca 'Liquidar'.",
        uiHint: "Estados: Activa ➔ Parcialmente Pagada ➔ Liquidada / Finalizada",
      },
    ],
    tip: "El sistema mantiene un balance transparente de unidades prestadas vs. reportadas.",
    visualMock: {
      type: "badges",
      labels: ["Activa (Prendas fuera)", "Abonado Parcial", "Liquidada (Cerrada)"],
    },
  },
  {
    id: "despachos-devoluciones",
    category: "despachos",
    title: "Despacho de Pedidos & Devoluciones (DV)",
    icon: "🚚",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Operaciones",
    summary: "Monitorea las entregas físicas con transportistas y procesa devoluciones por cambio de talla o prenda defectuosa.",
    steps: [
      {
        step: 1,
        title: "Asignar Despacho a Transporte",
        desc: "En 'Despachos', selecciona la Nota de Entrega y asigna la agencia (Zoom, MRW, Tealca, Delivery).",
        uiHint: "Registra número de guía y fecha estimada",
      },
      {
        step: 2,
        title: "Actualizar Estatus de Entrega",
        desc: "Cambia el estatus de 'En Tránsito' a 'Entregado' al recibir confirmación del cliente.",
        uiHint: "Estatus: Pendiente ➔ En Camino ➔ Entregado",
      },
      {
        step: 3,
        title: "Procesar Devolución (DV)",
        desc: "Si hay un cambio, ve a 'Devoluciones' ➔ '+ Registrar Devolución'. Especifica motivo (Talla/Defecto) y si reingresa al inventario o se descarta.",
        uiHint: "Ajusta automáticamente el saldo del cliente e inventario",
      },
    ],
    tip: "Las devoluciones por defecto de fábrica no reingresan a mercancía disponible a menos que lo autorices.",
    visualMock: {
      type: "flow",
      labels: ["Despacho Creado", "➔ En Tránsito", "➔ Entregado / DV"],
    },
  },
  {
    id: "tasas-cambio",
    category: "finanzas",
    title: "Sincronización y Actualización de Tasas de Cambio",
    icon: "💱",
    roles: ["admin", "vendedor", "usuario"],
    badgeText: "Finanzas",
    summary: "Gestiona los valores de tasa de cambio oficial (BCV) y mercado paralelo para el cálculo exacto de precios en Bolívares.",
    steps: [
      {
        step: 1,
        title: "Visualizar Tasa Actual en Sidebar",
        desc: "En el menú lateral inferior siempre verás reflejada la Tasa Paralela y la Tasa BCV Oficial en tiempo real.",
        uiHint: "Ejemplo: USD Paralelo 801.50 Bs / BCV 600.20 Bs",
      },
      {
        step: 2,
        title: "Sincronizar automáticamente o Ajustar Manual",
        desc: "Ve a 'Configuración' ➔ pestaña 'Tasas de Cambio'. Haz clic en 'Sincronizar Tasas BCV' o ingresa los valores manuales.",
        uiHint: "Boton: 'Guardar Tasas'",
      },
      {
        step: 3,
        title: "Revisar Recálculo en Sistema",
        desc: "Al cambiar la tasa, todos los precios e importes en Bs. de las cotizaciones y catálogo se recalculan al instante sin alterar el precio base en USD.",
        uiHint: "El precio base en USD ($) permanece fijo e inalterado",
      },
    ],
    tip: "Los vendedores no pueden alterar la tasa global, garantizando uniformidad en todos los presupuestos del día.",
    visualMock: {
      type: "rates",
      labels: ["Tasa USD Paralelo", "Tasa USD BCV", "Euro Paralelo / BCV"],
    },
  },
  {
    id: "roles-usuarios",
    category: "finanzas",
    title: "Gestión de Usuarios y Roles de Permisos",
    icon: "👥",
    roles: ["admin"],
    badgeText: "Administración",
    summary: "Crea cuentas de acceso para el personal asignando los roles correspondientes (Administradora, Vendedora, Operador).",
    steps: [
      {
        step: 1,
        title: "Acceder a Usuarios",
        desc: "Solo con rol 'Admin', ingresa a 'Configuración' ➔ pestaña 'Usuarios'.",
        uiHint: "Ruta: /configuracion?tab=usuarios",
      },
      {
        step: 2,
        title: "Crear Nuevo Usuario",
        desc: "Presiona '+ Agregar Usuario'. Introduce Nombre, Email, Contraseña y selecciona el Rol.",
        uiHint: "Roles: Admin | Vendedor | Usuario (Operador)",
      },
      {
        step: 3,
        title: "Activar o Desactivar Accesos",
        desc: "Puedes cambiar contraseñas, editar roles o desactivar el acceso temporal de cualquier usuario en cualquier momento.",
        uiHint: "Interruptor de estado: Activo / Inactivo",
      },
    ],
    tip: "Asigna rol 'Vendedor' a las asesoras comerciales para que no tengan acceso a los módulos de Gastos, Compras ni Configuración del sistema.",
    visualMock: {
      type: "badges",
      labels: ["Admin (Acceso Total)", "Vendedor (Comercial)", "Operador (Logística)"],
    },
  },
];

/* ─── FAQs Data ─── */
const FAQS: FAQItem[] = [
  {
    id: "faq-1",
    category: "ventas",
    question: "¿Qué diferencia hay entre una Cotización (COT) y una Nota de Entrega (NE)?",
    answer: "La Cotización (COT) es una propuesta comercial informativa para el cliente y NO descuenta mercancía del inventario. La Nota de Entrega (NE) es un documento formal de venta que descuenta inmediatamente las piezas del stock disponible.",
    tip: "Puedes convertir cualquier Cotización a Nota de Entrega con un solo clic desde el menú de la venta.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-2",
    category: "finanzas",
    question: "¿Qué ocurre con las ventas si cambia la tasa de cambio durante el día?",
    answer: "El precio base de todos los uniformes se mantiene en dólares (USD). Al actualizar la tasa de cambio en Configuración, los montos equivalentes en Bolívares se recalculan automáticamente para los nuevos comprobantes. Las Notas de Entrega ya emitidas conservan la tasa histórica con la que fueron creadas.",
    tip: "Revisa la tasa activa en la parte inferior de la barra lateral antes de facturar.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-3",
    category: "inventario",
    question: "¿Cómo funciona la alerta de Stock Bajo?",
    answer: "En Configuración ➔ Umbral de Stock se define la cantidad crítica (por defecto 5 unidades). Cuando la existencia de cualquier talla/modelo cae por debajo de esa cifra, el sistema resalta el ítem en amarillo y envía una notificación de advertencia.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-4",
    category: "consignacion",
    question: "¿Qué pasa si un cliente devuelve prendas de consignación sin vender?",
    answer: "Ingresa al módulo de Consignación, busca el registro activo y presiona 'Registrar Devolución'. Selecciona las prendas exactas devueltas. Las unidades regresarán automáticamente al inventario disponible y el saldo pendiente del cliente se reducirá proporcionalmente.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-5",
    category: "inicio",
    question: "¿Puedo usar la aplicación desde mi teléfono o tablet?",
    answer: "¡Sí! KUniformes es una PWA (Aplicación Web Progresiva) 100% responsiva. Al abrir la app en tu navegador móvil, presiona 'Instalar App' o 'Agregar a Pantalla de Inicio' para usarla a pantalla completa como una aplicación móvil nativa.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-6",
    category: "finanzas",
    question: "¿Por qué un usuario con rol 'Vendedor' no ve los módulos de Gastos o Compras?",
    answer: "Por seguridad de la empresa, el rol Vendedor solo tiene permiso para operar en Ventas, Catálogo, Clientes, Consignación y Despachos. El acceso a egresos, compras de telas y administración de usuarios está reservado exclusivamente para Administradores.",
    roles: ["admin"],
  },
  {
    id: "faq-7",
    category: "inventario",
    question: "¿Cómo comparto el Catálogo PDF por WhatsApp?",
    answer: "Dirígete a 'Catálogo', aplica los filtros si deseas un catálogo específico (ej. Gorros o Batas de Dama) y presiona 'Descargar Catálogo PDF'. El documento descargado se guardará en tu dispositivo listo para adjuntarlo en tus chats de WhatsApp.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-8",
    category: "despachos",
    question: "¿Cómo se registra una devolución por desperfecto de fábrica?",
    answer: "En el módulo 'Devoluciones' ➔ '+ Registrar Devolución', selecciona la Nota de Entrega, marca el motivo 'Defecto de Fábrica' y desmarca la opción 'Reingresar a inventario disponible'. Esto dejará constancia de la baja sin inflar el inventario apto para venta.",
    roles: ["admin", "vendedor", "usuario"],
  },
  {
    id: "faq-9",
    category: "inicio",
    question: "¿Dónde puedo consultar quién modificó un precio o anuló un comprobante?",
    answer: "Si eres Administrador, puedes entrar al módulo 'Actividad' en el menú lateral. Allí se muestra la bitácora de auditoría detallada con la fecha, hora, usuario y acción exacta realizada en el sistema.",
    roles: ["admin"],
  },
  {
    id: "faq-10",
    category: "ventas",
    question: "¿Se pueden registrar pagos parciales en las ventas a crédito?",
    answer: "Sí. Al abrir el detalle de una Nota de Entrega, puedes presionar 'Registrar Pago / Abono', indicar el monto recibido (en USD o Bs) y la forma de pago (Pago Móvil, Zelle, Efectivo, Transferencia). El sistema calculará el saldo pendiente acumulado.",
    roles: ["admin", "vendedor", "usuario"],
  },
];

export default function ManualPage() {
  const user = useUser();
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>("faq-1");

  const currentRole = user?.role || "admin";

  /* Category List */
  const categories: Array<{ id: CategoryTab; label: string; icon: string }> = [
    { id: "todos", label: "Todos los Temas", icon: "📚" },
    { id: "inicio", label: "Inicio & PWA", icon: "📱" },
    { id: "inventario", label: "Inventario & Catálogo", icon: "📦" },
    { id: "ventas", label: "Ventas & Cotizaciones", icon: "🧾" },
    { id: "consignacion", label: "Consignación", icon: "🤝" },
    { id: "despachos", label: "Despachos & Devoluciones", icon: "🚚" },
    { id: "finanzas", label: "Tasas, Gastos & Roles", icon: "💱" },
    { id: "faqs", label: "Preguntas Frecuentes (FAQs)", icon: "❓" },
  ];

  /* Filter Workflows based on active category, search, and user role access */
  const filteredWorkflows = useMemo(() => {
    return WORKFLOWS.filter((wf) => {
      // Role filter
      if (!wf.roles.includes(currentRole as any)) return false;

      // Category filter
      if (activeCategory !== "todos" && activeCategory !== "faqs" && wf.category !== activeCategory) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchTitle = wf.title.toLowerCase().includes(q);
        const matchSummary = wf.summary.toLowerCase().includes(q);
        const matchStep = wf.steps.some((s) => s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
        return matchTitle || matchSummary || matchStep;
      }

      return true;
    });
  }, [activeCategory, searchQuery, currentRole]);

  /* Filter FAQs based on search and role */
  const filteredFaqs = useMemo(() => {
    return FAQS.filter((faq) => {
      // Role filter
      if (!faq.roles.includes(currentRole as any)) return false;

      // Category filter
      if (activeCategory !== "todos" && activeCategory !== "faqs" && faq.category !== activeCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          faq.question.toLowerCase().includes(q) ||
          faq.answer.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [activeCategory, searchQuery, currentRole]);

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <div style={{ paddingBottom: 48 }}>
      {/* ── Header Visual Banner ── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(20, 24, 33, 0.95), rgba(30, 41, 59, 0.98))",
          borderRadius: 20,
          padding: "28px 32px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.2)",
          marginBottom: 28,
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 28,
                background: "rgba(255, 255, 255, 0.1)",
                padding: "6px 12px",
                borderRadius: 12,
                backdropFilter: "blur(4px)",
              }}
            >
              📖
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: "#F8FAFC" }}>
              Manual de Uso Interactivo & Centro de Ayuda
            </h1>
          </div>
          <p style={{ margin: 0, color: "#94A3B8", fontSize: 15, maxWidth: 720, lineHeight: 1.5 }}>
            Aprende a utilizar de forma rápida y visual todos los módulos del sistema <strong>KUniformes</strong>: Inventario, Catálogos PDF, Ventas, Consignaciones, Tasas de Cambio y más.
          </p>

          {/* Quick Search Input */}
          <div style={{ marginTop: 20, maxWidth: 540, position: "relative" }}>
            <input
              type="text"
              placeholder="🔍 Buscar tema, función o pregunta (ej. 'Catálogo PDF', 'Nota de entrega', 'Tasa dólar')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(15, 23, 42, 0.6)",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                backdropFilter: "blur(6px)",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
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
                  color: "#94A3B8",
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Category Filters Nav ── */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                border: isActive
                  ? "1px solid var(--accent, #2563EB)"
                  : "1px solid var(--border-color, rgba(226, 232, 240, 0.8))",
                background: isActive
                  ? "var(--accent, #2563EB)"
                  : "var(--bg-card, #FFFFFF)",
                color: isActive ? "#FFFFFF" : "var(--text-main, #1E293B)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: isActive ? "0 4px 12px rgba(37, 99, 235, 0.25)" : "none",
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── SECTION 1: VISUAL WORKFLOW GUIDES ── */}
      {activeCategory !== "faqs" && (
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main, #0F172A)", margin: 0 }}>
              💡 Guías Visuales Paso a Paso ({filteredWorkflows.length})
            </h2>
          </div>

          {filteredWorkflows.length === 0 ? (
            <div
              style={{
                padding: 36,
                textAlign: "center",
                background: "var(--bg-card, #FFFFFF)",
                borderRadius: 16,
                border: "1px dashed var(--border-color, #CBD5E1)",
                color: "#64748B",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>No se encontraron guías con tu búsqueda</div>
              <div style={{ fontSize: 14, marginTop: 4 }}>Prueba buscando con otros términos o cambia la categoría arriba.</div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 24,
              }}
            >
              {filteredWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  style={{
                    background: "var(--bg-card, #FFFFFF)",
                    borderRadius: 18,
                    border: "1px solid var(--border-color, #E2E8F0)",
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                >
                  <div>
                    {/* Header Card */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{wf.icon}</span>
                        <div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "#EFF6FF",
                              color: "#2563EB",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {wf.badgeText}
                          </span>
                          <h3 style={{ fontSize: 17, fontWeight: 700, margin: "4px 0 0 0", color: "#0F172A" }}>
                            {wf.title}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 18px 0", lineHeight: 1.5 }}>
                      {wf.summary}
                    </p>

                    {/* Step by Step Timeline */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                      {wf.steps.map((st) => (
                        <div key={st.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: "#2563EB",
                              color: "#FFF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            {st.step}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B" }}>
                              {st.title}
                            </div>
                            <div style={{ fontSize: 13, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>
                              {st.desc}
                            </div>
                            {st.uiHint && (
                              <div
                                style={{
                                  display: "inline-block",
                                  marginTop: 4,
                                  padding: "2px 8px",
                                  background: "#F1F5F9",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  color: "#334155",
                                  fontFamily: "monospace",
                                }}
                              >
                                📍 {st.uiHint}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Visual UI Mockup Snippet */}
                    {wf.visualMock && (
                      <div
                        style={{
                          background: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 16,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                          <span>🖼️ Vista del Sistema</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {wf.visualMock.labels?.map((lbl, idx) => (
                            <span
                              key={idx}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 8,
                                background: "#FFFFFF",
                                border: "1px solid #CBD5E1",
                                fontSize: 12,
                                color: "#0F172A",
                                fontWeight: 500,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                              }}
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pro Tip Footer */}
                  {wf.tip && (
                    <div
                      style={{
                        padding: 10,
                        background: "#FFFBEB",
                        border: "1px solid #FDE68A",
                        borderRadius: 10,
                        fontSize: 12,
                        color: "#92400E",
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>💡</span>
                      <span><strong>Consejo Pro:</strong> {wf.tip}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 2: PREGUNTAS FRECUENTES (FAQS) ACCORDION ── */}
      {(activeCategory === "todos" || activeCategory === "faqs") && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main, #0F172A)", margin: 0 }}>
              ❓ Preguntas Frecuentes & Casos Prácticos ({filteredFaqs.length})
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredFaqs.map((faq) => {
              const isOpen = expandedFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  style={{
                    background: "var(--bg-card, #FFFFFF)",
                    borderRadius: 14,
                    border: isOpen
                      ? "1px solid var(--accent, #2563EB)"
                      : "1px solid var(--border-color, #E2E8F0)",
                    overflow: "hidden",
                    transition: "all 0.2s ease",
                    boxShadow: isOpen ? "0 4px 12px rgba(37, 99, 235, 0.08)" : "none",
                  }}
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      background: "none",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
                      {faq.question}
                    </span>
                    <span
                      style={{
                        fontSize: 16,
                        color: "#64748B",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: "0 20px 18px 20px",
                        fontSize: 14,
                        color: "#334155",
                        lineHeight: 1.6,
                        borderTop: "1px solid #F1F5F9",
                        marginTop: 4,
                        paddingTop: 12,
                      }}
                    >
                      <p style={{ margin: 0 }}>{faq.answer}</p>
                      {faq.tip && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: "8px 12px",
                            background: "#F0FDF4",
                            border: "1px solid #BBF7D0",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "#166534",
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

      {/* ── Footer Support Banner ── */}
      <div
        style={{
          marginTop: 40,
          padding: "20px 24px",
          background: "linear-gradient(90deg, #EFF6FF, #F8FAFC)",
          borderRadius: 16,
          border: "1px solid #BFDBFE",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>💬</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1E3A8A" }}>
              ¿Tienes alguna duda adicional sobre KUniformes?
            </div>
            <div style={{ fontSize: 13, color: "#3B82F6", marginTop: 2 }}>
              Consulta con la administración o tu supervisora comercial para soporte directo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

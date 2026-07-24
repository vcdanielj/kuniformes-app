# 🥼 KUniformes App

Sistema de Gestión Integral, Inventario, Ventas, Consignaciones y Catálogos Digitales para **KUniformes**, construido con tecnologías web modernas y desplegado en la infraestructura serverless de **Cloudflare**.

---

## 🚀 Características Principales

- 📊 **Panel de Control y Métricas**: Dashboard intuitivo para visualizar métricas clave de ventas, inventario y finanzas en tiempo real.
- 📦 **Gestión de Inventario y Stock**: Control de existencias por prendas, modelo, género (Damas, Caballeros, Unisex, Niños), alertas de umbral de stock bajo e historial de movimientos.
- 🛍️ **Catálogo Digital & PDF Generador**:
  - Filtros avanzados por categorías, género y disponibilidades.
  - Exportación automática a PDF con diseño optimizado (malla 2x2, precios en USD/Bs y marcas personalizadas).
- 🧾 **Ventas, Cotizaciones y Notas de Entrega**:
  - Registro rápido de ventas, emisión de Notas de Entrega (NE) y Cotizaciones (COT).
  - Cálculo automático multimoneda en USD y Bolívares (Tasa BCV / Tasa Paralela, Dólar y Euro).
- 🤝 **Gestión de Consignaciones**: Seguimiento detallado de mercancía entregada en consignación, abonos y retornos.
- 🚚 **Despachos y Devoluciones**: Módulo operativo para control de entregas de mercancía y procesamiento de devoluciones (DV).
- 💸 **Compras y Gastos**: Registro de egresos administrativos, compras de insumos, telas y uniformes terminados.
- 👤 **Control de Acceso Basado en Roles (RBAC)**:
  - **Admin**: Acceso completo a métricas, configuraciones, usuarios y registros de auditoría.
  - **Usuario (Operador)**: Acceso operativo completo excluyendo métricas financieras avanzadas y auditoría.
  - **Vendedor**: Acceso enfocado exclusivamente en ventas, catálogo, clientes e inventario.
- 📝 **Auditoría e Historial de Actividad**: Registro cronológico de acciones críticas realizadas en la plataforma.
- 📱 **Soporte PWA & Push Notifications**: Aplicación Web Progresiva instalable en dispositivos móviles y de escritorio, con notificaciones Push integradas.

---

## 🛠️ Stack Tecnológico

- **Framework Principal**: [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/)
- **Lenguaje**: TypeScript
- **Base de Datos**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite serverless en el edge)
- **ORM & Migraciones**: [Drizzle ORM](https://orm.drizzle.team/)
- **Almacenamiento de Archivos / Media**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (`kuniformes-assets`)
- **Despliegue & Edge Runtime**: [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) + [Cloudflare Workers / Pages](https://workers.cloudflare.com/)
- **Generación de PDFs**: [`pdf-lib`](https://pdf-lib.js.org/)
- **Estilos**: Vanilla CSS Moderno / tokens responsivos y elegantes.

---

## 📁 Estructura del Proyecto

```text
kuniformes-app/
├── public/                    # Assets estáticos, manifiesto PWA y Service Worker
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # Rutas protegidas del sistema (Inventario, Ventas, etc.)
│   │   ├── api/               # Búsquedas y endpoints API
│   │   └── globals.css        # Estilos globales y tokens del sistema de diseño
│   ├── components/            # Componentes de UI reutilizables y modales
│   └── lib/
│       ├── auth/              # Lógica de sesiones y autenticación
│       ├── db/                # Esquemas Drizzle ORM, cliente LibSQL/D1 y migraciones
│       ├── exchange-rates/    # Servicio de actualización de tasas de cambio
│       ├── pdf/               # Generador de catálogos y comprobantes PDF
│       └── push/              # Configuración y envío de Notificaciones Web Push
├── scripts/                   # Scripts de carga inicial y mantenimiento de base de datos
├── wrangler.toml              # Configuración de recursos Cloudflare (D1, R2, Triggers)
└── package.json
```

---

## 💻 Desarrollo Local

### 1. Requisitos Previos

- **Node.js** v20 o superior
- **npm** (o `pnpm` / `bun`)
- Cuenta de **Cloudflare** con Wrangler CLI configurado (`npx wrangler login`)

### 2. Instalación de Dependencias

```bash
npm install
```

### 3. Configuración de Base de Datos Local

Para aplicar las migraciones a tu base de datos SQLite local:

```bash
npx drizzle-kit migrate
```

### 4. Iniciar Servidor de Desarrollo

```bash
npm run dev
```

El servidor estará corriendo en [http://localhost:3000](http://localhost:3000).

---

## 🚀 Despliegue en Cloudflare

Este proyecto está listo para ser desplegado en el Edge usando **OpenNext Cloudflare**.

### Vista Previa del Despliegue (Build Local + Wrangler Preview)

```bash
npm run preview
```

### Despliegue a Producción

```bash
npm run deploy
```

Este comando ejecuta la compilación optimizada con OpenNext y publica la aplicación en Cloudflare Workers / Pages vinculando la base de datos D1 (`kuniformes-db`) y el bucket R2 (`kuniformes-assets`).

---

## 📜 Licencia

Desarrollado para **KUniformes**. Todos los derechos reservados.

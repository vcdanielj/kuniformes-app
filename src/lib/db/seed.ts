/**
 * K-Uniformes — Seed Data
 *
 * Demo data extracted from the Claude Design handoff v2.
 * Used to populate the database for development/testing.
 */

export const seedColors = [
  { code: "Z21", name: "Negro", hex: "#1b1b1d", sortOrder: 0 },
  { code: "Z22", name: "Azul Rey", hex: "#1e3a8a", sortOrder: 1 },
  { code: "Z34", name: "Gris Plomo", hex: "#6b7280", sortOrder: 2 },
  { code: "Z40", name: "Rojo Vino", hex: "#7c1d2b", sortOrder: 3 },
  { code: "Z18", name: "Verde Quirófano", hex: "#2f6f5e", sortOrder: 4 },
  { code: "Z27", name: "Lila", hex: "#8b6db0", sortOrder: 5 },
  { code: "Z12", name: "Blanco", hex: "#d9dad4", sortOrder: 6 },
];

export const seedSizes = [
  { name: "XS", sortOrder: 0 },
  { name: "S", sortOrder: 1 },
  { name: "M", sortOrder: 2 },
  { name: "L", sortOrder: 3 },
  { name: "XL", sortOrder: 4 },
  { name: "2XL", sortOrder: 5 },
];

export const seedProductCategories = [
  { name: "Cuello V", type: "product" as const },
  { name: "Cuello Mao", type: "product" as const },
  { name: "Cuello Neru", type: "product" as const },
  { name: "Pantalón", type: "product" as const },
  { name: "Gorros", type: "product" as const },
  { name: "Accesorio", type: "product" as const },
];

export const seedExpenseCategories = [
  { name: "Publicidad", type: "expense" as const },
  { name: "Importación", type: "expense" as const },
  { name: "Operativos", type: "expense" as const },
  { name: "Sistema", type: "expense" as const },
];

export const seedPaymentMethods = [
  { name: "Zelle", currency: "USD" },
  { name: "Binance", currency: "USDT" },
  { name: "Efectivo", currency: "USD" },
  { name: "Bolívares", currency: "Bs" },
];

export const seedCarriers = [
  { name: "MRW", tag: "Principal" },
  { name: "Zoom", tag: "Principal" },
  { name: "Domesa", tag: "Secundario" },
  { name: "Tealca", tag: "Secundario" },
];

export const seedModels = [
  {
    id: "42168",
    name: "Cuello V bota recta",
    category: "Cuello V",
    composition: "94% Poliéster · 6% Spandex",
    avgCost: 16,
    basePrice: 28,
    type: "con_tallas" as const,
    colorCodes: ["Z21", "Z22", "Z34", "Z40"],
    sizeNames: ["XS", "S", "M", "L", "XL", "2XL"],
  },
  {
    id: "42170",
    name: "Cuello Mao clásico",
    category: "Cuello Mao",
    composition: "92% Poliéster · 8% Spandex",
    avgCost: 17,
    basePrice: 30,
    type: "con_tallas" as const,
    colorCodes: ["Z21", "Z22", "Z18", "Z34"],
    sizeNames: ["S", "M", "L", "XL", "2XL"],
  },
  {
    id: "42155",
    name: "Jogger cargo recto",
    category: "Pantalón",
    composition: "90% Poliéster · 10% Spandex",
    avgCost: 18,
    basePrice: 32,
    type: "con_tallas" as const,
    colorCodes: ["Z21", "Z34", "Z18"],
    sizeNames: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: "51020",
    name: "Cuello Neru femenino",
    category: "Cuello Neru",
    composition: "95% Poliéster · 5% Spandex",
    avgCost: 16,
    basePrice: 29,
    type: "con_tallas" as const,
    colorCodes: ["Z40", "Z27", "Z22", "Z21"],
    sizeNames: ["XS", "S", "M", "L"],
  },
  {
    id: "33010",
    name: "Gorro quirúrgico",
    category: "Gorros",
    composition: "100% Algodón",
    avgCost: 3,
    basePrice: 8,
    type: "sin_tallas" as const,
    colorCodes: ["Z18", "Z22", "Z40", "Z27"],
    sizeNames: [],
  },
  {
    id: "60040",
    name: "Cofia descartable (x10)",
    category: "Accesorio",
    composition: "Polipropileno SMS",
    avgCost: 2,
    basePrice: 6,
    type: "sin_tallas" as const,
    colorCodes: ["Z12", "Z18"],
    sizeNames: [],
  },
];

export const seedSuppliers = [
  { name: "Importadora MediSur C.A.", items: "Scrubs · Joggers", contact: "+58 261-555 0142" },
  { name: "TexTina Imports", items: "Gorros · Cofias", contact: "+58 212-555 7781" },
  { name: "Global Uniform Trade", items: "Telas antifluido", contact: "+1 305-555 9034" },
];

export const seedCustomers = [
  { name: "Dra. Marielena Rivas", phone: "0414-238 1190" },
  { name: "Clínica Vista Salud", phone: "0261-555 0098" },
  { name: "Andreína Pérez", phone: "0424-771 0653" },
  { name: "Dr. Luis Méndez", phone: "0412-509 3382" },
  { name: "Yorgelis Castro", phone: "0416-330 2255" },
];

export const seedSettings = [
  { key: "marca", value: "K-Uniformes" },
  { key: "rif", value: "J-50000000-0" },
  { key: "telefono", value: "+58 424-000 0000" },
  { key: "instagram", value: "@k_uniformesvzla" },
  { key: "umbral_stock_bajo", value: "5" },
  { key: "tasa_default", value: "paralelo" },
  { key: "ne_counter", value: "184" },
  { key: "cot_counter", value: "11" },
  { key: "dv_counter", value: "42" },
];

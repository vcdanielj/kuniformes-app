import { generateCatalogPdf } from "../src/lib/pdf/generator";
import fs from "node:fs";

const logoB64 = fs.readFileSync("public/assets/logo.jpg").toString("base64");
const logoDataUrl = `data:image/jpeg;base64,${logoB64}`;

function model(id: string, name: string, category: string, colors: any[], sizes: string[]) {
  return {
    id,
    name,
    category,
    basePrice: 0,
    composition: "Tela de alta calidad - Semi-stretch",
    colorCodes: colors.map((c) => c.code),
    colors: colors.map((c, i) => ({ id: i + 1, code: c.code, name: c.name, hex: c.hex, imageUrl: c.img })),
    skus: colors.flatMap((c, i) =>
      sizes.map((s, j) => ({ id: i * 10 + j, sizeId: j + 1, compositeCode: `${id}-${c.code}-${s}`, stock: 0 }))
    ),
  };
}

const models = [
  model("42019", "Conjunto Cuello V Caballero - Bota recta", "Cuello V", [
    { code: "Z1", name: "Marrón Claro", hex: "#b5651d", img: logoDataUrl },
    { code: "Z21", name: "Negro", hex: "#1b1b1d" },
    { code: "Z27", name: "Gris", hex: "#7d7d82" },
  ], ["XS", "S", "M", "L", "XL"]),
  model("42108", "Conjunto Cuello Neru - Bota recta", "Cuello Neru", [
    { code: "Z17", name: "Morado Vino", hex: "#4a2b52" },
    { code: "Z34", name: "Gris Plomo", hex: "#6b7280" },
  ], ["XS", "S", "M", "L", "XL", "2XL"]),
];

const bytes = await generateCatalogPdf(models as any, true, {
  brand: { name: "K-Uniformes", rif: "J-50000000-0", phone: "+58 424-000 0000", instagram: "@k_uniformesvzla", logoUrl: logoDataUrl },
  baseUrl: "http://localhost",
});
fs.writeFileSync("/tmp/catalog-test.pdf", Buffer.from(bytes));
console.log("wrote /tmp/catalog-test.pdf", bytes.length, "bytes");

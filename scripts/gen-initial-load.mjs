/**
 * Generates idempotent SQL to load the initial real K-Uniformes models,
 * their colors and per-color/size SKUs (stock 0, prices 0 — edited later).
 *
 * Usage: node scripts/gen-initial-load.mjs > scripts/initial-load.sql
 */

// New color catalog interpreted from the printed catalog swatches.
// (existing Z21/Z22/Z27 are kept as-is via INSERT OR IGNORE)
const COLORS = [
  { code: "Z1", name: "Cobre", hex: "#b05a2c" },
  { code: "Z2", name: "Turquesa", hex: "#45c2c7" },
  { code: "Z3", name: "Fucsia", hex: "#d6266f" },
  { code: "Z4", name: "Coral", hex: "#e8674f" },
  { code: "Z9", name: "Azul Marino", hex: "#1b2a4a" },
  { code: "Z10", name: "Verde Petroleo", hex: "#1a5a6b" },
  { code: "Z11", name: "Verde Salvia", hex: "#7fa37f" },
  { code: "Z13", name: "Naranja", hex: "#e8731f" },
  { code: "Z14", name: "Blanco", hex: "#ffffff" },
  { code: "Z15", name: "Lila Claro", hex: "#b89ad8" },
  { code: "Z16", name: "Verde Militar", hex: "#1f4d2e" },
  { code: "Z17", name: "Morado", hex: "#4b3b6b" },
  { code: "Z19", name: "Verde", hex: "#2e8b3d" },
  { code: "Z21", name: "Negro", hex: "#1b1b1d" },
  { code: "Z22", name: "Azul Rey", hex: "#1e3a8a" },
  { code: "Z24", name: "Rosa", hex: "#e89aac" },
  { code: "Z25", name: "Beige Arena", hex: "#d8c9a0" },
  { code: "Z26", name: "Celeste", hex: "#5b9bd5" },
  { code: "Z27", name: "Lila", hex: "#8b6db0" },
  { code: "Z29", name: "Azul Petroleo", hex: "#1a6b7a" },
  // Gradient (degradado) fabrics — representative single hex.
  { code: "A", name: "Degradado A (Magenta-Cian)", hex: "#9b4dca" },
  { code: "B", name: "Degradado B (Azul)", hex: "#3b6bd6" },
  { code: "C", name: "Degradado C (Purpura-Fucsia)", hex: "#a03b8f" },
  { code: "D", name: "Degradado D (Vino-Negro)", hex: "#4a1f2b" },
  { code: "E", name: "Degradado E (Verde-Teal)", hex: "#2e8b7a" },
];

const COMPOSITION = "Tela de alta calidad - Semi-stretch";

const MODELS = [
  {
    id: "42187", name: "Conjunto Mao con cierre - Jogger", category: "Cuello Mao",
    sizes: ["XS", "S", "M", "L", "XL", "2XL"],
    colors: ["A", "B", "C", "D", "E"],
  },
  {
    id: "42168", name: "Conjunto Cuello V - Bota recta", category: "Cuello V",
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Z1", "Z2", "Z3", "Z4", "Z9", "Z11", "Z14", "Z15", "Z16", "Z17", "Z19", "Z21", "Z22", "Z24", "Z25", "Z26", "Z27", "Z29"],
  },
  {
    id: "42015", name: "Conjunto Mao - Jogger con cierre", category: "Cuello Mao",
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Z1", "Z2", "Z13", "Z15", "Z16", "Z21", "Z24", "Z25"],
  },
  {
    id: "42019", name: "Conjunto Cuello V Caballero - Bota recta", category: "Cuello V",
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Z1", "Z2", "Z10", "Z14", "Z16", "Z21", "Z22", "Z25", "Z27"],
  },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const out = [];
out.push("-- K-Uniformes initial model load (generated). Idempotent.");

// 1) Colors
let sort = 100;
for (const c of COLORS) {
  out.push(
    `INSERT OR IGNORE INTO colors (code, name, hex, sort_order) VALUES (${q(c.code)}, ${q(c.name)}, ${q(c.hex)}, ${sort});`
  );
  sort += 1;
}

// 2) Models (category resolved by name; stock/prices = 0)
for (const m of MODELS) {
  out.push(
    `INSERT OR IGNORE INTO models (id, name, design, composition, category_id, type, base_price, avg_cost) ` +
    `SELECT ${q(m.id)}, ${q(m.name)}, NULL, ${q(COMPOSITION)}, ` +
    `(SELECT id FROM categories WHERE name=${q(m.category)} AND type='product' LIMIT 1), 'con_tallas', 0, 0;`
  );
}

// 3) model_colors / model_sizes (guarded against duplicates)
for (const m of MODELS) {
  for (const code of m.colors) {
    out.push(
      `INSERT INTO model_colors (model_id, color_id) SELECT ${q(m.id)}, c.id FROM colors c ` +
      `WHERE c.code=${q(code)} AND NOT EXISTS (SELECT 1 FROM model_colors mc WHERE mc.model_id=${q(m.id)} AND mc.color_id=c.id);`
    );
  }
  for (const sz of m.sizes) {
    out.push(
      `INSERT INTO model_sizes (model_id, size_id) SELECT ${q(m.id)}, s.id FROM sizes s ` +
      `WHERE s.name=${q(sz)} AND NOT EXISTS (SELECT 1 FROM model_sizes ms WHERE ms.model_id=${q(m.id)} AND ms.size_id=s.id);`
    );
  }
}

// 4) SKUs (composite_code unique -> INSERT OR IGNORE)
for (const m of MODELS) {
  for (const code of m.colors) {
    for (const sz of m.sizes) {
      const composite = `${m.id}-${code}-${sz}`;
      out.push(
        `INSERT OR IGNORE INTO skus (model_id, color_id, size_id, composite_code, stock, avg_cost) ` +
        `SELECT ${q(m.id)}, c.id, s.id, ${q(composite)}, 0, 0 FROM colors c, sizes s ` +
        `WHERE c.code=${q(code)} AND s.name=${q(sz)};`
      );
    }
  }
}

process.stdout.write(out.join("\n") + "\n");

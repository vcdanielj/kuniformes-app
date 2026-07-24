/**
 * Second load: authoritative color names/codes from the official fichas,
 * complete model 42168 (3 missing colors), and add models 42342, 42108, 42122.
 * Output: scripts/update-2.sql  (idempotent).
 */

// Authoritative color master (code -> official name -> hex). Upserts name+hex.
const COLOR_MASTER = [
  ["Z1", "Marrón Claro", "#b5651d"],
  ["Z2", "Azul Celeste", "#1cc5dc"],
  ["Z3", "Fucsia", "#e0218a"],
  ["Z4", "Coral", "#f08060"],
  ["Z7", "Azul Bebé", "#7fb5e6"],
  ["Z8", "Vinotinto", "#6e1a2b"],
  ["Z9", "Azul Marino", "#1b2a52"],
  ["Z11", "Pistacho", "#9dc88d"],
  ["Z14", "Blanco", "#ffffff"],
  ["Z15", "Lila", "#b98fd0"],
  ["Z16", "Verde Oliva", "#1f4d2e"],
  ["Z17", "Morado Vino", "#4a2b52"],
  ["Z19", "Verde Navidad", "#1f7a3d"],
  ["Z20", "Morado", "#9b59b6"],
  ["Z21", "Negro", "#1b1b1d"],
  ["Z22", "Azul Rey", "#1f3fd8"],
  ["Z24", "Rosa Vieja", "#e58fa0"],
  ["Z25", "Beige", "#d8c9a0"],
  ["Z26", "Azul Rómulo", "#9bb8e0"],
  ["Z27", "Gris", "#7d7d82"],
  ["Z29", "Verde Pizarra", "#1f5d52"],
  ["Z31", "Verde Agua", "#b5dcc8"],
  ["Z32", "Amarillo", "#f2d94e"],
  ["Z34", "Gris Plomo", "#6b7280"],
  ["Z35", "Marrón Café", "#5a3a2a"],
  ["Z40", "Rojo", "#d62828"],
];

// Demo colors not in the catalog and not referenced by any model.
const REMOVE_CODES = ["Z12", "Z18"];

// Colors to ADD to the already-loaded 42168 (its master sheet has 21).
const ADD_TO_42168 = { id: "42168", colors: ["Z8", "Z40", "Z35"], sizes: ["XS", "S", "M", "L", "XL"] };

const COMP = "94% Poliéster - 6% Expanded";
const NEW_MODELS = [
  { id: "42342", name: "Conjunto Cuello V - Bota ancha", category: "Cuello V", gender: "dama",
    sizes: ["XS", "S", "M", "L", "XL"], colors: ["Z20", "Z7", "Z21", "Z32", "Z31"] },
  { id: "42108", name: "Conjunto Cuello Neru - Bota recta", category: "Cuello Neru", gender: "unisex",
    sizes: ["XS", "S", "M", "L", "XL", "2XL"], colors: ["Z17", "Z34"] },
  { id: "42122", name: "Conjunto Cuello V - Bota jogger", category: "Cuello V", gender: "dama",
    sizes: ["XS", "S", "M", "L", "XL", "2XL"], colors: ["Z22", "Z40", "Z35", "Z21"] },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const out = ["-- K-Uniformes load #2 (authoritative colors + 42168 completion + new models). Idempotent."];

// 1) Color upserts (name + hex only; keep existing sort_order).
let sort = 130;
for (const [code, name, hex] of COLOR_MASTER) {
  out.push(
    `INSERT INTO colors (code, name, hex, sort_order) VALUES (${q(code)}, ${q(name)}, ${q(hex)}, ${sort}) ` +
    `ON CONFLICT(code) DO UPDATE SET name=excluded.name, hex=excluded.hex;`
  );
  sort += 1;
}

// 2) Remove unused demo colors (guarded: only if unreferenced).
for (const code of REMOVE_CODES) {
  out.push(
    `DELETE FROM colors WHERE code=${q(code)} ` +
    `AND NOT EXISTS (SELECT 1 FROM model_colors mc WHERE mc.color_id = colors.id) ` +
    `AND NOT EXISTS (SELECT 1 FROM skus s WHERE s.color_id = colors.id);`
  );
}

function linkColor(modelId, code) {
  out.push(
    `INSERT INTO model_colors (model_id, color_id) SELECT ${q(modelId)}, c.id FROM colors c ` +
    `WHERE c.code=${q(code)} AND NOT EXISTS (SELECT 1 FROM model_colors mc WHERE mc.model_id=${q(modelId)} AND mc.color_id=c.id);`
  );
}
function linkSize(modelId, sz) {
  out.push(
    `INSERT INTO model_sizes (model_id, size_id) SELECT ${q(modelId)}, s.id FROM sizes s ` +
    `WHERE s.name=${q(sz)} AND NOT EXISTS (SELECT 1 FROM model_sizes ms WHERE ms.model_id=${q(modelId)} AND ms.size_id=s.id);`
  );
}
function makeSku(modelId, code, sz) {
  const composite = `${modelId}-${code}-${sz}`;
  out.push(
    `INSERT OR IGNORE INTO skus (model_id, color_id, size_id, composite_code, stock, avg_cost) ` +
    `SELECT ${q(modelId)}, c.id, s.id, ${q(composite)}, 0, 0 FROM colors c, sizes s ` +
    `WHERE c.code=${q(code)} AND s.name=${q(sz)};`
  );
}

// 3) New models.
for (const m of NEW_MODELS) {
  out.push(
    `INSERT OR IGNORE INTO models (id, name, design, composition, category_id, type, gender, base_price, avg_cost) ` +
    `SELECT ${q(m.id)}, ${q(m.name)}, NULL, ${q(COMP)}, ` +
    `(SELECT id FROM categories WHERE name=${q(m.category)} AND type='product' LIMIT 1), 'con_tallas', ${q(m.gender)}, 0, 0;`
  );
  for (const code of m.colors) linkColor(m.id, code);
  for (const sz of m.sizes) linkSize(m.id, sz);
  for (const code of m.colors) for (const sz of m.sizes) makeSku(m.id, code, sz);
}

// 4) Complete 42168 with the 3 missing colors (using its existing sizes).
for (const code of ADD_TO_42168.colors) linkColor(ADD_TO_42168.id, code);
for (const code of ADD_TO_42168.colors) for (const sz of ADD_TO_42168.sizes) makeSku(ADD_TO_42168.id, code, sz);

process.stdout.write(out.join("\n") + "\n");

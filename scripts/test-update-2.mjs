import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");

const mdir = "src/lib/db/migrations";
for (const f of fs.readdirSync(mdir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(mdir, f), "utf8");
  for (const s of sql.split("--> statement-breakpoint")) { const t = s.trim(); if (t) db.exec(t); }
}

db.exec(`INSERT INTO categories (name, type) VALUES
  ('Cuello V','product'),('Cuello Mao','product'),('Cuello Neru','product'),
  ('Pantalón','product'),('Gorros','product'),('Accesorio','product');`);
db.exec(`INSERT INTO sizes (name, sort_order) VALUES
  ('XS',0),('S',1),('M',2),('L',3),('XL',4),('2XL',5);`);
// Current prod demo colors.
db.exec(`INSERT INTO colors (code,name,hex,sort_order) VALUES
  ('Z12','Blanco','#d9dad4',6),('Z18','Verde Quirófano','#2f6f5e',4),
  ('Z21','Negro','#1b1b1d',0),('Z22','Azul Rey','#1e3a8a',1),
  ('Z27','Lila','#8b6db0',5),('Z34','Gris Plomo','#6b7280',2),('Z40','Rojo Vino','#7c1d2b',3);`);

db.exec(fs.readFileSync("scripts/initial-load.sql", "utf8"));
db.exec("UPDATE models SET gender='caballero' WHERE id='42019';");

const load2 = fs.readFileSync("scripts/update-2.sql", "utf8");
db.exec(load2);

const g = (q) => db.prepare(q).get();
const colorName = (code) => (db.prepare("SELECT name FROM colors WHERE code=?").get(code) || {}).name;
const colorsOf = (id) => db.prepare("SELECT COUNT(*) n FROM model_colors WHERE model_id=?").get(id).n;
const skusOf = (id) => db.prepare("SELECT COUNT(*) n FROM skus WHERE model_id=?").get(id).n;

const checks = [
  ["models total (4 + 3)", g("SELECT COUNT(*) n FROM models").n, 7],
  ["Z27 renamed to Gris", colorName("Z27"), "Gris"],
  ["Z40 renamed to Rojo", colorName("Z40"), "Rojo"],
  ["Z8 Vinotinto exists", colorName("Z8"), "Vinotinto"],
  ["Z7 Azul Bebé exists", colorName("Z7"), "Azul Bebé"],
  ["Z31 Verde Agua exists", colorName("Z31"), "Verde Agua"],
  ["Z12 removed", db.prepare("SELECT COUNT(*) n FROM colors WHERE code='Z12'").get().n, 0],
  ["Z18 removed", db.prepare("SELECT COUNT(*) n FROM colors WHERE code='Z18'").get().n, 0],
  ["42168 now has 21 colors", colorsOf("42168"), 21],
  ["42342 colors", colorsOf("42342"), 5],
  ["42108 colors", colorsOf("42108"), 2],
  ["42122 colors", colorsOf("42122"), 4],
  ["42342 skus (5x5)", skusOf("42342"), 25],
  ["42108 skus (2x6)", skusOf("42108"), 12],
  ["42122 skus (4x6)", skusOf("42122"), 24],
  ["42168 skus (21x5)", skusOf("42168"), 105],
  ["42342 gender", db.prepare("SELECT gender FROM models WHERE id='42342'").get().gender, "dama"],
  ["42108 gender", db.prepare("SELECT gender FROM models WHERE id='42108'").get().gender, "unisex"],
  ["42122 gender", db.prepare("SELECT gender FROM models WHERE id='42122'").get().gender, "dama"],
  ["orphan skus", g("SELECT COUNT(*) n FROM skus WHERE color_id IS NULL OR size_id IS NULL").n, 0],
  ["dup composites", g("SELECT COUNT(*) n FROM (SELECT composite_code FROM skus GROUP BY composite_code HAVING COUNT(*)>1)").n, 0],
];

// Idempotency
db.exec(load2);
checks.push(["idempotent 42168 colors", colorsOf("42168"), 21]);
checks.push(["idempotent 42122 skus", skusOf("42122"), 24]);

let ok = true;
for (const [label, got, want] of checks) {
  const pass = got === want;
  if (!pass) ok = false;
  console.log(`${pass ? "✅" : "❌"} ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
db.close();
console.log(ok ? "\nUPDATE-2 TEST OK" : "\nUPDATE-2 TEST FAILED");
process.exit(ok ? 0 : 1);

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");

const mdir = "src/lib/db/migrations";
const files = fs.readdirSync(mdir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const sql = fs.readFileSync(path.join(mdir, f), "utf8");
  for (const s of sql.split("--> statement-breakpoint")) {
    const t = s.trim();
    if (t) db.exec(t);
  }
}
console.log("migrations:", files.length);

db.exec(`INSERT INTO categories (name, type) VALUES
  ('Cuello V','product'),('Cuello Mao','product'),('Cuello Neru','product'),
  ('Pantalón','product'),('Gorros','product'),('Accesorio','product');`);
db.exec(`INSERT INTO sizes (name, sort_order) VALUES
  ('XS',0),('S',1),('M',2),('L',3),('XL',4),('2XL',5);`);
db.exec(`INSERT INTO colors (code,name,hex,sort_order) VALUES
  ('Z21','Negro','#1b1b1d',0),('Z22','Azul Rey','#1e3a8a',1),('Z27','Lila','#8b6db0',5);`);

const load = fs.readFileSync("scripts/initial-load.sql", "utf8");
db.exec(load);

const c = (q) => db.prepare(q).get().n;
const checks = [
  ["colors total (3 existing + 22 new = 25)", c("SELECT COUNT(*) n FROM colors"), 25],
  ["models", c("SELECT COUNT(*) n FROM models"), 4],
  ["model_colors", c("SELECT COUNT(*) n FROM model_colors"), 40],
  ["model_sizes", c("SELECT COUNT(*) n FROM model_sizes"), 21],
  ["skus", c("SELECT COUNT(*) n FROM skus"), 205],
  ["orphan skus (null color/size)", c("SELECT COUNT(*) n FROM skus WHERE color_id IS NULL OR size_id IS NULL"), 0],
  ["model_colors w/ bad color", c("SELECT COUNT(*) n FROM model_colors mc LEFT JOIN colors c ON mc.color_id=c.id WHERE c.id IS NULL"), 0],
  ["models w/ null category", c("SELECT COUNT(*) n FROM models WHERE category_id IS NULL"), 0],
  ["dup composite codes", c("SELECT COUNT(*) n FROM (SELECT composite_code FROM skus GROUP BY composite_code HAVING COUNT(*)>1)"), 0],
];

console.log("skus per model:", JSON.stringify(db.prepare("SELECT model_id, COUNT(*) n FROM skus GROUP BY model_id ORDER BY model_id").all()));

// Idempotency
db.exec(load);
const mcAfter = c("SELECT COUNT(*) n FROM model_colors");
const skuAfter = c("SELECT COUNT(*) n FROM skus");
checks.push(["idempotent model_colors (unchanged)", mcAfter, 40]);
checks.push(["idempotent skus (unchanged)", skuAfter, 205]);

let ok = true;
for (const [label, got, want] of checks) {
  const pass = got === want;
  if (!pass) ok = false;
  console.log(`${pass ? "✅" : "❌"} ${label}: got ${got}, want ${want}`);
}
db.close();
console.log(ok ? "\nLOAD TEST OK" : "\nLOAD TEST FAILED");
process.exit(ok ? 0 : 1);

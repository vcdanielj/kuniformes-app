/**
 * Shared catalog filtering used by both the catalog page and the PDF export
 * route, so the on-screen preview and the generated PDF always match.
 *
 * Operates on the shape returned by getInventoryModels(): each model has
 * `category`, `gender`, `type`, `colors[]` (with `code`/`id`) and `skus[]`
 * (with `colorId`, `stock`, `compositeCode`).
 */
export type CatalogFilters = {
  category?: string; // 'all' or a category name
  gender?: string; // 'all' | 'dama' | 'caballero' | 'unisex'
  onlyStock?: boolean;
  sizes?: string[]; // size names; empty = all
  colors?: string[]; // color codes; empty = all
};

export function sizeFromComposite(compositeCode: string): string {
  return (compositeCode || "").split("-").pop() || "";
}

export function filterCatalogModels<T extends Record<string, any>>(
  models: T[],
  f: CatalogFilters
): T[] {
  const sizeSet = new Set((f.sizes || []).filter(Boolean));
  const colorSet = new Set((f.colors || []).filter(Boolean));
  const out: T[] = [];

  for (const m of models) {
    if (f.category && f.category !== "all" && m.category !== f.category) continue;
    if (f.gender && f.gender !== "all" && (m.gender || "dama") !== f.gender) continue;

    let colors = (m.colors || []) as any[];
    if (colorSet.size) colors = colors.filter((c) => colorSet.has(c.code));

    let skus = (m.skus || []) as any[];
    if (sizeSet.size) skus = skus.filter((s) => sizeSet.has(sizeFromComposite(s.compositeCode)));
    if (f.onlyStock) skus = skus.filter((s) => s.stock > 0);

    if (m.type === "con_tallas") {
      // A color stays only if it still has at least one matching SKU.
      const colorIdsWithSku = new Set(skus.map((s) => s.colorId));
      colors = colors.filter((c) => colorIdsWithSku.has(c.id));
    } else {
      // Talla única: a specific-size filter excludes it; otherwise keep stock-matching colors.
      if (sizeSet.size) {
        colors = [];
      } else if (f.onlyStock) {
        const colorIdsWithStock = new Set(skus.map((s) => s.colorId));
        colors = colors.filter((c) => colorIdsWithStock.has(c.id));
      }
    }

    if (colors.length === 0) continue;
    out.push({ ...m, colors, skus });
  }

  return out;
}

import { db } from "./index";
import { sql } from "drizzle-orm";
import {
  users,
  colors,
  sizes,
  categories,
  paymentMethods,
  carriers,
  models,
  modelColors,
  modelSizes,
  skus,
  suppliers,
  customers,
  settings,
  sales,
  saleItems,
  salePayments,
  quotes,
  quoteItems,
  returns,
  returnItems,
  consignees,
  consignmentLots,
  consignmentItems,
  expenses,
  shipments,
} from "./schema";
import {
  seedColors,
  seedSizes,
  seedProductCategories,
  seedExpenseCategories,
  seedPaymentMethods,
  seedCarriers,
  seedModels,
  seedSuppliers,
  seedCustomers,
  seedSettings,
} from "./seed";
import { hashPassword } from "../auth/password";
import { generateSkuCode } from "../utils";

async function main() {
  console.log("🌱 Start seeding local database...");

  // 1. Clear existing data
  console.log("🧹 Cleaning tables...");
  await db.delete(users);
  await db.delete(modelColors);
  await db.delete(modelSizes);
  await db.delete(skus);
  await db.delete(models);
  await db.delete(colors);
  await db.delete(sizes);
  await db.delete(categories);
  await db.delete(paymentMethods);
  await db.delete(carriers);
  await db.delete(suppliers);
  await db.delete(customers);
  await db.delete(settings);
  await db.delete(sales);
  await db.delete(saleItems);
  await db.delete(salePayments);
  await db.delete(quotes);
  await db.delete(quoteItems);
  await db.delete(returns);
  await db.delete(returnItems);
  await db.delete(consignees);
  await db.delete(consignmentLots);
  await db.delete(consignmentItems);
  await db.delete(expenses);
  await db.delete(shipments);

  // 2. Insert Users
  console.log("👤 Seeding users...");
  const adminPasswordHash = await hashPassword("admin123");
  const sellerPasswordHash = await hashPassword("vendedor123");

  await db.insert(users).values([
    {
      id: "usr_admin",
      name: "Administrador K-Uniformes",
      email: "admin@kuniformes.com",
      passwordHash: adminPasswordHash,
      role: "admin",
    },
    {
      id: "usr_seller",
      name: "Yoselin K.",
      email: "yoselin@kuniformes.com",
      passwordHash: sellerPasswordHash,
      role: "vendedor",
    },
  ]);

  // 3. Insert Colors
  console.log("🎨 Seeding colors...");
  const insertedColors: Record<string, number> = {};
  for (const c of seedColors) {
    const [res] = await db
      .insert(colors)
      .values({
        code: c.code,
        name: c.name,
        hex: c.hex,
        sortOrder: c.sortOrder,
      })
      .returning({ id: colors.id });
    insertedColors[c.code] = res.id;
  }

  // 4. Insert Sizes
  console.log("📏 Seeding sizes...");
  const insertedSizes: Record<string, number> = {};
  for (const s of seedSizes) {
    const [res] = await db
      .insert(sizes)
      .values({
        name: s.name,
        sortOrder: s.sortOrder,
      })
      .returning({ id: sizes.id });
    insertedSizes[s.name] = res.id;
  }

  // 5. Insert Categories
  console.log("🏷️ Seeding categories...");
  const insertedCategories: Record<string, number> = {};
  for (const cat of [...seedProductCategories, ...seedExpenseCategories]) {
    const [res] = await db
      .insert(categories)
      .values({
        name: cat.name,
        type: cat.type,
      })
      .returning({ id: categories.id });
    insertedCategories[cat.name] = res.id;
  }

  // 6. Insert Payment Methods
  console.log("💳 Seeding payment methods...");
  const insertedPayMethods: Record<string, number> = {};
  for (const pm of seedPaymentMethods) {
    const [res] = await db
      .insert(paymentMethods)
      .values({
        name: pm.name,
        currency: pm.currency,
        active: true,
      })
      .returning({ id: paymentMethods.id });
    insertedPayMethods[pm.name] = res.id;
  }

  // 7. Insert Carriers
  console.log("🚚 Seeding carriers...");
  const insertedCarriers: Record<string, number> = {};
  for (const cr of seedCarriers) {
    const [res] = await db
      .insert(carriers)
      .values({
        name: cr.name,
        tag: cr.tag,
      })
      .returning({ id: carriers.id });
    insertedCarriers[cr.name] = res.id;
  }

  // 8. Insert Suppliers
  console.log("🏭 Seeding suppliers...");
  const insertedSuppliers: Record<string, number> = {};
  for (const sup of seedSuppliers) {
    const [res] = await db
      .insert(suppliers)
      .values({
        name: sup.name,
        items: sup.items,
        contact: sup.contact,
      })
      .returning({ id: suppliers.id });
    insertedSuppliers[sup.name] = res.id;
  }

  // 9. Insert Customers
  console.log("👥 Seeding customers...");
  const insertedCustomers: Record<string, number> = {};
  for (const cust of seedCustomers) {
    const [res] = await db
      .insert(customers)
      .values({
        name: cust.name,
        phone: cust.phone,
        creditBalance: 0,
      })
      .returning({ id: customers.id });
    insertedCustomers[cust.name] = res.id;
  }

  // 10. Insert Settings
  console.log("⚙️ Seeding settings...");
  for (const set of seedSettings) {
    await db.insert(settings).values({
      key: set.key,
      value: set.value,
    });
  }

  // 11. Insert Models and generate SKUs
  console.log("🧥 Seeding models and generating SKUs...");
  for (const m of seedModels) {
    const catId = insertedCategories[m.category] || null;
    await db.insert(models).values({
      id: m.id,
      name: m.name,
      composition: m.composition,
      categoryId: catId,
      type: m.type,
      basePrice: m.basePrice,
      avgCost: m.avgCost,
    });

    // Link colors
    for (const colorCode of m.colorCodes) {
      const colorId = insertedColors[colorCode];
      if (colorId) {
        await db.insert(modelColors).values({
          modelId: m.id,
          colorId,
        });
      }
    }

    // Link sizes
    for (const sizeName of m.sizeNames) {
      const sizeId = insertedSizes[sizeName];
      if (sizeId) {
        await db.insert(modelSizes).values({
          modelId: m.id,
          sizeId,
        });
      }
    }

    // Generate SKUs & Stock
    if (m.type === "con_tallas") {
      for (const colorCode of m.colorCodes) {
        const colorId = insertedColors[colorCode];
        for (const sizeName of m.sizeNames) {
          const sizeId = insertedSizes[sizeName];
          const composite = generateSkuCode(m.id, colorCode, sizeName);

          // We'll give some stock to make it feel realistic:
          // Match dashboard stock cero:
          // 42168-Z21-XS has stock 0
          // 42170-Z22-S has stock 0
          // 42155-Z34-M has stock 1
          // 42168-Z40-L has stock 2
          // 51020-Z27-XS has stock 3
          let stockVal = 12; // default
          if (composite === "42168-Z21-XS") stockVal = 0;
          else if (composite === "42170-Z22-S") stockVal = 0;
          else if (composite === "42155-Z34-M") stockVal = 1;
          else if (composite === "42168-Z40-L") stockVal = 2;
          else if (composite === "51020-Z27-XS") stockVal = 3;

          await db.insert(skus).values({
            modelId: m.id,
            colorId,
            sizeId,
            compositeCode: composite,
            stock: stockVal,
            avgCost: m.avgCost,
          });
        }
      }
    } else {
      // sin_tallas (gorros/accesorios)
      for (const colorCode of m.colorCodes) {
        const colorId = insertedColors[colorCode];
        const composite = generateSkuCode(m.id, colorCode);

        await db.insert(skus).values({
          modelId: m.id,
          colorId,
          sizeId: null,
          compositeCode: composite,
          stock: 15,
          avgCost: m.avgCost,
        });
      }
    }
  }

  // 12. Seed transactional details to match Dashboard & CRM
  console.log("📈 Seeding transactions to match dashboard KPIs...");

  // Let's create some sales
  // Sales Total: $4860
  // NE-00184 has customer Marielena Rivas, total $86.00
  const custMarielenaId = insertedCustomers["Dra. Marielena Rivas"];
  
  // We need a skuId for Cuello V bota recta (42168) Negro (Z21) M
  const [targetSku] = await db
    .select()
    .from(skus)
    .where(sql`composite_code = '42168-Z21-M'`)
    .limit(1);

  if (targetSku) {
    // Insert NE-00184
    const [sale] = await db
      .insert(sales)
      .values({
        number: "NE-00184",
        customerId: custMarielenaId,
        date: "2026-06-18",
        totalUsd: 86.0,
        totalBs: 86.0 * 801.5,
        rateUsed: 801.5,
        rateSource: "paralelo",
        status: "pagada",
        userId: "usr_seller",
      })
      .returning({ id: sales.id });

    await db.insert(saleItems).values({
      saleId: sale.id,
      skuId: targetSku.id,
      quantity: 3,
      unitPrice: 28.0,
    });

    const methodZelleId = insertedPayMethods["Zelle"];
    await db.insert(salePayments).values({
      saleId: sale.id,
      methodId: methodZelleId,
      amountUsd: 86.0,
    });
  }

  // Let's seed an exchange rate history
  await db.insert(expenses).values([
    {
      date: "2026-06-15",
      note: "Pauta Instagram — campaña uniformes",
      categoryId: insertedCategories["Publicidad"],
      amountUsd: 180.0,
      currency: "USD",
      amountOriginal: 180.0,
      rateUsed: 801.5,
    },
    {
      date: "2026-06-10",
      note: "Suscripción sistema administrativo",
      categoryId: insertedCategories["Sistema"],
      amountUsd: 12.0,
      currency: "USD",
      amountOriginal: 12.0,
      rateUsed: 801.5,
    },
  ]);

  console.log("✅ Seeding complete! local.db is ready.");
}

main().catch((e) => {
  console.error("❌ Seeding failed:", e);
  process.exit(1);
});

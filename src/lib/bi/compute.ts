import type {
  BiReportData,
  BiMonthlyData,
  BiDayOfWeekData,
  BiPaymentMethodData,
  BiTopModelData,
  BiTopSkuData,
  BiColorData,
  BiSizeData,
  BiCustomerData,
  BiConsignmentData,
  BiExpenseCategoryData
} from "./types";

export interface RawDbTables {
  sales: any[];
  sale_items: any[];
  sale_payments: any[];
  customers: any[];
  models: any[];
  skus: any[];
  colors: any[];
  sizes: any[];
  categories: any[];
  payment_methods: any[];
  expenses: any[];
  purchases?: any[];
  purchase_items?: any[];
  consignment_lots: any[];
  consignment_items: any[];
  consignees: any[];
  returns?: any[];
  return_items?: any[];
  users?: any[];
}

const MONTH_NAMES_ES: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

const DAY_NAMES_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export function computeBiReportData(raw: RawDbTables): BiReportData {
  const modelMap = new Map((raw.models || []).map((m: any) => [m.id, m]));
  const colorMap = new Map((raw.colors || []).map((c: any) => [c.id, c]));
  const sizeMap = new Map((raw.sizes || []).map((s: any) => [s.id, s]));
  const skuMap = new Map((raw.skus || []).map((s: any) => [s.id, s]));
  const customerMap = new Map((raw.customers || []).map((c: any) => [c.id, c]));
  const paymentMethodMap = new Map((raw.payment_methods || []).map((pm: any) => [pm.id, pm]));
  const consigneeMap = new Map((raw.consignees || []).map((cg: any) => [cg.id, cg]));
  const categoryMap = new Map((raw.categories || []).map((cat: any) => [cat.id, cat]));

  // Valid Sales (not cancelled)
  const validSales = (raw.sales || []).filter((s: any) => s.status !== "anulada");
  const dates = validSales.map((s: any) => s.date).sort();
  const periodStart = dates[0] || "2026-06-26";
  const periodEnd = dates[dates.length - 1] || "2026-10-02";
  
  const dStart = new Date(periodStart);
  const dEnd = new Date(periodEnd);
  const totalDays = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const totalOrders = validSales.length;
  const totalRevenueUsd = validSales.reduce((acc: number, s: any) => acc + (Number(s.total_usd) || 0), 0);
  const totalRevenueBs = validSales.reduce((acc: number, s: any) => acc + (Number(s.total_bs) || 0), 0);
  const averageOrderValue = totalOrders > 0 ? totalRevenueUsd / totalOrders : 0;

  // Sale Items aggregation & COGS calculation
  let totalUnitsSold = 0;
  let totalCogs = 0;

  const skuAgg: Record<number, { units: number; revenue: number; cogs: number }> = {};
  const modelAgg: Record<string, { units: number; revenue: number; cogs: number }> = {};
  const colorAgg: Record<number, { units: number; revenue: number }> = {};
  const sizeAgg: Record<string, { units: number; revenue: number }> = {};
  const monthlyAgg: Record<string, { orders: number; revenue: number; units: number; cogs: number }> = {};

  const validSaleIds = new Set(validSales.map((s: any) => s.id));
  const saleMap = new Map(validSales.map((s: any) => [s.id, s]));

  for (const it of (raw.sale_items || [])) {
    if (!validSaleIds.has(it.sale_id)) continue;
    const parentSale = saleMap.get(it.sale_id)!;
    const qty = Number(it.quantity) || 0;
    const unitPrice = Number(it.unit_price) || 0;
    const rev = qty * unitPrice;

    totalUnitsSold += qty;

    const sku = skuMap.get(it.sku_id);
    const model = sku ? modelMap.get(sku.model_id) : null;
    const unitCost = Number(sku?.avg_cost || model?.avg_cost || 0);
    const itemCogs = qty * unitCost;
    totalCogs += itemCogs;

    // Monthly
    const ym = parentSale.date.slice(0, 7);
    if (!monthlyAgg[ym]) {
      monthlyAgg[ym] = { orders: 0, revenue: 0, units: 0, cogs: 0 };
    }
    monthlyAgg[ym].units += qty;
    monthlyAgg[ym].cogs += itemCogs;

    // SKU
    if (!skuAgg[it.sku_id]) {
      skuAgg[it.sku_id] = { units: 0, revenue: 0, cogs: 0 };
    }
    skuAgg[it.sku_id].units += qty;
    skuAgg[it.sku_id].revenue += rev;
    skuAgg[it.sku_id].cogs += itemCogs;

    // Model
    if (sku) {
      if (!modelAgg[sku.model_id]) {
        modelAgg[sku.model_id] = { units: 0, revenue: 0, cogs: 0 };
      }
      modelAgg[sku.model_id].units += qty;
      modelAgg[sku.model_id].revenue += rev;
      modelAgg[sku.model_id].cogs += itemCogs;

      // Color
      if (!colorAgg[sku.color_id]) {
        colorAgg[sku.color_id] = { units: 0, revenue: 0 };
      }
      colorAgg[sku.color_id].units += qty;
      colorAgg[sku.color_id].revenue += rev;

      // Size
      const sizeObj = sizeMap.get(sku.size_id);
      const szName = sizeObj ? sizeObj.name : "Sin Talla";
      if (!sizeAgg[szName]) {
        sizeAgg[szName] = { units: 0, revenue: 0 };
      }
      sizeAgg[szName].units += qty;
      sizeAgg[szName].revenue += rev;
    }
  }

  // Count orders and revenue per month
  for (const s of validSales) {
    const ym = s.date.slice(0, 7);
    if (!monthlyAgg[ym]) {
      monthlyAgg[ym] = { orders: 0, revenue: 0, units: 0, cogs: 0 };
    }
    monthlyAgg[ym].orders += 1;
    monthlyAgg[ym].revenue += Number(s.total_usd) || 0;
  }

  const monthlyEvolution: BiMonthlyData[] = Object.keys(monthlyAgg)
    .sort()
    .map(ym => {
      const data = monthlyAgg[ym];
      const parts = ym.split("-");
      const monthNumber = parts[1] || "01";
      const monthName = `${MONTH_NAMES_ES[monthNumber] || ym} ${parts[0]}`;
      const grossProfit = data.revenue - data.cogs;
      const grossMarginPct = data.revenue > 0 ? (grossProfit / data.revenue) * 100 : 0;
      const aov = data.orders > 0 ? data.revenue / data.orders : 0;
      return {
        month: ym,
        monthName,
        orders: data.orders,
        revenueUsd: data.revenue,
        units: data.units,
        aov,
        cogs: data.cogs,
        grossProfit,
        grossMarginPct,
      };
    });

  // Day of Week
  const dayBuckets = [0, 1, 2, 3, 4, 5, 6].map(idx => ({
    dayName: DAY_NAMES_ES[idx],
    dayIndex: idx,
    orders: 0,
    revenueUsd: 0,
    pctRevenue: 0,
  }));

  for (const s of validSales) {
    const d = new Date(`${s.date}T12:00:00Z`).getUTCDay();
    dayBuckets[d].orders += 1;
    dayBuckets[d].revenueUsd += Number(s.total_usd) || 0;
  }
  for (const b of dayBuckets) {
    b.pctRevenue = totalRevenueUsd > 0 ? (b.revenueUsd / totalRevenueUsd) * 100 : 0;
  }
  const dayOfWeekDistribution: BiDayOfWeekData[] = dayBuckets;

  // Payments Breakdown
  const paymentAgg: Record<number, { count: number; amountUsd: number }> = {};
  for (const p of (raw.sale_payments || [])) {
    const mId = p.method_id;
    if (!paymentAgg[mId]) {
      paymentAgg[mId] = { count: 0, amountUsd: 0 };
    }
    paymentAgg[mId].count += 1;
    paymentAgg[mId].amountUsd += Number(p.amount_usd) || 0;
  }

  const paymentMethodsList: BiPaymentMethodData[] = Object.entries(paymentAgg).map(([mIdStr, agg]) => {
    const pm = paymentMethodMap.get(Number(mIdStr));
    const name = pm ? pm.name : `Método #${mIdStr}`;
    const currency = pm ? pm.currency : "USD";
    const sharePct = totalRevenueUsd > 0 ? (agg.amountUsd / totalRevenueUsd) * 100 : 0;
    return {
      name,
      currency,
      transactions: agg.count,
      amountUsd: agg.amountUsd,
      sharePct,
    };
  }).sort((a, b) => b.amountUsd - a.amountUsd);

  // Top Models
  const topModels: BiTopModelData[] = Object.entries(modelAgg).map(([mId, agg]) => {
    const m = modelMap.get(mId);
    const cat = m?.category_id ? categoryMap.get(m.category_id) : null;
    const avgPrice = agg.units > 0 ? agg.revenue / agg.units : (m?.base_price || 0);
    const unitCost = m?.avg_cost || 0;
    const grossProfit = agg.revenue - (agg.units * unitCost);
    const grossMarginPct = agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0;
    const modelSkus = (raw.skus || []).filter((s: any) => s.model_id === mId);
    const currentStock = modelSkus.reduce((a: number, s: any) => a + (Number(s.stock) || 0), 0);
    const revenueSharePct = totalRevenueUsd > 0 ? (agg.revenue / totalRevenueUsd) * 100 : 0;

    return {
      modelId: mId,
      name: m?.name || mId,
      category: cat?.name || "Sin Categoría",
      gender: m?.gender || "dama",
      unitsSold: agg.units,
      revenueUsd: agg.revenue,
      avgPrice,
      unitCost,
      grossMarginPct,
      currentStock,
      revenueSharePct,
    };
  }).sort((a, b) => b.revenueUsd - a.revenueUsd);

  // Top Colors
  const topColors: BiColorData[] = Object.entries(colorAgg).map(([cIdStr, agg]) => {
    const c = colorMap.get(Number(cIdStr));
    return {
      colorId: Number(cIdStr),
      code: c?.code || "Z?",
      name: c?.name || "Desconocido",
      hex: c?.hex || "#999999",
      unitsSold: agg.units,
      revenueUsd: agg.revenue,
      sharePct: totalRevenueUsd > 0 ? (agg.revenue / totalRevenueUsd) * 100 : 0,
    };
  }).sort((a, b) => b.unitsSold - a.unitsSold);

  // Size Distribution
  const sizeDistribution: BiSizeData[] = Object.entries(sizeAgg).map(([szName, agg]) => ({
    sizeName: szName,
    unitsSold: agg.units,
    revenueUsd: agg.revenue,
    sharePct: totalRevenueUsd > 0 ? (agg.revenue / totalRevenueUsd) * 100 : 0,
  })).sort((a, b) => b.unitsSold - a.unitsSold);

  // Inventory & SKUs Health
  let totalStockUnits = 0;
  let inventoryValuationCost = 0;
  let inventoryValuationRetail = 0;
  let outOfStockSkusCount = 0;
  let deadStockSkusCount = 0;
  let deadStockUnits = 0;
  let deadStockEstimatedCapital = 0;
  let activeSellingSkusCount = 0;

  const allTopSkus: BiTopSkuData[] = [];

  for (const sku of (raw.skus || [])) {
    const stock = Number(sku.stock) || 0;
    const m = modelMap.get(sku.model_id);
    const c = colorMap.get(sku.color_id);
    const sz = sku.size_id ? sizeMap.get(sku.size_id) : null;
    const cost = Number(sku.avg_cost || m?.avg_cost || 0);
    const price = Number(sku.price_override || m?.base_price || 0);

    totalStockUnits += stock;
    inventoryValuationCost += stock * cost;
    inventoryValuationRetail += stock * price;

    const soldData = skuAgg[sku.id];
    const unitsSold = soldData?.units || 0;
    const revenueUsd = soldData?.revenue || 0;

    let status: BiTopSkuData["status"] = "saludable";
    if (stock === 0) {
      status = "agotado";
      outOfStockSkusCount += 1;
    } else if (stock <= 2 && unitsSold >= 4) {
      status = "critico";
    } else if (stock > 0 && unitsSold === 0) {
      status = "sobrestock";
      deadStockSkusCount += 1;
      deadStockUnits += stock;
      deadStockEstimatedCapital += stock * cost;
    }

    if (unitsSold > 0) {
      activeSellingSkusCount += 1;
    }

    allTopSkus.push({
      skuId: sku.id,
      compositeCode: sku.composite_code,
      modelName: m?.name || sku.model_id,
      colorName: c?.name || "Color",
      sizeName: sz?.name || "ST",
      unitsSold,
      revenueUsd,
      stockLeft: stock,
      unitCost: cost,
      status,
    });
  }

  const topSkus = [...allTopSkus].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 15);
  const stockoutAlerts = allTopSkus
    .filter(s => (s.status === "agotado" || s.status === "critico") && s.unitsSold > 0)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);

  // Pareto 80/20 calculation
  const skusSortedByRev = [...allTopSkus].sort((a, b) => b.revenueUsd - a.revenueUsd);
  let cumulativeRev = 0;
  let skusFor80PctRevenue = 0;
  for (const s of skusSortedByRev) {
    cumulativeRev += s.revenueUsd;
    skusFor80PctRevenue += 1;
    if (cumulativeRev >= totalRevenueUsd * 0.8) break;
  }

  // Customer Intelligence
  const now = new Date("2026-10-02");
  const custOrdersMap: Record<number, { count: number; totalUsd: number; firstDate: string; lastDate: string }> = {};

  for (const s of validSales) {
    const cId = s.customer_id;
    if (!cId) continue;
    if (!custOrdersMap[cId]) {
      custOrdersMap[cId] = {
        count: 0,
        totalUsd: 0,
        firstDate: s.date,
        lastDate: s.date,
      };
    }
    custOrdersMap[cId].count += 1;
    custOrdersMap[cId].totalUsd += Number(s.total_usd) || 0;
    if (s.date > custOrdersMap[cId].lastDate) custOrdersMap[cId].lastDate = s.date;
    if (s.date < custOrdersMap[cId].firstDate) custOrdersMap[cId].firstDate = s.date;
  }

  const topCustomers: BiCustomerData[] = Object.entries(custOrdersMap).map(([cIdStr, data]) => {
    const cId = Number(cIdStr);
    const cust = customerMap.get(cId);
    const lastDate = new Date(data.lastDate);
    const recencyDays = Math.max(0, Math.round((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
    const aov = data.count > 0 ? data.totalUsd / data.count : 0;
    const sharePct = totalRevenueUsd > 0 ? (data.totalUsd / totalRevenueUsd) * 100 : 0;

    let tier: BiCustomerData["tier"] = "Ocasional";
    if (data.totalUsd >= 700 || data.count >= 8) {
      tier = "VIP Oro";
    } else if (data.totalUsd >= 200 || data.count >= 3) {
      tier = "VIP Plata";
    } else if (data.count > 1) {
      tier = "Recurrente";
    }

    return {
      id: cId,
      name: cust?.name || `Cliente #${cId}`,
      phone: cust?.phone || "",
      ordersCount: data.count,
      totalSpentUsd: data.totalUsd,
      aov,
      firstOrderDate: data.firstDate,
      lastOrderDate: data.lastDate,
      recencyDays,
      creditBalance: Number(cust?.credit_balance) || 0,
      revenueSharePct: sharePct,
      tier,
    };
  }).sort((a, b) => b.totalSpentUsd - a.totalSpentUsd);

  const activeBuyers = topCustomers.length;
  const repeatCustomersCount = topCustomers.filter(c => c.ordersCount > 1).length;
  const singlePurchaseCount = activeBuyers - repeatCustomersCount;
  const repeatRatePct = activeBuyers > 0 ? (repeatCustomersCount / activeBuyers) * 100 : 0;

  const top5Revenue = topCustomers.slice(0, 5).reduce((a, c) => a + c.totalSpentUsd, 0);
  const top10Revenue = topCustomers.slice(0, 10).reduce((a, c) => a + c.totalSpentUsd, 0);
  const top5RevenueSharePct = totalRevenueUsd > 0 ? (top5Revenue / totalRevenueUsd) * 100 : 0;
  const top10RevenueSharePct = totalRevenueUsd > 0 ? (top10Revenue / totalRevenueUsd) * 100 : 0;

  // Consignments
  let totalConsignmentDelivered = 0;
  let totalConsignmentLiquidated = 0;
  let totalConsignmentReturned = 0;

  const consigneeStats: Record<number, {
    lotsCount: number;
    delivered: number;
    liquidated: number;
    returned: number;
  }> = {};

  for (const lot of (raw.consignment_lots || [])) {
    const cgId = lot.consignee_id;
    if (!consigneeStats[cgId]) {
      consigneeStats[cgId] = { lotsCount: 0, delivered: 0, liquidated: 0, returned: 0 };
    }
    consigneeStats[cgId].lotsCount += 1;
  }

  for (const it of (raw.consignment_items || [])) {
    const parentLot = (raw.consignment_lots || []).find((l: any) => l.id === it.lot_id);
    const cgId = parentLot?.consignee_id;
    const qty = Number(it.quantity) || 0;
    const liq = Number(it.liquidated_quantity) || 0;
    const ret = Number(it.returned_quantity) || 0;

    totalConsignmentDelivered += qty;
    totalConsignmentLiquidated += liq;
    totalConsignmentReturned += ret;

    if (cgId && consigneeStats[cgId]) {
      consigneeStats[cgId].delivered += qty;
      consigneeStats[cgId].liquidated += liq;
      consigneeStats[cgId].returned += ret;
    }
  }

  const totalConsignmentPending = totalConsignmentDelivered - totalConsignmentLiquidated - totalConsignmentReturned;
  const liquidationRatePct = totalConsignmentDelivered > 0 ? (totalConsignmentLiquidated / totalConsignmentDelivered) * 100 : 0;
  const pendingCapitalUsd = totalConsignmentPending * 20;

  const consigneeList = Object.entries(consigneeStats).map(([cgIdStr, st]) => {
    const cg = consigneeMap.get(Number(cgIdStr));
    const pendingUnits = st.delivered - st.liquidated - st.returned;
    return {
      name: cg?.name || `Consignataria #${cgIdStr}`,
      location: cg?.location || "Sin Ubicación",
      lotsCount: st.lotsCount,
      deliveredUnits: st.delivered,
      liquidatedUnits: st.liquidated,
      returnedUnits: st.returned,
      pendingUnits,
      pendingUsd: pendingUnits * 20,
    };
  }).sort((a, b) => b.pendingUnits - a.pendingUnits);

  const consignments: BiConsignmentData = {
    totalLots: (raw.consignment_lots || []).length,
    totalUnitsDelivered: totalConsignmentDelivered,
    liquidatedUnits: totalConsignmentLiquidated,
    returnedUnits: totalConsignmentReturned,
    pendingUnits: totalConsignmentPending,
    liquidationRatePct,
    pendingCapitalUsd,
    consignees: consigneeList,
  };

  // Expenses
  const totalExpensesUsd = (raw.expenses || []).reduce((a: number, e: any) => a + (Number(e.amount_usd) || 0), 0);
  const expenseCatMap: Record<string, { total: number; notes: string[] }> = {};

  for (const e of (raw.expenses || [])) {
    const cat = e.category_id ? categoryMap.get(e.category_id) : null;
    const catName = cat?.name || (e.note && (e.note.toLowerCase().includes("publicidad") || e.note.toLowerCase().includes("fotos")) ? "Marketing & Publicidad" : e.note && (e.note.toLowerCase().includes("china") || e.note.toLowerCase().includes("flete")) ? "Importación & Fletes" : "Nómina & Operaciones");
    if (!expenseCatMap[catName]) {
      expenseCatMap[catName] = { total: 0, notes: [] };
    }
    expenseCatMap[catName].total += Number(e.amount_usd) || 0;
    if (e.note && expenseCatMap[catName].notes.length < 3) {
      expenseCatMap[catName].notes.push(e.note.trim());
    }
  }

  const expenseCategories: BiExpenseCategoryData[] = Object.entries(expenseCatMap).map(([category, d]) => ({
    category,
    totalUsd: d.total,
    sharePct: totalExpensesUsd > 0 ? (d.total / totalExpensesUsd) * 100 : 0,
    notes: d.notes,
  })).sort((a, b) => b.totalUsd - a.totalUsd);

  // Financial health
  const grossProfitUsd = totalRevenueUsd - totalCogs;
  const grossMarginPct = totalRevenueUsd > 0 ? (grossProfitUsd / totalRevenueUsd) * 100 : 0;
  const netOperatingIncomeUsd = grossProfitUsd - totalExpensesUsd;
  const netMarginPct = totalRevenueUsd > 0 ? (netOperatingIncomeUsd / totalRevenueUsd) * 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
    totalDays,

    totalOrders,
    totalRevenueUsd,
    totalRevenueBs,
    totalUnitsSold,
    averageOrderValue,
    totalCogs,
    grossProfitUsd,
    grossMarginPct,
    totalExpensesUsd,
    netOperatingIncomeUsd,
    netMarginPct,

    totalSkus: (raw.skus || []).length,
    totalStockUnits,
    inventoryValuationCost,
    inventoryValuationRetail,
    potentialStockGrossProfit: inventoryValuationRetail - inventoryValuationCost,
    outOfStockSkusCount,
    outOfStockPct: (raw.skus || []).length > 0 ? (outOfStockSkusCount / (raw.skus || []).length) * 100 : 0,
    deadStockSkusCount,
    deadStockPct: (raw.skus || []).length > 0 ? (deadStockSkusCount / (raw.skus || []).length) * 100 : 0,
    deadStockUnits,
    deadStockEstimatedCapital,
    activeSellingSkusCount,

    monthlyEvolution,
    dayOfWeekDistribution,
    paymentMethods: paymentMethodsList,
    topModels,
    topSkus,
    stockoutAlerts,
    topColors: topColors.slice(0, 10),
    sizeDistribution,
    topCustomers: topCustomers.slice(0, 10),
    customerMetrics: {
      totalRegistered: (raw.customers || []).length,
      activeBuyers,
      repeatCustomersCount,
      repeatRatePct,
      singlePurchaseCount,
      top5RevenueSharePct,
      top10RevenueSharePct,
    },
    consignments,
    expenses: {
      totalExpensesUsd,
      categories: expenseCategories,
    },
    pareto: {
      skusFor80PctRevenue,
      totalActiveSkus: (raw.skus || []).length,
      skusFor80PctRatio: (raw.skus || []).length > 0 ? (skusFor80PctRevenue / (raw.skus || []).length) * 100 : 0,
    },
  };
}

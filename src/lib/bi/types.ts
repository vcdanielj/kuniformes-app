export interface BiMonthlyData {
  month: string; // YYYY-MM
  monthName: string;
  orders: number;
  revenueUsd: number;
  units: number;
  aov: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface BiDayOfWeekData {
  dayName: string;
  dayIndex: number;
  orders: number;
  revenueUsd: number;
  pctRevenue: number;
}

export interface BiPaymentMethodData {
  name: string;
  currency: string;
  transactions: number;
  amountUsd: number;
  sharePct: number;
}

export interface BiTopModelData {
  modelId: string;
  name: string;
  category: string;
  gender: string;
  unitsSold: number;
  revenueUsd: number;
  avgPrice: number;
  unitCost: number;
  grossMarginPct: number;
  currentStock: number;
  revenueSharePct: number;
}

export interface BiTopSkuData {
  skuId: number;
  compositeCode: string;
  modelName: string;
  colorName: string;
  sizeName: string;
  unitsSold: number;
  revenueUsd: number;
  stockLeft: number;
  unitCost: number;
  status: "agotado" | "critico" | "saludable" | "sobrestock";
}

export interface BiColorData {
  colorId: number;
  code: string;
  name: string;
  hex: string;
  unitsSold: number;
  revenueUsd: number;
  sharePct: number;
}

export interface BiSizeData {
  sizeName: string;
  unitsSold: number;
  revenueUsd: number;
  sharePct: number;
}

export interface BiCustomerData {
  id: number;
  name: string;
  phone: string;
  ordersCount: number;
  totalSpentUsd: number;
  aov: number;
  firstOrderDate: string;
  lastOrderDate: string;
  recencyDays: number;
  creditBalance: number;
  revenueSharePct: number;
  tier: "VIP Oro" | "VIP Plata" | "Recurrente" | "Ocasional";
}

export interface BiConsignmentData {
  totalLots: number;
  totalUnitsDelivered: number;
  liquidatedUnits: number;
  returnedUnits: number;
  pendingUnits: number;
  liquidationRatePct: number;
  pendingCapitalUsd: number;
  consignees: Array<{
    name: string;
    location: string;
    lotsCount: number;
    deliveredUnits: number;
    liquidatedUnits: number;
    returnedUnits: number;
    pendingUnits: number;
    pendingUsd: number;
  }>;
}

export interface BiExpenseCategoryData {
  category: string;
  totalUsd: number;
  sharePct: number;
  notes: string[];
}

export interface BiReportData {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalDays: number;
  
  // High-Level KPIs
  totalOrders: number;
  totalRevenueUsd: number;
  totalRevenueBs: number;
  totalUnitsSold: number;
  averageOrderValue: number;
  totalCogs: number;
  grossProfitUsd: number;
  grossMarginPct: number;
  totalExpensesUsd: number;
  netOperatingIncomeUsd: number;
  netMarginPct: number;

  // Inventory Health
  totalSkus: number;
  totalStockUnits: number;
  inventoryValuationCost: number;
  inventoryValuationRetail: number;
  potentialStockGrossProfit: number;
  outOfStockSkusCount: number;
  outOfStockPct: number;
  deadStockSkusCount: number;
  deadStockPct: number;
  deadStockUnits: number;
  deadStockEstimatedCapital: number;
  activeSellingSkusCount: number;

  // Breakdowns
  monthlyEvolution: BiMonthlyData[];
  dayOfWeekDistribution: BiDayOfWeekData[];
  paymentMethods: BiPaymentMethodData[];
  topModels: BiTopModelData[];
  topSkus: BiTopSkuData[];
  stockoutAlerts: BiTopSkuData[];
  topColors: BiColorData[];
  sizeDistribution: BiSizeData[];
  topCustomers: BiCustomerData[];
  customerMetrics: {
    totalRegistered: number;
    activeBuyers: number;
    repeatCustomersCount: number;
    repeatRatePct: number;
    singlePurchaseCount: number;
    top5RevenueSharePct: number;
    top10RevenueSharePct: number;
  };
  consignments: BiConsignmentData;
  expenses: {
    totalExpensesUsd: number;
    categories: BiExpenseCategoryData[];
  };
  pareto: {
    skusFor80PctRevenue: number;
    totalActiveSkus: number;
    skusFor80PctRatio: number;
  };
}

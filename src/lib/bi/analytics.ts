import { computeBiReportData, RawDbTables } from "./compute";
import { BiReportData } from "./types";
import { db as defaultDb } from "@/lib/db";
import {
  sales,
  saleItems,
  salePayments,
  customers,
  models,
  skus,
  colors,
  sizes,
  categories,
  paymentMethods,
  expenses,
  consignmentLots,
  consignmentItems,
  consignees,
} from "@/lib/db/schema";

export { computeBiReportData, type RawDbTables };
export type { BiReportData };

export async function getBiReportDataFromDb(database = defaultDb): Promise<BiReportData> {
  const [
    salesRows,
    saleItemRows,
    salePaymentRows,
    customerRows,
    modelRows,
    skuRows,
    colorRows,
    sizeRows,
    categoryRows,
    paymentMethodRows,
    expenseRows,
    consignmentLotRows,
    consignmentItemRows,
    consigneeRows,
  ] = await Promise.all([
    database.select().from(sales),
    database.select().from(saleItems),
    database.select().from(salePayments),
    database.select().from(customers),
    database.select().from(models),
    database.select().from(skus),
    database.select().from(colors),
    database.select().from(sizes),
    database.select().from(categories),
    database.select().from(paymentMethods),
    database.select().from(expenses),
    database.select().from(consignmentLots),
    database.select().from(consignmentItems),
    database.select().from(consignees),
  ]);

  return computeBiReportData({
    sales: salesRows,
    sale_items: saleItemRows,
    sale_payments: salePaymentRows,
    customers: customerRows,
    models: modelRows,
    skus: skuRows,
    colors: colorRows,
    sizes: sizeRows,
    categories: categoryRows,
    payment_methods: paymentMethodRows,
    expenses: expenseRows,
    consignment_lots: consignmentLotRows,
    consignment_items: consignmentItemRows,
    consignees: consigneeRows,
  });
}

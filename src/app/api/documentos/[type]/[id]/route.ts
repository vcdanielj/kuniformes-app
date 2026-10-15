import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  sales,
  saleItems,
  salePayments,
  quotes,
  quoteItems,
  customers,
  skus,
  paymentMethods,
  consignmentLots,
  consignmentItems,
  consignees,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateDocumentPdf, generateConsignmentLotPdf } from "@/lib/pdf/generator";
import { getSessionUser } from "@/lib/auth/session";
import { getConfigData } from "@/lib/db/actions";

type JoinedDocumentItem = {
  compositeCode: string | null;
  quantity: number;
  unitPrice: number;
};

type JoinedPayment = {
  name: string | null;
  amountUsd: number;
  amountOriginal: number | null;
  currency: string | null;
  rateUsed: number | null;
  rateSource: string | null;
  reference: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { session, user } = await getSessionUser();
  if (!session || !user) {
    return new Response("No autorizado", { status: 401 });
  }

  const { type, id } = await params;
  const docId = Number(id);

  if (isNaN(docId)) {
    return new Response("ID de documento inválido", { status: 400 });
  }

  try {
    const config = await getConfigData();
    const brand = {
      name: config.settings.marca || "K-Uniformes",
      rif: config.settings.rif || "",
      phone: config.settings.telefono || "",
      instagram: config.settings.instagram || "",
      logoUrl: "/assets/logo.jpg",
    };

    if (type === "venta") {
      // 1. Fetch Sale
      const [saleRecord] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, docId))
        .limit(1);

      if (!saleRecord) {
        return new Response("Venta no encontrada", { status: 404 });
      }

      // 2. Fetch Customer
      let customerName = "Venta anónima";
      let customerPhone = "";
      if (saleRecord.customerId) {
        const [cust] = await db
          .select()
          .from(customers)
          .where(eq(customers.id, saleRecord.customerId))
          .limit(1);
        if (cust) {
          customerName = cust.name;
          customerPhone = cust.phone || "";
        }
      }

      // 3. Fetch Items with JOIN to avoid N+1 queries
      const itemsWithSkus = await db
        .select({
          compositeCode: skus.compositeCode,
          quantity: saleItems.quantity,
          unitPrice: saleItems.unitPrice,
        })
        .from(saleItems)
        .leftJoin(skus, eq(saleItems.skuId, skus.id))
        .where(eq(saleItems.saleId, docId));

      const formattedItems = (itemsWithSkus as JoinedDocumentItem[]).map((item) => ({
        compositeCode: item.compositeCode || "Desconocido",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

      // 4. Fetch Payments with JOIN to avoid N+1 queries
      const paymentsWithMethods = await db
        .select({
          name: paymentMethods.name,
          amountUsd: salePayments.amountUsd,
          amountOriginal: salePayments.amountOriginal,
          currency: salePayments.currency,
          rateUsed: salePayments.rateUsed,
          rateSource: salePayments.rateSource,
          reference: salePayments.reference,
        })
        .from(salePayments)
        .leftJoin(paymentMethods, eq(salePayments.methodId, paymentMethods.id))
        .where(eq(salePayments.saleId, docId));

      const formattedPayments = (paymentsWithMethods as JoinedPayment[]).map((pay) => ({
        name: pay.name || "Otro",
        amountUsd: pay.amountUsd,
        amountOriginal: pay.amountOriginal,
        currency: pay.currency,
        rateUsed: pay.rateUsed,
        rateSource: pay.rateSource,
        reference: pay.reference || "",
      }));

      // 5. Generate PDF
      const pdfBytes = await generateDocumentPdf("venta", saleRecord.number, {
        date: saleRecord.date,
        customerName,
        customerPhone,
        items: formattedItems,
        totalUsd: saleRecord.totalUsd,
        rateUsed: saleRecord.rateUsed,
        rateSource: saleRecord.rateSource,
        notes: saleRecord.notes || "",
        payments: formattedPayments,
      }, { brand, baseUrl: _request.url });
      const pdfBody = Uint8Array.from(pdfBytes);

      return new Response(pdfBody, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${saleRecord.number}.pdf"`,
        },
      });

    } else if (type === "cotizacion") {
      // 1. Fetch Quote
      const [quoteRecord] = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, docId))
        .limit(1);

      if (!quoteRecord) {
        return new Response("Cotización no encontrada", { status: 404 });
      }

      // 2. Fetch Customer
      let customerName = "Anónimo";
      let customerPhone = "";
      if (quoteRecord.customerId) {
        const [cust] = await db
          .select()
          .from(customers)
          .where(eq(customers.id, quoteRecord.customerId))
          .limit(1);
        if (cust) {
          customerName = cust.name;
          customerPhone = cust.phone || "";
        }
      }

      // 3. Fetch Items with JOIN to avoid N+1 queries
      const itemsWithSkus = await db
        .select({
          compositeCode: skus.compositeCode,
          quantity: quoteItems.quantity,
          unitPrice: quoteItems.unitPrice,
        })
        .from(quoteItems)
        .leftJoin(skus, eq(quoteItems.skuId, skus.id))
        .where(eq(quoteItems.quoteId, docId));

      const formattedItems = (itemsWithSkus as JoinedDocumentItem[]).map((item) => ({
        compositeCode: item.compositeCode || "Desconocido",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

      // 4. Generate PDF
      const pdfBytes = await generateDocumentPdf("cotizacion", quoteRecord.number, {
        date: quoteRecord.date,
        customerName,
        customerPhone,
        items: formattedItems,
        totalUsd: quoteRecord.totalUsd,
        rateUsed: quoteRecord.rateUsed,
        rateSource: quoteRecord.rateSource,
        notes: quoteRecord.notes || "",
      }, { brand, baseUrl: _request.url });
      const pdfBody = Uint8Array.from(pdfBytes);

      return new Response(pdfBody, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${quoteRecord.number}.pdf"`,
        },
      });
    } else if (type === "consignacion") {
      // 1. Fetch Consignment Lot
      const [lot] = await db
        .select()
        .from(consignmentLots)
        .where(eq(consignmentLots.id, docId))
        .limit(1);

      if (!lot) {
        return new Response("Lote de consignación no encontrado", { status: 404 });
      }

      // 2. Fetch Consignee
      const [consignee] = await db
        .select()
        .from(consignees)
        .where(eq(consignees.id, lot.consigneeId))
        .limit(1);

      // 3. Fetch Items with JOIN to skus
      const itemsWithSkus = await db
        .select({
          compositeCode: skus.compositeCode,
          quantity: consignmentItems.quantity,
          unitPrice: consignmentItems.unitPrice,
        })
        .from(consignmentItems)
        .leftJoin(skus, eq(consignmentItems.skuId, skus.id))
        .where(eq(consignmentItems.lotId, docId));

      const formattedItems = itemsWithSkus.map((item) => ({
        compositeCode: item.compositeCode || "Desconocido",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

      const totalUnits = formattedItems.reduce((acc, it) => acc + it.quantity, 0);
      const totalUsd = formattedItems.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);

      // 4. Rate from config
      const rateUsed =
        config.fxOverview?.rates?.paralelo ||
        config.fxOverview?.rates?.bcv ||
        0;

      // 5. Generate PDF
      const pdfBytes = await generateConsignmentLotPdf(
        {
          lotId: lot.id,
          date: lot.date,
          status: lot.status,
          consigneeName: consignee?.name || "Consignataria",
          consigneeContact: consignee?.contact,
          consigneeLocation: consignee?.location,
          items: formattedItems,
          totalUsd: totalUsd || lot.totalUsd,
          totalUnits,
          rateUsed,
        },
        { brand, baseUrl: _request.url }
      );
      const pdfBody = Uint8Array.from(pdfBytes);

      return new Response(pdfBody, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="LOTE-${lot.id}.pdf"`,
        },
      });
    }

    return new Response("Tipo de documento inválido", { status: 400 });
  } catch (e: unknown) {
    console.error("Error generating document PDF:", e);
    return new Response("Error interno del servidor al generar PDF", { status: 500 });
  }
}

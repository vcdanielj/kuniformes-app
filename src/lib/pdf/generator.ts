import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatUSD } from "../utils";

type CatalogModel = {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  composition: string | null;
  colorCodes: string[];
};

export async function generateDocumentPdf(
  docType: "venta" | "cotizacion",
  docNumber: string,
  data: {
    date: string;
    customerName: string;
    customerPhone: string;
    items: { compositeCode: string; quantity: number; unitPrice: number }[];
    totalUsd: number;
    rateUsed: number;
    rateSource: string;
    notes?: string;
    payments?: { name: string; amountUsd: number; reference?: string }[];
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // Standard A4: 595 x 842 points
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  // Load fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

  // Styling helper constants
  const cBlack = rgb(21 / 255, 21 / 255, 26 / 255);
  const cGray = rgb(138 / 255, 138 / 255, 130 / 255);
  const cLightGray = rgb(236 / 255, 234 / 255, 227 / 255);

  let y = height - 50;

  // 1. Draw Header
  page.drawText("K-UNIFORMES", {
    x: 50,
    y: y,
    size: 20,
    font: helveticaBold,
    color: cBlack,
  });

  page.drawText("Venezuela", {
    x: 50,
    y: y - 14,
    size: 10,
    font: helveticaFont,
    color: cGray,
  });

  page.drawText("@k_uniformesvzla", {
    x: 50,
    y: y - 26,
    size: 10,
    font: helveticaFont,
    color: cGray,
  });

  // Document Info Block (Top Right)
  const docTitle = docType === "venta" ? "NOTA DE ENTREGA" : "COTIZACIÓN";
  page.drawText(docTitle, {
    x: width - 240,
    y: y,
    size: 14,
    font: helveticaBold,
    color: cBlack,
  });

  page.drawText(`Número: ${docNumber}`, {
    x: width - 240,
    y: y - 16,
    size: 11,
    font: helveticaBold,
    color: cBlack,
  });

  page.drawText(`Fecha: ${data.date}`, {
    x: width - 240,
    y: y - 30,
    size: 10,
    font: helveticaFont,
    color: cBlack,
  });

  y -= 60;

  // Horizontal divider
  page.drawLine({
    start: { x: 50, y: y },
    end: { x: width - 50, y: y },
    thickness: 1,
    color: cLightGray,
  });

  y -= 24;

  // 2. Customer Details Section
  page.drawText("CLIENTE", {
    x: 50,
    y: y,
    size: 9,
    font: helveticaBold,
    color: cGray,
  });

  page.drawText(`Nombre: ${data.customerName}`, {
    x: 50,
    y: y - 16,
    size: 11,
    font: helveticaBold,
    color: cBlack,
  });

  page.drawText(`Contacto: ${data.customerPhone || "Sin registrar"}`, {
    x: 50,
    y: y - 30,
    size: 10,
    font: helveticaFont,
    color: cBlack,
  });

  y -= 54;

  // 3. Items Table Header
  page.drawRectangle({
    x: 50,
    y: y - 6,
    width: width - 100,
    height: 22,
    color: cLightGray,
  });

  page.drawText("SKU / VARIACIÓN", { x: 60, y: y, size: 9, font: helveticaBold, color: cBlack });
  page.drawText("CANT.", { x: 300, y: y, size: 9, font: helveticaBold, color: cBlack });
  page.drawText("P. UNIT", { x: 380, y: y, size: 9, font: helveticaBold, color: cBlack });
  page.drawText("SUBTOTAL", { x: 470, y: y, size: 9, font: helveticaBold, color: cBlack });

  y -= 24;

  // Items Table Rows
  for (const item of data.items) {
    page.drawText(item.compositeCode, {
      x: 60,
      y: y,
      size: 10,
      font: courierFont,
      color: cBlack,
    });

    page.drawText(String(item.quantity), {
      x: 300,
      y: y,
      size: 10,
      font: helveticaFont,
      color: cBlack,
    });

    page.drawText(formatUSD(item.unitPrice), {
      x: 380,
      y: y,
      size: 10,
      font: helveticaFont,
      color: cBlack,
    });

    const sub = item.quantity * item.unitPrice;
    page.drawText(formatUSD(sub), {
      x: 470,
      y: y,
      size: 10,
      font: helveticaBold,
      color: cBlack,
    });

    y -= 18;

    // Draw light item divider
    page.drawLine({
      start: { x: 50, y: y + 5 },
      end: { x: width - 50, y: y + 5 },
      thickness: 0.5,
      color: cLightGray,
    });
  }

  y -= 12;

  // 4. Totals Block (Right Aligned)
  const totalBs = data.totalUsd * data.rateUsed;

  page.drawText("TOTALES", {
    x: width - 240,
    y: y,
    size: 9,
    font: helveticaBold,
    color: cGray,
  });

  page.drawText(`Total USD:`, {
    x: width - 240,
    y: y - 16,
    size: 11,
    font: helveticaFont,
    color: cBlack,
  });

  page.drawText(formatUSD(data.totalUsd), {
    x: width - 120,
    y: y - 16,
    size: 12,
    font: helveticaBold,
    color: cBlack,
  });

  page.drawText(`Tasa de cambio:`, {
    x: width - 240,
    y: y - 30,
    size: 9,
    font: helveticaFont,
    color: cGray,
  });

  page.drawText(`${data.rateUsed.toFixed(2)} Bs (${data.rateSource})`, {
    x: width - 120,
    y: y - 30,
    size: 9,
    font: helveticaFont,
    color: cGray,
  });

  page.drawText(`Total Bs:`, {
    x: width - 240,
    y: y - 46,
    size: 11,
    font: helveticaFont,
    color: cBlack,
  });

  page.drawText(`Bs ${totalBs.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`, {
    x: width - 120,
    y: y - 46,
    size: 11,
    font: helveticaBold,
    color: cBlack,
  });

  y -= 70;

  // 5. Payments List (Venta only)
  if (docType === "venta" && data.payments && data.payments.length > 0) {
    page.drawText("PAGOS REGISTRADOS", {
      x: 50,
      y: y,
      size: 9,
      font: helveticaBold,
      color: cGray,
    });
    y -= 14;

    for (const p of data.payments) {
      const refStr = p.reference ? ` (ref: ${p.reference})` : "";
      page.drawText(`• ${p.name}: ${formatUSD(p.amountUsd)}${refStr}`, {
        x: 50,
        y: y,
        size: 9,
        font: helveticaFont,
        color: cBlack,
      });
      y -= 12;
    }
  }

  y -= 14;

  // Notes
  if (data.notes) {
    page.drawText("NOTAS / OBSERVACIONES", { x: 50, y: y, size: 9, font: helveticaBold, color: cGray });
    page.drawText(data.notes, { x: 50, y: y - 14, size: 9, font: helveticaFont, color: cBlack });
    y -= 30;
  }

  // Footer
  page.drawLine({
    start: { x: 50, y: 50 },
    end: { x: width - 50, y: 50 },
    thickness: 1,
    color: cLightGray,
  });

  page.drawText("Este documento no tiene validez fiscal. Generado por Sistema Administrativo K-Uniformes.", {
    x: 50,
    y: 36,
    size: 8,
    font: helveticaFont,
    color: cGray,
  });

  return await pdfDoc.save();
}

export async function generateCatalogPdf(
  modelsList: CatalogModel[],
  showPrices: boolean
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cBlack = rgb(21 / 255, 21 / 255, 26 / 255);
  const cGray = rgb(138 / 255, 138 / 255, 130 / 255);
  const cLightGray = rgb(236 / 255, 234 / 255, 227 / 255);

  let y = height - 50;

  page.drawText("K-UNIFORMES", {
    x: 50,
    y: y,
    size: 24,
    font: helveticaBold,
    color: cBlack,
  });

  page.drawText("Catálogo de Productos", {
    x: 50,
    y: y - 20,
    size: 14,
    font: helveticaFont,
    color: cGray,
  });

  page.drawText(`Fecha: ${new Date().toLocaleDateString("es-VE")}`, {
    x: width - 150,
    y: y,
    size: 10,
    font: helveticaFont,
    color: cGray,
  });

  y -= 50;

  page.drawLine({
    start: { x: 50, y: y },
    end: { x: width - 50, y: y },
    thickness: 1,
    color: cLightGray,
  });

  y -= 30;

  for (const m of modelsList) {
    if (y < 120) {
      page = pdfDoc.addPage([612, 792]);
      y = height - 50;
    }

    page.drawText(m.name, {
      x: 50,
      y: y,
      size: 14,
      font: helveticaBold,
      color: cBlack,
    });

    if (showPrices) {
      page.drawText(formatUSD(m.basePrice), {
        x: width - 150,
        y: y,
        size: 12,
        font: helveticaBold,
        color: cBlack,
      });
    }

    y -= 16;

    page.drawText(`Ref: ${m.id}  ·  Categoría: ${m.category}`, {
      x: 50,
      y: y,
      size: 10,
      font: helveticaFont,
      color: cGray,
    });

    y -= 14;

    if (m.composition) {
      page.drawText(`Composición: ${m.composition}`, {
        x: 50,
        y: y,
        size: 9,
        font: helveticaFont,
        color: cGray,
      });
      y -= 14;
    }

    const colorsText = `Colores: ${m.colorCodes.join(", ")}`;
    page.drawText(colorsText, {
      x: 50,
      y: y,
      size: 9,
      font: helveticaFont,
      color: cBlack,
    });

    y -= 25;

    page.drawLine({
      start: { x: 50, y: y + 10 },
      end: { x: width - 50, y: y + 10 },
      thickness: 0.5,
      color: cLightGray,
    });
  }

  page.drawText("Este catálogo es para uso informativo y puede cambiar según la disponibilidad.", {
    x: 50,
    y: 30,
    size: 8,
    font: helveticaFont,
    color: cGray,
  });

  return await pdfDoc.save();
}

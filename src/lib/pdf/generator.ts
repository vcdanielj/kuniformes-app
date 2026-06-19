import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatBs, formatRate, formatUSD } from "../utils";

type PdfPayment = {
  name: string;
  amountUsd: number;
  amountOriginal?: number | null;
  currency?: string | null;
  rateUsed?: number | null;
  rateSource?: string | null;
  reference?: string;
};

type CatalogColor = {
  id: number;
  code: string;
  name: string;
  hex: string;
  imageUrl?: string;
};

type CatalogModel = {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  composition: string | null;
  colorCodes: string[];
  colors?: CatalogColor[];
  skus?: Array<{ id: number; sizeId: number | null; compositeCode: string; stock: number }>;
};

type BrandInfo = {
  name: string;
  rif?: string;
  phone?: string;
  instagram?: string;
  logoUrl?: string;
};

type PdfRenderOptions = {
  brand: BrandInfo;
  baseUrl?: string;
};

const cBlack = rgb(21 / 255, 21 / 255, 26 / 255);
const cGray = rgb(138 / 255, 138 / 255, 130 / 255);
const cLightGray = rgb(236 / 255, 234 / 255, 227 / 255);
const cPanel = rgb(245 / 255, 243 / 255, 239 / 255);
const cBorder = rgb(229 / 255, 227 / 255, 220 / 255);

function resolveAssetUrl(url: string, baseUrl?: string) {
  if (url.startsWith("http://") || url.startsWith("https://") || !baseUrl) {
    return url;
  }
  return new URL(url, baseUrl).toString();
}

function splitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [text];
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color = cBlack
) {
  const lines = splitText(font, text, size, maxWidth);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * (size + 3),
      size,
      font,
      color,
    });
  });
  return y - lines.length * (size + 3);
}

function drawFooter(page: PDFPage, pageNumber: number, totalPages: number, font: PDFFont, brand: BrandInfo) {
  const { width } = page.getSize();
  page.drawLine({
    start: { x: 40, y: 36 },
    end: { x: width - 40, y: 36 },
    thickness: 1,
    color: cBorder,
  });

  page.drawText(
    `${brand.instagram || ""}${brand.phone ? ` · ${brand.phone}` : ""}${brand.rif ? ` · ${brand.rif}` : ""}`,
    {
      x: 40,
      y: 22,
      size: 8,
      font,
      color: cGray,
    }
  );

  page.drawText(`Página ${pageNumber} de ${totalPages}`, {
    x: width - 100,
    y: 22,
    size: 8,
    font,
    color: cGray,
  });
}

async function fetchPdfImage(pdfDoc: PDFDocument, url: string, baseUrl?: string, cache?: Map<string, PDFImage | null>) {
  const resolvedUrl = resolveAssetUrl(url, baseUrl);
  if (cache?.has(resolvedUrl)) {
    return cache.get(resolvedUrl) || null;
  }

  try {
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
      cache?.set(resolvedUrl, null);
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const image = contentType.includes("png")
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);
    cache?.set(resolvedUrl, image);
    return image;
  } catch {
    cache?.set(resolvedUrl, null);
    return null;
  }
}

function drawImageContain(page: PDFPage, image: PDFImage, box: { x: number; y: number; width: number; height: number }) {
  const scaled = image.scale(1);
  const ratio = Math.min(box.width / scaled.width, box.height / scaled.height);
  const width = scaled.width * ratio;
  const height = scaled.height * ratio;

  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  });
}

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
    payments?: PdfPayment[];
  },
  options: PdfRenderOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
  const imageCache = new Map<string, PDFImage | null>();

  let y = height - 50;
  const logo = options.brand.logoUrl
    ? await fetchPdfImage(pdfDoc, options.brand.logoUrl, options.baseUrl, imageCache)
    : null;
  if (logo) {
    drawImageContain(page, logo, { x: 40, y: y - 28, width: 40, height: 40 });
  }

  page.drawText(options.brand.name.toUpperCase(), {
    x: 90,
    y,
    size: 19,
    font: helveticaBold,
    color: cBlack,
  });
  page.drawText("Sistema Administrativo · Venezuela", {
    x: 90,
    y: y - 14,
    size: 10,
    font: helveticaFont,
    color: cGray,
  });
  page.drawText(
    `${options.brand.instagram || ""}${options.brand.phone ? ` · ${options.brand.phone}` : ""}`,
    {
      x: 90,
      y: y - 27,
      size: 10,
      font: helveticaFont,
      color: cGray,
    }
  );

  const docTitle = docType === "venta" ? "NOTA DE ENTREGA" : "COTIZACION";
  page.drawRectangle({
    x: width - 210,
    y: y - 34,
    width: 170,
    height: 46,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawText(docTitle, {
    x: width - 196,
    y: y - 4,
    size: 12,
    font: helveticaBold,
    color: cBlack,
  });
  page.drawText(docNumber, {
    x: width - 196,
    y: y - 19,
    size: 11,
    font: courierFont,
    color: cBlack,
  });
  page.drawText(data.date, {
    x: width - 115,
    y: y - 19,
    size: 9,
    font: helveticaFont,
    color: cGray,
  });

  y -= 58;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: cBorder,
  });

  y -= 18;
  page.drawRectangle({ x: 40, y: y - 48, width: 240, height: 56, color: cPanel, borderColor: cBorder, borderWidth: 1 });
  page.drawRectangle({ x: 292, y: y - 48, width: width - 332, height: 56, color: cPanel, borderColor: cBorder, borderWidth: 1 });

  page.drawText("CLIENTE", { x: 52, y: y - 2, size: 9, font: helveticaBold, color: cGray });
  page.drawText(data.customerName, { x: 52, y: y - 18, size: 11, font: helveticaBold, color: cBlack });
  page.drawText(data.customerPhone || "Sin telefono registrado", {
    x: 52,
    y: y - 33,
    size: 9,
    font: helveticaFont,
    color: cGray,
  });

  page.drawText("TASA APLICADA", { x: 304, y: y - 2, size: 9, font: helveticaBold, color: cGray });
  page.drawText(`${formatRate(data.rateUsed)} Bs/USD`, {
    x: 304,
    y: y - 18,
    size: 11,
    font: helveticaBold,
    color: cBlack,
  });
  page.drawText(`Fuente: ${data.rateSource}`, {
    x: 304,
    y: y - 33,
    size: 9,
    font: helveticaFont,
    color: cGray,
  });

  y -= 70;
  page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 20, color: cPanel });
  page.drawText("SKU / VARIACION", { x: 50, y: y + 2, size: 8.5, font: helveticaBold, color: cGray });
  page.drawText("CANT.", { x: 300, y: y + 2, size: 8.5, font: helveticaBold, color: cGray });
  page.drawText("UNIT USD", { x: 365, y: y + 2, size: 8.5, font: helveticaBold, color: cGray });
  page.drawText("SUBTOTAL", { x: 455, y: y + 2, size: 8.5, font: helveticaBold, color: cGray });

  y -= 18;
  for (const item of data.items) {
    page.drawText(item.compositeCode, {
      x: 50,
      y,
      size: 10,
      font: courierFont,
      color: cBlack,
    });
    page.drawText(String(item.quantity), {
      x: 304,
      y,
      size: 10,
      font: helveticaFont,
      color: cBlack,
    });
    page.drawText(formatUSD(item.unitPrice), {
      x: 356,
      y,
      size: 10,
      font: helveticaFont,
      color: cBlack,
    });
    page.drawText(formatUSD(item.quantity * item.unitPrice), {
      x: 445,
      y,
      size: 10,
      font: helveticaBold,
      color: cBlack,
    });
    y -= 16;
    page.drawLine({
      start: { x: 40, y: y + 5 },
      end: { x: width - 40, y: y + 5 },
      thickness: 0.5,
      color: cBorder,
    });
  }

  y -= 12;
  const totalBs = data.totalUsd * data.rateUsed;
  page.drawRectangle({ x: width - 220, y: y - 54, width: 180, height: 60, color: cBlack });
  page.drawText("TOTAL USD", { x: width - 205, y: y - 8, size: 8.5, font: helveticaFont, color: rgb(1, 1, 1) });
  page.drawText(formatUSD(data.totalUsd), { x: width - 205, y: y - 26, size: 15, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("TOTAL BS", { x: width - 205, y: y - 40, size: 8.5, font: helveticaFont, color: rgb(1, 1, 1) });
  page.drawText(formatBs(totalBs), { x: width - 135, y: y - 40, size: 8.5, font: helveticaBold, color: rgb(1, 1, 1) });

  if (docType === "venta" && data.payments?.length) {
    y -= 72;
    page.drawText("DETALLE DE PAGOS", { x: 40, y, size: 9, font: helveticaBold, color: cGray });
    y -= 12;
    for (const payment of data.payments) {
      const original = payment.currency && payment.currency.toUpperCase() !== "USD" && payment.amountOriginal
        ? `${payment.amountOriginal.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.currency}`
        : formatUSD(payment.amountUsd);
      const paymentLine = `${payment.name}: ${original} -> ${formatUSD(payment.amountUsd)}${payment.rateUsed ? ` @ ${formatRate(payment.rateUsed)} (${payment.rateSource || "manual"})` : ""}${payment.reference ? ` · ${payment.reference}` : ""}`;
      y = drawWrappedText(page, helveticaFont, paymentLine, 50, y, width - 100, 9, cBlack) - 4;
    }
  }

  if (data.notes) {
    y -= 10;
    page.drawText("NOTAS", { x: 40, y, size: 9, font: helveticaBold, color: cGray });
    y = drawWrappedText(page, helveticaFont, data.notes, 50, y - 14, width - 100, 9, cBlack) - 8;
  }

  drawFooter(page, 1, 1, helveticaFont, options.brand);
  return await pdfDoc.save();
}

export async function generateCatalogPdf(
  modelsList: CatalogModel[],
  showPrices: boolean,
  options: PdfRenderOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const imageCache = new Map<string, PDFImage | null>();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = options.brand.logoUrl
    ? await fetchPdfImage(pdfDoc, options.brand.logoUrl, options.baseUrl, imageCache)
    : null;
  const entries = modelsList.flatMap((model) => {
    const colors = model.colors?.length ? model.colors : [{ id: 0, code: model.colorCodes[0] || "STD", name: "Disponible", hex: "#F0EEE8" }];
    return colors.map((color) => ({
      ...model,
      color,
    }));
  });

  const pageSize: [number, number] = [612, 792];
  let page = pdfDoc.addPage(pageSize);
  const { width, height } = page.getSize();
  let pageNumber = 1;

  async function drawCatalogHeader(currentPage: PDFPage) {
    if (logo) {
      drawImageContain(currentPage, logo, { x: 40, y: height - 72, width: 42, height: 42 });
    }
    currentPage.drawText(options.brand.name.toUpperCase(), {
      x: 92,
      y: height - 42,
      size: 22,
      font: helveticaBold,
      color: cBlack,
    });
    currentPage.drawText("Catalogo profesional por color", {
      x: 92,
      y: height - 58,
      size: 11,
      font: helveticaFont,
      color: cGray,
    });
    currentPage.drawText(new Date().toLocaleDateString("es-VE"), {
      x: width - 110,
      y: height - 48,
      size: 10,
      font: helveticaFont,
      color: cGray,
    });
    currentPage.drawLine({
      start: { x: 40, y: height - 82 },
      end: { x: width - 40, y: height - 82 },
      thickness: 1,
      color: cBorder,
    });
  }

  await drawCatalogHeader(page);

  let x = 40;
  let y = height - 110;
  const cardWidth = 256;
  const cardHeight = 290;

  for (const entry of entries) {
    if (y - cardHeight < 60) {
      drawFooter(page, pageNumber, 0, helveticaFont, options.brand);
      page = pdfDoc.addPage(pageSize);
      pageNumber += 1;
      await drawCatalogHeader(page);
      x = 40;
      y = height - 110;
    }

    page.drawRectangle({
      x,
      y: y - cardHeight,
      width: cardWidth,
      height: cardHeight,
      color: rgb(1, 1, 1),
      borderColor: cBorder,
      borderWidth: 1,
    });

    page.drawRectangle({
      x: x + 14,
      y: y - 176,
      width: cardWidth - 28,
      height: 150,
      color: cPanel,
    });

    if (entry.color.imageUrl) {
      const image = await fetchPdfImage(pdfDoc, entry.color.imageUrl, options.baseUrl, imageCache);
      if (image) {
        drawImageContain(page, image, {
          x: x + 18,
          y: y - 172,
          width: cardWidth - 36,
          height: 142,
        });
      }
    }

    page.drawText(entry.name, {
      x: x + 14,
      y: y - 194,
      size: 13,
      font: helveticaBold,
      color: cBlack,
      maxWidth: cardWidth - 28,
    });

    page.drawText(`${entry.id} · ${entry.category}`, {
      x: x + 14,
      y: y - 208,
      size: 9,
      font: helveticaFont,
      color: cGray,
      maxWidth: cardWidth - 28,
    });

    page.drawRectangle({
      x: x + 14,
      y: y - 232,
      width: cardWidth - 28,
      height: 18,
      color: cPanel,
    });
    page.drawText(`Color: ${entry.color.name} · ${entry.color.code}`, {
      x: x + 20,
      y: y - 226,
      size: 8.5,
      font: helveticaBold,
      color: cBlack,
    });

    const composition = entry.composition || "Sin composicion registrada";
    drawWrappedText(page, helveticaFont, `Composición: ${composition}`, x + 14, y - 248, cardWidth - 28, 8.5, cGray);

    const sizes = Array.from(
      new Set(
        (entry.skus || [])
          .filter((sku) => !entry.color.id || sku.compositeCode.includes(entry.color.code))
          .map((sku) => sku.compositeCode.split("-").pop() || "")
          .filter(Boolean)
      )
    );
    page.drawText(`Tallas: ${sizes.length ? sizes.join(", ") : "Unica"}`, {
      x: x + 14,
      y: y - 270,
      size: 8.5,
      font: helveticaFont,
      color: cBlack,
      maxWidth: cardWidth - 28,
    });

    if (showPrices) {
      page.drawText(formatUSD(entry.basePrice), {
        x: x + 14,
        y: y - 286,
        size: 11,
        font: helveticaBold,
        color: cBlack,
      });
    } else {
      page.drawText("Precio bajo solicitud", {
        x: x + 14,
        y: y - 286,
        size: 9,
        font: helveticaFont,
        color: cGray,
      });
    }

    if (x + cardWidth * 2 + 20 <= width) {
      x += cardWidth + 20;
    } else {
      x = 40;
      y -= cardHeight + 20;
    }
  }

  const pages = pdfDoc.getPages();
  pages.forEach((catalogPage, index) => {
    drawFooter(catalogPage, index + 1, pages.length, helveticaFont, options.brand);
  });
  return await pdfDoc.save();
}

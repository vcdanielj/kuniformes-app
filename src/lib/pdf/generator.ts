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
const cWhite = rgb(1, 1, 1);
const PAGE_MARGIN_X = 40;
const PAGE_TOP = 50;
const PAGE_BOTTOM = 54;

function hexToRgbColor(hex?: string | null) {
  const h = (hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return cGray;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function resolveAssetUrl(url: string, baseUrl?: string) {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    !baseUrl
  ) {
    return url;
  }
  return new URL(url, baseUrl).toString();
}

/**
 * pdf-lib's StandardFonts use WinAnsi (CP1252) encoding and THROW on any code
 * point outside it (emoji, arrows, CJK, etc.), which would crash the whole
 * document. Map common smart punctuation to ASCII and drop anything that is not
 * encodable, so a stray character in a customer name/note degrades gracefully.
 */
const PDF_TEXT_REPLACEMENTS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-", "‒": "-", "−": "-",
  "…": "...", "•": "-", " ": " ",
  "→": "->", "←": "<-", "↔": "<->",
  "€": "EUR", "™": "(TM)", "®": "(R)", "©": "(C)",
};

function sanitizePdfText<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  const text = String(value);
  let out = "";
  for (const ch of text) {
    const mapped = PDF_TEXT_REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    // Tab/newline, ASCII printable, and Latin-1 supplement are all WinAnsi-safe.
    if (code === 9 || code === 10 || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
    }
    // Everything else (emoji, exotic symbols) is dropped.
  }
  return out as T;
}

function sanitizeBrand(brand: BrandInfo): BrandInfo {
  return {
    ...brand,
    name: sanitizePdfText(brand.name),
    rif: sanitizePdfText(brand.rif),
    phone: sanitizePdfText(brand.phone),
    instagram: sanitizePdfText(brand.instagram),
  };
}

function splitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = sanitizePdfText(text).trim().split(/\s+/).filter(Boolean);
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
  // Customer-facing documents must not surface the RIF. Footer shows only the
  // public contact (instagram + phone).
  const footerText = `${brand.instagram || ""}${brand.phone ? ` · ${brand.phone}` : ""}`;
  const pageLabel = `Pagina ${pageNumber} de ${totalPages}`;

  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: 36 },
    end: { x: width - PAGE_MARGIN_X, y: 36 },
    thickness: 1,
    color: cBorder,
  });

  page.drawText(footerText, {
    x: PAGE_MARGIN_X,
    y: 22,
    size: 8,
    font,
    color: cGray,
  });

  page.drawText(pageLabel, {
    x: width - PAGE_MARGIN_X - font.widthOfTextAtSize(pageLabel, 8),
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
    let bytes: Uint8Array;
    let contentType = "";

    if (resolvedUrl.startsWith("data:")) {
      // Parse data URLs inline — workerd's fetch() does not reliably support the
      // data: scheme, and this avoids a wasteful base64 round-trip.
      const match = resolvedUrl.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
      if (!match) {
        cache?.set(resolvedUrl, null);
        return null;
      }
      contentType = match[1] || "";
      if (match[2]) {
        const binary = atob(match[3]);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
      }
    } else {
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        cache?.set(resolvedUrl, null);
        return null;
      }
      contentType = response.headers.get("content-type") || "";
      bytes = new Uint8Array(await response.arrayBuffer());
    }

    const type = contentType.toLowerCase();
    let image: PDFImage | null = null;
    if (type.includes("png")) {
      image = await pdfDoc.embedPng(bytes);
    } else if (type.includes("jpeg") || type.includes("jpg")) {
      image = await pdfDoc.embedJpg(bytes);
    } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      image = await pdfDoc.embedPng(bytes); // PNG magic bytes
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      image = await pdfDoc.embedJpg(bytes); // JPEG magic bytes
    } else {
      // pdf-lib cannot embed WEBP/other formats — skip gracefully (blank card,
      // no crash) rather than throwing.
      image = null;
    }
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

function drawDocumentHeader(
  page: PDFPage,
  brand: BrandInfo,
  fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont },
  logo: PDFImage | null,
  docTitle: string,
  docNumber: string,
  date: string,
  continuation = false
) {
  const { width, height } = page.getSize();
  let y = height - PAGE_TOP;

  if (logo) {
    drawImageContain(page, logo, { x: PAGE_MARGIN_X, y: y - 28, width: 42, height: 42 });
  }

  page.drawText(brand.name.toUpperCase(), {
    x: 92,
    y,
    size: 19,
    font: fonts.bold,
    color: cBlack,
  });
  page.drawText("Sistema Administrativo · Venezuela", {
    x: 92,
    y: y - 14,
    size: 10,
    font: fonts.regular,
    color: cGray,
  });
  page.drawText(`${brand.instagram || ""}${brand.phone ? ` · ${brand.phone}` : ""}`, {
    x: 92,
    y: y - 27,
    size: 10,
    font: fonts.regular,
    color: cGray,
  });

  page.drawRectangle({
    x: width - 216,
    y: y - 36,
    width: 176,
    height: 50,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawText(docTitle, {
    x: width - 202,
    y: y - 3,
    size: 11.5,
    font: fonts.bold,
    color: cBlack,
  });
  page.drawText(docNumber, {
    x: width - 202,
    y: y - 20,
    size: 10.5,
    font: fonts.mono,
    color: cBlack,
  });
  page.drawText(date, {
    x: width - 202,
    y: y - 32,
    size: 8.5,
    font: fonts.regular,
    color: cGray,
  });

  if (continuation) {
    page.drawText("Continuacion", {
      x: width - 106,
      y: y + 2,
      size: 8.5,
      font: fonts.regular,
      color: cGray,
    });
  }

  y -= 60;
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y },
    end: { x: width - PAGE_MARGIN_X, y },
    thickness: 1,
    color: cBorder,
  });

  return y;
}

function drawDocumentInfoPanels(
  page: PDFPage,
  data: {
    customerName: string;
    customerPhone: string;
    rateUsed: number;
    rateSource: string;
  },
  fonts: { regular: PDFFont; bold: PDFFont }
) {
  const { width } = page.getSize();
  const y = page.getSize().height - PAGE_TOP - 78;

  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 52,
    width: 240,
    height: 60,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 292,
    y: y - 52,
    width: width - 332,
    height: 60,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });

  page.drawText("CLIENTE", { x: 52, y: y - 2, size: 9, font: fonts.bold, color: cGray });
  page.drawText(data.customerName, { x: 52, y: y - 18, size: 11, font: fonts.bold, color: cBlack });
  page.drawText(data.customerPhone || "Sin telefono registrado", {
    x: 52,
    y: y - 34,
    size: 9,
    font: fonts.regular,
    color: cGray,
  });

  page.drawText("TASA APLICADA", { x: 304, y: y - 2, size: 9, font: fonts.bold, color: cGray });
  page.drawText(`${formatRate(data.rateUsed)} Bs/USD`, {
    x: 304,
    y: y - 18,
    size: 11,
    font: fonts.bold,
    color: cBlack,
  });
  // The rate SOURCE is intentionally omitted from customer-facing documents.

  return y - 70;
}

function drawItemsHeader(page: PDFPage, boldFont: PDFFont) {
  const { width } = page.getSize();
  const y = page.getSize().height - PAGE_TOP - 168;

  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 4,
    width: width - PAGE_MARGIN_X * 2,
    height: 20,
    color: cPanel,
  });
  page.drawText("SKU / VARIACION", { x: 50, y: y + 2, size: 8.5, font: boldFont, color: cGray });
  page.drawText("CANT.", { x: 300, y: y + 2, size: 8.5, font: boldFont, color: cGray });
  page.drawText("UNIT USD", { x: 365, y: y + 2, size: 8.5, font: boldFont, color: cGray });
  page.drawText("SUBTOTAL", { x: 455, y: y + 2, size: 8.5, font: boldFont, color: cGray });

  return y - 18;
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
  // Sanitize all user-supplied strings up front so no stray character can crash
  // the WinAnsi-encoded StandardFonts mid-render.
  options = { ...options, brand: sanitizeBrand(options.brand) };
  data = {
    ...data,
    customerName: sanitizePdfText(data.customerName),
    customerPhone: sanitizePdfText(data.customerPhone),
    rateSource: sanitizePdfText(data.rateSource),
    notes: sanitizePdfText(data.notes),
    items: data.items.map((it) => ({ ...it, compositeCode: sanitizePdfText(it.compositeCode) })),
    payments: data.payments?.map((p) => ({
      ...p,
      name: sanitizePdfText(p.name),
      reference: sanitizePdfText(p.reference),
      currency: sanitizePdfText(p.currency),
    })),
  };

  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
  const imageCache = new Map<string, PDFImage | null>();
  const logo = options.brand.logoUrl
    ? await fetchPdfImage(pdfDoc, options.brand.logoUrl, options.baseUrl, imageCache)
    : null;
  const fonts = { regular: helveticaFont, bold: helveticaBold, mono: courierFont };
  const pageSize: [number, number] = [595, 842];
  const docTitle = docType === "venta" ? "NOTA DE ENTREGA" : "COTIZACION";
  const pages: PDFPage[] = [];
  const totalBs = data.totalUsd * data.rateUsed;
  let page = pdfDoc.addPage(pageSize);
  let y = 0;

  const addPage = (continuation = false, section: "items" | "text" = "items") => {
    page = continuation && pages.length > 0 ? pdfDoc.addPage(pageSize) : page;
    if (continuation || pages.length === 0) {
      if (continuation) {
        pages.push(page);
      } else {
        pages.push(page);
      }
    }
    const headerBottom = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, continuation);
    if (!continuation) {
      y = drawDocumentInfoPanels(page, {
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        rateUsed: data.rateUsed,
        rateSource: data.rateSource,
      }, fonts);
    } else {
      y = headerBottom - 18;
    }
    if (section === "items") {
      y = drawItemsHeader(page, helveticaBold);
    }
  };

  addPage(false, "items");

  if (data.items.length === 0) {
    page.drawText("Sin articulos registrados.", {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: cGray,
    });
    y -= 20;
  } else {
    for (const item of data.items) {
      const codeLines = splitText(courierFont, item.compositeCode, 10, 228);
      const rowHeight = Math.max(16, codeLines.length * 12) + 4;
      if (y - rowHeight < PAGE_BOTTOM + 120) {
        page = pdfDoc.addPage(pageSize);
        pages.push(page);
        drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, true);
        y = drawItemsHeader(page, helveticaBold);
      }

      codeLines.forEach((line, index) => {
        page.drawText(line, {
          x: 50,
          y: y - index * 12,
          size: 10,
          font: courierFont,
          color: cBlack,
        });
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

      y -= rowHeight;
      page.drawLine({
        start: { x: PAGE_MARGIN_X, y: y + 4 },
        end: { x: page.getSize().width - PAGE_MARGIN_X, y: y + 4 },
        thickness: 0.5,
        color: cBorder,
      });
    }
  }

  if (y - 90 < PAGE_BOTTOM + 90) {
    page = pdfDoc.addPage(pageSize);
    pages.push(page);
    y = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, true) - 18;
  } else {
    y -= 14;
  }

  const { width } = page.getSize();
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 70,
    width: width - 292,
    height: 78,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawText("RESUMEN DEL DOCUMENTO", {
    x: 52,
    y: y - 2,
    size: 9,
    font: helveticaBold,
    color: cGray,
  });
  page.drawText(`Tasa guardada: ${formatRate(data.rateUsed)} Bs/USD`, {
    x: 52,
    y: y - 20,
    size: 9.5,
    font: helveticaFont,
    color: cBlack,
  });
  page.drawText(
    docType === "venta"
      ? "Documento listo para imprimir, entregar y respaldar el cierre de caja."
      : "Cotizacion con valores en USD y referencia equivalente en bolivares.",
    {
      x: 52,
      y: y - 38,
      size: 9,
      font: helveticaFont,
      color: cGray,
      maxWidth: width - 320,
    }
  );

  page.drawRectangle({
    x: width - 220,
    y: y - 78,
    width: 180,
    height: 84,
    color: cBlack,
  });
  page.drawText("TOTAL USD", { x: width - 205, y: y - 10, size: 8.5, font: helveticaFont, color: cWhite });
  page.drawText(formatUSD(data.totalUsd), { x: width - 205, y: y - 30, size: 15, font: helveticaBold, color: cWhite });
  page.drawText("TOTAL BS", { x: width - 205, y: y - 48, size: 8.5, font: helveticaFont, color: cWhite });
  page.drawText(formatBs(totalBs), { x: width - 205, y: y - 64, size: 11.5, font: helveticaBold, color: cWhite });
  y -= 100;

  const startTextSection = (title: string) => {
    if (y - 42 < PAGE_BOTTOM + 70) {
      page = pdfDoc.addPage(pageSize);
      pages.push(page);
      y = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, true) - 18;
    }
    page.drawText(title, {
      x: PAGE_MARGIN_X,
      y,
      size: 9,
      font: helveticaBold,
      color: cGray,
    });
    y -= 14;
  };

  if (docType === "venta" && data.payments?.length) {
    startTextSection("DETALLE DE PAGOS");
    for (const payment of data.payments) {
      const original = payment.currency && payment.currency.toUpperCase() !== "USD" && payment.amountOriginal
        ? `${payment.amountOriginal.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.currency}`
        : formatUSD(payment.amountUsd);
      const paymentLine = `${payment.name}: ${original} -> ${formatUSD(payment.amountUsd)}${payment.rateUsed ? ` @ ${formatRate(payment.rateUsed)}` : ""}${payment.reference ? ` · ${payment.reference}` : ""}`;
      const paymentLines = splitText(helveticaFont, paymentLine, 9, width - 100);
      if (y - paymentLines.length * 12 < PAGE_BOTTOM + 50) {
        page = pdfDoc.addPage(pageSize);
        pages.push(page);
        y = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, true) - 18;
        page.drawText("DETALLE DE PAGOS", {
          x: PAGE_MARGIN_X,
          y,
          size: 9,
          font: helveticaBold,
          color: cGray,
        });
        y -= 14;
      }
      y = drawWrappedText(page, helveticaFont, paymentLine, 50, y, width - 100, 9, cBlack) - 4;
    }
  }

  if (data.notes) {
    startTextSection("NOTAS");
    const noteLines = splitText(helveticaFont, data.notes, 9, width - 100);
    if (y - noteLines.length * 12 < PAGE_BOTTOM + 36) {
      page = pdfDoc.addPage(pageSize);
      pages.push(page);
      y = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, true) - 18;
      page.drawText("NOTAS", {
        x: PAGE_MARGIN_X,
        y,
        size: 9,
        font: helveticaBold,
        color: cGray,
      });
      y -= 14;
    }
    page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: y - Math.max(42, noteLines.length * 12 + 12),
      width: width - PAGE_MARGIN_X * 2,
      height: Math.max(42, noteLines.length * 12 + 12),
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    y = drawWrappedText(page, helveticaFont, data.notes, 50, y - 10, width - 100, 9, cBlack) - 8;
  }

  pages.forEach((currentPage, index) => {
    drawFooter(currentPage, index + 1, pages.length, helveticaFont, options.brand);
  });

  return await pdfDoc.save();
}

export async function generateCatalogPdf(
  modelsList: CatalogModel[],
  showPrices: boolean,
  options: PdfRenderOptions
): Promise<Uint8Array> {
  options = { ...options, brand: sanitizeBrand(options.brand) };
  modelsList = modelsList.map((model) => ({
    ...model,
    id: sanitizePdfText(model.id),
    name: sanitizePdfText(model.name),
    category: sanitizePdfText(model.category),
    composition: sanitizePdfText(model.composition),
    colorCodes: model.colorCodes.map((c) => sanitizePdfText(c)),
    colors: model.colors?.map((color) => ({
      ...color,
      name: sanitizePdfText(color.name),
      code: sanitizePdfText(color.code),
    })),
  }));

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
  const pages = [page];
  const { width, height } = page.getSize();

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
      x: width - 40 - helveticaFont.widthOfTextAtSize(new Date().toLocaleDateString("es-VE"), 10),
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

  // 2x2 grid = four product cards per page. Sized to fill the page height so
  // there is no large empty band at the bottom and the grid reads as centered.
  // The two columns (2 * cardWidth + colGap) exactly span the content area
  // (width - 2 * gridLeft), so the grid is horizontally centered. Layout flows
  // top-to-bottom inside each card so nothing overlaps regardless of how many
  // lines the title wraps to.
  const pad = 14;
  const cardWidth = 256;
  const colGap = 20;
  const rowGap = 18;
  const imgH = 158; // portrait image area for vertical product photos
  const cardHeight = 300;

  const gridLeft = 40;
  const topStart = height - 102;
  let x = gridLeft;
  let y = topStart;

  for (const entry of entries) {
    if (y - cardHeight < PAGE_BOTTOM + 8) {
      page = pdfDoc.addPage(pageSize);
      pages.push(page);
      await drawCatalogHeader(page);
      x = gridLeft;
      y = topStart;
    }

    const cardTop = y;
    const innerW = cardWidth - pad * 2;

    // Card frame
    page.drawRectangle({
      x,
      y: cardTop - cardHeight,
      width: cardWidth,
      height: cardHeight,
      color: cWhite,
      borderColor: cBorder,
      borderWidth: 1,
    });

    // Portrait image area
    const imgTop = cardTop - pad;
    page.drawRectangle({ x: x + pad, y: imgTop - imgH, width: innerW, height: imgH, color: cPanel });

    let drewImage = false;
    if (entry.color.imageUrl) {
      const image = await fetchPdfImage(pdfDoc, entry.color.imageUrl, options.baseUrl, imageCache);
      if (image) {
        drawImageContain(page, image, { x: x + pad, y: imgTop - imgH, width: innerW, height: imgH });
        drewImage = true;
      }
    }
    if (!drewImage) {
      const ph = "Sin foto";
      page.drawText(ph, {
        x: x + pad + (innerW - helveticaFont.widthOfTextAtSize(ph, 9)) / 2,
        y: imgTop - imgH / 2,
        size: 9,
        font: helveticaFont,
        color: cGray,
      });
    }

    // Flowing text block below the image.
    let ty = imgTop - imgH - 18;
    ty = drawWrappedText(page, helveticaBold, entry.name, x + pad, ty, innerW, 12.5, cBlack) - 3;

    page.drawText(`${entry.id} · ${entry.category}`, {
      x: x + pad,
      y: ty,
      size: 8.5,
      font: helveticaFont,
      color: cGray,
      maxWidth: innerW,
    });
    ty -= 17;

    // Color swatch + name
    page.drawRectangle({
      x: x + pad,
      y: ty - 2,
      width: 11,
      height: 11,
      color: hexToRgbColor(entry.color.hex),
      borderColor: cBorder,
      borderWidth: 0.5,
    });
    page.drawText(`${entry.color.name} · ${entry.color.code}`, {
      x: x + pad + 17,
      y: ty,
      size: 9,
      font: helveticaBold,
      color: cBlack,
      maxWidth: innerW - 17,
    });
    ty -= 17;

    const sizes = Array.from(
      new Set(
        (entry.skus || [])
          .filter((sku) => !entry.color.id || sku.compositeCode.includes(entry.color.code))
          .map((sku) => {
            const parts = sku.compositeCode.split("-");
            return parts.length >= 3 ? parts[parts.length - 1] : "";
          })
          .filter(Boolean)
      )
    );
    page.drawText(`Tallas: ${sizes.length ? sizes.join(", ") : "Unica"}`, {
      x: x + pad,
      y: ty,
      size: 8.5,
      font: helveticaFont,
      color: cBlack,
      maxWidth: innerW,
    });
    ty -= 17;

    // Separator + price flow right after the sizes line (never overlaps).
    page.drawLine({
      start: { x: x + pad, y: ty + 7 },
      end: { x: x + cardWidth - pad, y: ty + 7 },
      thickness: 0.7,
      color: cLightGray,
    });
    ty -= 8;
    if (showPrices) {
      page.drawText(formatUSD(entry.basePrice), { x: x + pad, y: ty, size: 12, font: helveticaBold, color: cBlack });
    } else {
      page.drawText("Precio bajo solicitud", { x: x + pad, y: ty, size: 9, font: helveticaFont, color: cGray });
    }

    if (x + cardWidth * 2 + colGap <= width) {
      x += cardWidth + colGap;
    } else {
      x = gridLeft;
      y -= cardHeight + rowGap;
    }
  }

  pages.forEach((catalogPage, index) => {
    drawFooter(catalogPage, index + 1, pages.length, helveticaFont, options.brand);
  });

  return await pdfDoc.save();
}

export type ConsignmentLotPdfData = {
  lotId: number;
  date: string;
  status: string;
  consigneeName: string;
  consigneeContact?: string | null;
  consigneeLocation?: string | null;
  items: { compositeCode: string; quantity: number; unitPrice?: number }[];
  totalUsd?: number;
  totalUnits: number;
  rateUsed?: number;
  notes?: string;
};

function drawConsignmentInfoPanels(
  page: PDFPage,
  data: {
    consigneeName: string;
    consigneeContact?: string | null;
    consigneeLocation?: string | null;
    status: string;
    totalUnits: number;
  },
  fonts: { regular: PDFFont; bold: PDFFont }
) {
  const { width } = page.getSize();
  const y = page.getSize().height - PAGE_TOP - 78;

  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 52,
    width: 250,
    height: 60,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 302,
    y: y - 52,
    width: width - 342,
    height: 60,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });

  page.drawText("CONSIGNATARIA / RECEPTOR", { x: 52, y: y - 2, size: 9, font: fonts.bold, color: cGray });
  page.drawText(data.consigneeName, { x: 52, y: y - 18, size: 11, font: fonts.bold, color: cBlack });
  const contactText = [data.consigneeLocation, data.consigneeContact].filter(Boolean).join(" · ") || "Sin datos de contacto";
  page.drawText(contactText, {
    x: 52,
    y: y - 34,
    size: 9,
    font: fonts.regular,
    color: cGray,
  });

  page.drawText("DATOS DE LA ENTREGA", { x: 314, y: y - 2, size: 9, font: fonts.bold, color: cGray });
  page.drawText("Mercancia en Consignacion", {
    x: 314,
    y: y - 18,
    size: 11,
    font: fonts.bold,
    color: cBlack,
  });
  const statusLabel =
    data.status === "liquidado"
      ? "Liquidado"
      : data.status === "pago_parcial"
      ? "Pago parcial"
      : data.status === "devuelto"
      ? "Devuelto"
      : "Pendiente";
  page.drawText(`Estado: ${statusLabel} · ${data.totalUnits} piezas entregadas`, {
    x: 314,
    y: y - 34,
    size: 9,
    font: fonts.regular,
    color: cGray,
  });

  return y - 70;
}

function drawConsignmentItemsHeader(page: PDFPage, y: number, boldFont: PDFFont) {
  const { width } = page.getSize();
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 4,
    width: width - PAGE_MARGIN_X * 2,
    height: 20,
    color: cPanel,
  });
  page.drawText("#", { x: 50, y: y + 2, size: 8.5, font: boldFont, color: cGray });
  page.drawText("SKU / PRENDA O ARTICULO", { x: 80, y: y + 2, size: 8.5, font: boldFont, color: cGray });
  page.drawText("CANTIDAD", { x: 475, y: y + 2, size: 8.5, font: boldFont, color: cGray });

  return y - 18;
}

export async function generateConsignmentLotPdf(
  data: ConsignmentLotPdfData,
  options: PdfRenderOptions
): Promise<Uint8Array> {
  options = { ...options, brand: sanitizeBrand(options.brand) };
  data = {
    ...data,
    consigneeName: sanitizePdfText(data.consigneeName),
    consigneeContact: sanitizePdfText(data.consigneeContact || ""),
    consigneeLocation: sanitizePdfText(data.consigneeLocation || ""),
    notes: sanitizePdfText(data.notes || ""),
    items: data.items.map((it) => ({ ...it, compositeCode: sanitizePdfText(it.compositeCode) })),
  };

  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
  const imageCache = new Map<string, PDFImage | null>();
  const logo = options.brand.logoUrl
    ? await fetchPdfImage(pdfDoc, options.brand.logoUrl, options.baseUrl, imageCache)
    : null;
  const fonts = { regular: helveticaFont, bold: helveticaBold, mono: courierFont };
  const pageSize: [number, number] = [595, 842];
  const docTitle = "ENTREGA EN CONSIGNACION";
  const docNumber = `LOTE #${data.lotId}`;
  const pages: PDFPage[] = [];
  let page = pdfDoc.addPage(pageSize);
  let y = 0;

  const addPage = (continuation = false) => {
    page = continuation && pages.length > 0 ? pdfDoc.addPage(pageSize) : page;
    pages.push(page);
    const headerBottom = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, continuation);
    if (!continuation) {
      const panelsBottom = drawConsignmentInfoPanels(
        page,
        {
          consigneeName: data.consigneeName,
          consigneeContact: data.consigneeContact,
          consigneeLocation: data.consigneeLocation,
          status: data.status,
          totalUnits: data.totalUnits,
        },
        fonts
      );
      y = drawConsignmentItemsHeader(page, panelsBottom - 4, helveticaBold);
    } else {
      y = drawConsignmentItemsHeader(page, headerBottom - 18, helveticaBold);
    }
  };

  addPage(false);

  if (data.items.length === 0) {
    page.drawText("Sin articulos registrados en este lote.", {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: cGray,
    });
    y -= 20;
  } else {
    let itemIndex = 1;
    for (const item of data.items) {
      const codeLines = splitText(courierFont, item.compositeCode, 10, 375);
      const rowHeight = Math.max(16, codeLines.length * 12) + 4;
      if (y - rowHeight < PAGE_BOTTOM + 180) {
        addPage(true);
      }

      page.drawText(String(itemIndex), {
        x: 50,
        y,
        size: 9.5,
        font: helveticaFont,
        color: cGray,
      });

      codeLines.forEach((line, index) => {
        page.drawText(line, {
          x: 80,
          y: y - index * 12,
          size: 10,
          font: courierFont,
          color: cBlack,
        });
      });

      const qtyText = `${item.quantity} und`;
      page.drawText(qtyText, {
        x: 475,
        y,
        size: 10,
        font: helveticaBold,
        color: cBlack,
      });

      y -= rowHeight;
      page.drawLine({
        start: { x: PAGE_MARGIN_X, y: y + 4 },
        end: { x: page.getSize().width - PAGE_MARGIN_X, y: y + 4 },
        thickness: 0.5,
        color: cBorder,
      });
      itemIndex++;
    }
  }

  // Check space for Summary & Signatures (~190 pts)
  const { width } = page.getSize();
  if (y - 190 < PAGE_BOTTOM) {
    page = pdfDoc.addPage(pageSize);
    pages.push(page);
    y = drawDocumentHeader(page, options.brand, fonts, logo, docTitle, docNumber, data.date, true) - 24;
  } else {
    y -= 14;
  }

  // Summary box
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - 76,
    width: width - 292,
    height: 84,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawText("CONDICIONES DE LA CONSIGNACION", {
    x: 52,
    y: y - 2,
    size: 8.5,
    font: helveticaBold,
    color: cGray,
  });
  const clauseText =
    "Mercancia recibida a entera conformidad en calidad de consignacion para su custodia y comercializacion. Las prendas son propiedad de K-Uniformes hasta su efectiva liquidacion o devolucion en perfecto estado.";
  drawWrappedText(page, helveticaFont, clauseText, 52, y - 18, width - 310, 8, cGray);

  // Black Total Box
  page.drawRectangle({
    x: width - 220,
    y: y - 76,
    width: 180,
    height: 84,
    color: cBlack,
  });
  page.drawText("TOTAL ENTREGADO", { x: width - 205, y: y - 12, size: 8.5, font: helveticaFont, color: cWhite });
  page.drawText(`${data.totalUnits} PIEZAS`, { x: width - 205, y: y - 32, size: 14, font: helveticaBold, color: cWhite });
  page.drawText("TOTAL RENGLONES", { x: width - 205, y: y - 50, size: 8, font: helveticaFont, color: cWhite });
  page.drawText(`${data.items.length} MODELOS / SKUS`, { x: width - 205, y: y - 66, size: 10.5, font: helveticaBold, color: cWhite });

  y -= 96;

  // Signatures Section
  const sigBoxWidth = (width - PAGE_MARGIN_X * 2 - 16) / 2;
  const sigBoxHeight = 74;

  // Box 1: Entregado por (K-Uniformes)
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: y - sigBoxHeight,
    width: sigBoxWidth,
    height: sigBoxHeight,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawLine({
    start: { x: PAGE_MARGIN_X + 20, y: y - 36 },
    end: { x: PAGE_MARGIN_X + sigBoxWidth - 20, y: y - 36 },
    thickness: 0.8,
    color: cGray,
  });
  page.drawText("ENTREGADO POR", {
    x: PAGE_MARGIN_X + 20,
    y: y - 46,
    size: 8,
    font: helveticaBold,
    color: cBlack,
  });
  page.drawText(`${options.brand.name} · Firma autorizada`, {
    x: PAGE_MARGIN_X + 20,
    y: y - 57,
    size: 8,
    font: helveticaFont,
    color: cGray,
  });
  page.drawText(`Fecha: ${data.date}`, {
    x: PAGE_MARGIN_X + 20,
    y: y - 68,
    size: 7.5,
    font: helveticaFont,
    color: cGray,
  });

  // Box 2: Recibido conforme (Consignataria)
  const sigBox2X = PAGE_MARGIN_X + sigBoxWidth + 16;
  page.drawRectangle({
    x: sigBox2X,
    y: y - sigBoxHeight,
    width: sigBoxWidth,
    height: sigBoxHeight,
    color: cPanel,
    borderColor: cBorder,
    borderWidth: 1,
  });
  page.drawLine({
    start: { x: sigBox2X + 20, y: y - 36 },
    end: { x: sigBox2X + sigBoxWidth - 20, y: y - 36 },
    thickness: 0.8,
    color: cGray,
  });
  page.drawText("RECIBIDO CONFORME", {
    x: sigBox2X + 20,
    y: y - 46,
    size: 8,
    font: helveticaBold,
    color: cBlack,
  });
  page.drawText(`${data.consigneeName}`, {
    x: sigBox2X + 20,
    y: y - 57,
    size: 8,
    font: helveticaFont,
    color: cGray,
  });
  page.drawText("C.I. / Firma y Sello Receptor", {
    x: sigBox2X + 20,
    y: y - 68,
    size: 7.5,
    font: helveticaFont,
    color: cGray,
  });

  // Footers
  pages.forEach((currentPage, index) => {
    drawFooter(currentPage, index + 1, pages.length, helveticaFont, options.brand);
  });

  return await pdfDoc.save();
}


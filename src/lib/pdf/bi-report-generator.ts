import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { BiReportData } from "../bi/types";

const usdFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUSD(n: number): string {
  return "$" + usdFmt.format(n);
}

// --- Color Palette (K-Uniformes Design System) ---
const cDarkCharcoal = rgb(16 / 255, 16 / 255, 20 / 255);    // #101014
const cCardDark     = rgb(26 / 255, 26 / 255, 32 / 255);    // #1A1A20
const cGold         = rgb(197 / 255, 160 / 255, 89 / 255);  // #C5A059 (Accent Gold)
const cGoldLight    = rgb(245 / 255, 237 / 255, 219 / 255); // Tint
const cPageBg       = rgb(244 / 255, 243 / 255, 239 / 255); // #F4F3EF
const cWhite        = rgb(1, 1, 1);
const cPanel        = rgb(249 / 255, 248 / 255, 245 / 255);
const cBorder       = rgb(229 / 255, 227 / 255, 220 / 255); // #E5E3DC
const cBorderDark   = rgb(45 / 255, 45 / 255, 54 / 255);
const cTextPrimary  = rgb(21 / 255, 21 / 255, 26 / 255);    // #15151A
const cTextSecondary= rgb(74 / 255, 74 / 255, 69 / 255);    // #4A4A45
const cTextMuted    = rgb(138 / 255, 138 / 255, 130 / 255); // #8A8A82
const cSuccess      = rgb(30 / 255, 122 / 255, 77 / 255);   // #1E7A4D
const cSuccessBg    = rgb(232 / 255, 243 / 255, 237 / 255);
const cWarning      = rgb(176 / 255, 122 / 255, 26 / 255);  // #B07A1A
const cWarningBg    = rgb(251 / 255, 241 / 255, 224 / 255);
const cDanger       = rgb(194 / 255, 57 / 255, 46 / 255);   // #C2392E
const cDangerBg     = rgb(251 / 255, 234 / 255, 232 / 255);
const cInfo         = rgb(42 / 255, 91 / 255, 138 / 255);   // #2A5B8A
const cInfoBg       = rgb(230 / 255, 238 / 255, 247 / 255);

const PAGE_MARGIN_X = 36;
const PAGE_TOP = 36;
const PAGE_BOTTOM = 36;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2; // 540pt

// WinAnsi text replacements to prevent pdf-lib encoding crash
const TEXT_REPLACEMENTS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-", "‒": "-", "−": "-",
  "…": "...", "•": "-", " ": " ",
  "→": "->", "←": "<-", "↔": "<->",
  "€": "EUR", "™": "(TM)", "®": "(R)", "©": "(C)",
  "·": "-", "★": "*", "▲": "^", "▼": "v"
};

export function cleanText(val: string | null | undefined): string {
  if (!val) return "";
  let out = "";
  for (const ch of String(val)) {
    if (TEXT_REPLACEMENTS[ch] !== undefined) {
      out += TEXT_REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    // WinAnsi safe: Tab, newline, ASCII printable, and Latin-1 supplement (including á, é, í, ó, ú, ñ, etc.)
    if (code === 9 || code === 10 || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
    }
  }
  return out;
}

export function hexToRgb(hex: string) {
  const h = (hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return cTextMuted;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface BiPdfOptions {
  brandName?: string;
  rif?: string;
  logoBytes?: Uint8Array | null;
  pdfLib?: any;
}

export async function generateBusinessIntelligencePdf(
  data: BiReportData,
  options?: BiPdfOptions
): Promise<Uint8Array> {
  const lib = options?.pdfLib || { PDFDocument, rgb, StandardFonts };
  const docCreate = lib.PDFDocument;
  const rgbCol = lib.rgb || rgb;
  const stdFonts = lib.StandardFonts || StandardFonts;

  const pdfDoc = await docCreate.create();

  const fontRegular = await pdfDoc.embedFont(stdFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(stdFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(stdFonts.Courier);
  const fontMonoBold = await pdfDoc.embedFont(stdFonts.CourierBold);

  let embeddedLogo: PDFImage | null = null;
  if (options?.logoBytes && options.logoBytes.length > 0) {
    try {
      embeddedLogo = await pdfDoc.embedJpg(options.logoBytes);
    } catch {
      try {
        embeddedLogo = await pdfDoc.embedPng(options.logoBytes);
      } catch (err) {
        console.warn("Could not embed logo image in PDF:", err);
      }
    }
  }

  const brandName = cleanText(options?.brandName || "K-Uniformes");
  const rifText = cleanText(options?.rif || "J-50468923-1");
  const totalPages = 7;

  // Helper: Draw standard page header for Pages 2 to 7
  const drawPageHeader = (page: PDFPage, sectionNumber: string, sectionTitle: string, pageNumber: number) => {
    const yTop = PAGE_HEIGHT - PAGE_TOP;

    // Header strip line
    page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: yTop - 2,
      width: CONTENT_WIDTH,
      height: 2,
      color: cGold,
    });

    // Brand and logo box
    let titleX = PAGE_MARGIN_X;
    if (embeddedLogo) {
      page.drawImage(embeddedLogo, {
        x: PAGE_MARGIN_X,
        y: yTop - 32,
        width: 30,
        height: 30,
      });
      titleX += 38;
    }

    page.drawText(`${brandName.toUpperCase()} · INTELIGENCIA COMERCIAL`, {
      x: titleX,
      y: yTop - 14,
      size: 7.5,
      font: fontBold,
      color: cGold,
    });

    page.drawText(cleanText(`${sectionNumber} · ${sectionTitle}`), {
      x: titleX,
      y: yTop - 28,
      size: 11,
      font: fontBold,
      color: cDarkCharcoal,
    });

    // Right side: date & tag
    const dateLabel = `Corte: ${data.periodEnd} | Pág. ${pageNumber} de ${totalPages}`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateLabel, 7.5);
    page.drawText(dateLabel, {
      x: PAGE_WIDTH - PAGE_MARGIN_X - dateWidth,
      y: yTop - 18,
      size: 7.5,
      font: fontRegular,
      color: cTextMuted,
    });

    // Separator line under header
    page.drawLine({
      start: { x: PAGE_MARGIN_X, y: yTop - 38 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: yTop - 38 },
      thickness: 0.5,
      color: cBorder,
    });

    return yTop - 48; // starting Y for page content
  };

  // Helper: Draw standard page footer
  const drawPageFooter = (page: PDFPage, pageNumber: number) => {
    const yFoot = PAGE_BOTTOM + 8;
    page.drawLine({
      start: { x: PAGE_MARGIN_X, y: yFoot + 12 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: yFoot + 12 },
      thickness: 0.5,
      color: cBorder,
    });

    const leftFoot = `${brandName} · RIF ${rifText} · Documento Ejecutivo Confidencial`;
    page.drawText(cleanText(leftFoot), {
      x: PAGE_MARGIN_X,
      y: yFoot,
      size: 7,
      font: fontRegular,
      color: cTextMuted,
    });

    const rightFoot = `Página ${pageNumber} de ${totalPages}`;
    const rfWidth = fontBold.widthOfTextAtSize(rightFoot, 7.5);
    page.drawText(rightFoot, {
      x: PAGE_WIDTH - PAGE_MARGIN_X - rfWidth,
      y: yFoot,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });
  };

  // Helper: Draw Card container
  const drawCard = (page: PDFPage, x: number, y: number, w: number, h: number, bg = cWhite, border = cBorder) => {
    page.drawRectangle({
      x,
      y: y - h,
      width: w,
      height: h,
      color: bg,
      borderColor: border,
      borderWidth: 1,
    });
  };

  // =========================================================================
  // PAGE 1: PORTADA EJECUTIVA & RESUMEN DIRECTIVO
  // =========================================================================
  {
    const page1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // Top Dark Hero Header Card
    const heroH = 175;
    page1.drawRectangle({
      x: PAGE_MARGIN_X,
      y: PAGE_HEIGHT - PAGE_TOP - heroH,
      width: CONTENT_WIDTH,
      height: heroH,
      color: cDarkCharcoal,
      borderColor: cBorderDark,
      borderWidth: 1,
    });

    // Gold accent top bar
    page1.drawRectangle({
      x: PAGE_MARGIN_X,
      y: PAGE_HEIGHT - PAGE_TOP - 4,
      width: CONTENT_WIDTH,
      height: 4,
      color: cGold,
    });

    // Logo in white circle or square badge
    if (embeddedLogo) {
      page1.drawRectangle({
        x: PAGE_MARGIN_X + 20,
        y: PAGE_HEIGHT - PAGE_TOP - 80,
        width: 60,
        height: 60,
        color: cWhite,
        borderColor: cGold,
        borderWidth: 1.5,
      });
      page1.drawImage(embeddedLogo, {
        x: PAGE_MARGIN_X + 24,
        y: PAGE_HEIGHT - PAGE_TOP - 76,
        width: 52,
        height: 52,
      });
    }

    const textX = embeddedLogo ? PAGE_MARGIN_X + 96 : PAGE_MARGIN_X + 24;

    page1.drawText("REPORTE DIRECTIVO DE ALTO NIVEL", {
      x: textX,
      y: PAGE_HEIGHT - PAGE_TOP - 28,
      size: 8,
      font: fontBold,
      color: cGold,
    });

    page1.drawText("INFORME DE INTELIGENCIA COMERCIAL", {
      x: textX,
      y: PAGE_HEIGHT - PAGE_TOP - 50,
      size: 16.5,
      font: fontBold,
      color: cWhite,
    });

    page1.drawText("Diagnostico 360*, Desempeno Historico, Salud de Inventario y Modelo Predictivo", {
      x: textX,
      y: PAGE_HEIGHT - PAGE_TOP - 68,
      size: 8.5,
      font: fontRegular,
      color: cPageBg,
    });

    // Hero Meta Badges Row
    const badgeY = PAGE_HEIGHT - PAGE_TOP - 105;
    const badges = [
      `Periodo: ${data.periodStart} al ${data.periodEnd} (${data.totalDays} dias)`,
      `196 Pedidos Validados`,
      `619 Prendas Vendidas`,
      `Dolarizacion Efectiva: 96%`,
    ];

    let curBadgeX = textX;
    for (const b of badges) {
      const bText = cleanText(b);
      const bW = fontRegular.widthOfTextAtSize(bText, 7) + 12;
      page1.drawRectangle({
        x: curBadgeX,
        y: badgeY - 14,
        width: bW,
        height: 16,
        color: cCardDark,
        borderColor: cBorderDark,
        borderWidth: 1,
      });
      page1.drawText(bText, {
        x: curBadgeX + 6,
        y: badgeY - 9,
        size: 7,
        font: fontRegular,
        color: cWhite,
      });
      curBadgeX += bW + 8;
    }

    // Secondary sub-banner inside hero
    page1.drawLine({
      start: { x: PAGE_MARGIN_X + 20, y: PAGE_HEIGHT - PAGE_TOP - 128 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 20, y: PAGE_HEIGHT - PAGE_TOP - 128 },
      thickness: 0.5,
      color: cBorderDark,
    });

    page1.drawText("EMISION:", {
      x: PAGE_MARGIN_X + 24,
      y: PAGE_HEIGHT - PAGE_TOP - 146,
      size: 7,
      font: fontBold,
      color: cGold,
    });
    page1.drawText(`Fecha actual: 02 Octubre 2026 | Sistema ERP/BI K-Uniformes v2.0 | Caracas, Venezuela`, {
      x: PAGE_MARGIN_X + 68,
      y: PAGE_HEIGHT - PAGE_TOP - 146,
      size: 7.5,
      font: fontRegular,
      color: cPageBg,
    });

    // 4 Primary KPI Cards
    const kpiY1 = PAGE_HEIGHT - PAGE_TOP - heroH - 16;
    const cardW = (CONTENT_WIDTH - 24) / 4;
    const cardH = 68;

    const kpiList1 = [
      {
        label: "FACTURACION TOTAL",
        value: formatUSD(data.totalRevenueUsd),
        sub: `Bs ${(data.totalRevenueBs / 1000000).toFixed(2)}M aprox.`,
        tag: `${data.totalOrders} pedidos`,
        color: cDarkCharcoal,
        bg: cWhite,
      },
      {
        label: "MARGEN BRUTO",
        value: `${data.grossMarginPct.toFixed(1)}%`,
        sub: `${formatUSD(data.grossProfitUsd)} utilidad`,
        tag: `COGS: ${formatUSD(data.totalCogs)}`,
        color: cSuccess,
        bg: cSuccessBg,
      },
      {
        label: "UTILIDAD OPERATIVA",
        value: `${data.netMarginPct.toFixed(1)}%`,
        sub: `${formatUSD(data.netOperatingIncomeUsd)} neto`,
        tag: `Gastos: ${formatUSD(data.totalExpensesUsd)}`,
        color: cInfo,
        bg: cInfoBg,
      },
      {
        label: "TICKET PROMEDIO (AOV)",
        value: formatUSD(data.averageOrderValue),
        sub: "+325% crecimiento",
        tag: "De $20 a $85/orden",
        color: cGold,
        bg: cGoldLight,
      },
    ];

    kpiList1.forEach((kpi, idx) => {
      const cx = PAGE_MARGIN_X + idx * (cardW + 8);
      drawCard(page1, cx, kpiY1, cardW, cardH, kpi.bg, cBorder);

      page1.drawText(kpi.label, {
        x: cx + 10,
        y: kpiY1 - 14,
        size: 6.5,
        font: fontBold,
        color: cTextSecondary,
      });

      page1.drawText(kpi.value, {
        x: cx + 10,
        y: kpiY1 - 34,
        size: 13,
        font: fontBold,
        color: kpi.color,
      });

      page1.drawText(cleanText(kpi.sub), {
        x: cx + 10,
        y: kpiY1 - 48,
        size: 6.8,
        font: fontBold,
        color: cTextPrimary,
      });

      page1.drawText(cleanText(kpi.tag), {
        x: cx + 10,
        y: kpiY1 - 60,
        size: 6.2,
        font: fontRegular,
        color: cTextMuted,
      });
    });

    // 4 Secondary Inventory & Health KPI Cards
    const kpiY2 = kpiY1 - cardH - 10;
    const kpiList2 = [
      {
        label: "STOCK EN ALMACEN",
        value: `${data.totalStockUnits.toLocaleString()} u.`,
        sub: `${formatUSD(data.inventoryValuationCost)} al costo`,
        tag: `${data.totalSkus} SKUs totales`,
        color: cDarkCharcoal,
        bg: cWhite,
      },
      {
        label: "VALOR AL DETAL",
        value: formatUSD(data.inventoryValuationRetail),
        sub: `${formatUSD(data.potentialStockGrossProfit)} margen pot.`,
        tag: "65.3% margen proyectado",
        color: cDarkCharcoal,
        bg: cWhite,
      },
      {
        label: "RUPTURAS DE STOCK",
        value: `${data.outOfStockSkusCount} SKUs (18%)`,
        sub: "Top sellers M y S agotados",
        tag: "Demanda insatisfecha",
        color: cDanger,
        bg: cDangerBg,
      },
      {
        label: "CAPITAL DORMIDO",
        value: `${data.deadStockSkusCount} SKUs (41%)`,
        sub: `~${formatUSD(data.deadStockEstimatedCapital)} atrapados`,
        tag: `${data.deadStockUnits} u. sin ventas`,
        color: cWarning,
        bg: cWarningBg,
      },
    ];

    kpiList2.forEach((kpi, idx) => {
      const cx = PAGE_MARGIN_X + idx * (cardW + 8);
      drawCard(page1, cx, kpiY2, cardW, cardH, kpi.bg, cBorder);

      page1.drawText(kpi.label, {
        x: cx + 10,
        y: kpiY2 - 14,
        size: 6.5,
        font: fontBold,
        color: cTextSecondary,
      });

      page1.drawText(kpi.value, {
        x: cx + 10,
        y: kpiY2 - 34,
        size: 11.5,
        font: fontBold,
        color: kpi.color,
      });

      page1.drawText(cleanText(kpi.sub), {
        x: cx + 10,
        y: kpiY2 - 48,
        size: 6.8,
        font: fontBold,
        color: cTextPrimary,
      });

      page1.drawText(cleanText(kpi.tag), {
        x: cx + 10,
        y: kpiY2 - 60,
        size: 6.2,
        font: fontRegular,
        color: cTextMuted,
      });
    });

    // Executive Diagnostic Summary Block
    const diagY = kpiY2 - cardH - 12;
    const diagH = 202;
    drawCard(page1, PAGE_MARGIN_X, diagY, CONTENT_WIDTH, diagH, cWhite, cBorder);

    // Diagnostic Header inside card
    page1.drawRectangle({
      x: PAGE_MARGIN_X,
      y: diagY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });

    page1.drawText("RESUMEN EJECUTIVO & HALLAZGOS DIRECTIVOS CLAVE (TAKEAWAYS)", {
      x: PAGE_MARGIN_X + 12,
      y: diagY - 16,
      size: 8,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const bulletPoints = [
      {
        num: "1",
        title: "Rentabilidad Sobresaliente y Escalamiento del Ticket Promedio (+325%)",
        desc: "Margen bruto de 68.9% y neto de 53.8% tras gastos ($1,665.90). El ticket promedio escalo de $20 a $85 (+325%), confirmando la traccion de ventas de conjuntos completos.",
        color: cSuccess,
      },
      {
        num: "2",
        title: "Concentracion de Pareto: El 11.2% de SKUs genera el 80% de la Facturacion",
        desc: "54 de 482 SKUs generan el 80% de ingresos. El Conjunto Cuello V Dama (42168) lidera con 248 prendas y $4,960 (44.7%), secundado por Mao (42015) y Caballero (42019).",
        color: cDarkCharcoal,
      },
      {
        num: "3",
        title: "Alerta Critica: Ruptura de Stock en Tallas Lideres (M y S en Negro, Blanco y Azul Rey)",
        desc: "Tallas M y S concentran el 53.4% de la demanda, pero los 4 SKUs mas vendidos estan en stock CERO, generando un costo de oportunidad de $1,500+ mensuales.",
        color: cDanger,
      },
      {
        num: "4",
        title: "Capital Inmovilizado en Dead Stock (~$8,100 USD) y Riesgo en Consignaciones",
        desc: "199 SKUs tienen unidades fisicas sin ventas desde junio. En consignacion, de 113 prendas entregadas en 16 lotes, 109 continuan en calle sin liquidar (96.5%).",
        color: cWarning,
      },
    ];

    let bpY = diagY - 36;
    for (const bp of bulletPoints) {
      // Circle number
      page1.drawRectangle({
        x: PAGE_MARGIN_X + 12,
        y: bpY - 11,
        width: 13,
        height: 13,
        color: bp.color,
      });
      page1.drawText(bp.num, {
        x: PAGE_MARGIN_X + 16,
        y: bpY - 8,
        size: 7.5,
        font: fontBold,
        color: cWhite,
      });

      page1.drawText(cleanText(bp.title), {
        x: PAGE_MARGIN_X + 32,
        y: bpY - 7,
        size: 7.8,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page1.drawText(cleanText(bp.desc), {
        x: PAGE_MARGIN_X + 32,
        y: bpY - 18,
        size: 6.8,
        font: fontRegular,
        color: cTextSecondary,
        maxWidth: CONTENT_WIDTH - 46,
        lineHeight: 8.5,
      });

      bpY -= 42;
    }

    // Structure of the Document Guide Box at bottom of Page 1
    const guideY = diagY - diagH - 8;
    const guideH = 44;
    drawCard(page1, PAGE_MARGIN_X, guideY, CONTENT_WIDTH, guideH, cPanel, cBorder);

    page1.drawText("ESTRUCTURA DEL INFORME", {
      x: PAGE_MARGIN_X + 12,
      y: guideY - 13,
      size: 7,
      font: fontBold,
      color: cGold,
    });

    const indexItems = [
      "Cap. 01: Radiografia Financiera & Ventas",
      "Cap. 02: Productos, Modelos & Pareto",
      "Cap. 03: Tallas & Carta Cromatica",
      "Cap. 04: Inventario, Rupturas & Dead Stock",
      "Cap. 05: Clientes, Segmentacion & RFM",
      "Cap. 06: Consignaciones & Plan de Accion",
    ];

    indexItems.forEach((item, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      page1.drawText(cleanText(item), {
        x: PAGE_MARGIN_X + 12 + col * 174,
        y: guideY - 26 - row * 11,
        size: 6.5,
        font: fontRegular,
        color: cTextPrimary,
      });
    });

    drawPageFooter(page1, 1);
  }

  // =========================================================================
  // PAGE 2: RADIOGRAFÍA FINANCIERA & DINÁMICA DE VENTAS
  // =========================================================================
  {
    const page2 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let curY = drawPageHeader(page2, "CAPITULO 01", "RADIOGRAFIA FINANCIERA, DINAMICA DE VENTAS & RIELES DE PAGO", 2);

    // Section 1: Monthly Evolution Table
    drawCard(page2, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 175, cWhite, cBorder);

    page2.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });

    page2.drawText("HISTORIAL MENSUAL DE FACTURACION, VOLUMEN Y RENTABILIDAD", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cDarkCharcoal,
    });

    // Table Header
    const colX = [
      PAGE_MARGIN_X + 12,  // Mes
      PAGE_MARGIN_X + 110, // Pedidos
      PAGE_MARGIN_X + 160, // Ventas USD
      PAGE_MARGIN_X + 230, // Unidades
      PAGE_MARGIN_X + 285, // Ticket Prom.
      PAGE_MARGIN_X + 355, // COGS (Costo)
      PAGE_MARGIN_X + 420, // Utilidad Bruta
      PAGE_MARGIN_X + 485, // Margen %
    ];

    const tHeaderY = curY - 36;
    const headers = ["Periodo", "Ordenes", "Ventas USD", "Prendas", "Ticket AOV", "COGS Costo", "Utilidad", "Margen %"];
    headers.forEach((h, i) => {
      page2.drawText(h, {
        x: colX[i],
        y: tHeaderY,
        size: 7,
        font: fontBold,
        color: cTextSecondary,
      });
    });

    page2.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: tHeaderY - 6 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: tHeaderY - 6 },
      thickness: 0.5,
      color: cBorder,
    });

    let rowY = tHeaderY - 18;
    data.monthlyEvolution.forEach((m, idx) => {
      const isZebra = idx % 2 === 1;
      if (isZebra) {
        page2.drawRectangle({
          x: PAGE_MARGIN_X + 1,
          y: rowY - 4,
          width: CONTENT_WIDTH - 2,
          height: 16,
          color: cPanel,
        });
      }

      page2.drawText(cleanText(m.monthName), { x: colX[0], y: rowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page2.drawText(String(m.orders), { x: colX[1], y: rowY, size: 7.5, font: fontRegular, color: cTextPrimary });
      page2.drawText(formatUSD(m.revenueUsd), { x: colX[2], y: rowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page2.drawText(`${m.units} u.`, { x: colX[3], y: rowY, size: 7.5, font: fontRegular, color: cTextPrimary });
      page2.drawText(formatUSD(m.aov), { x: colX[4], y: rowY, size: 7.5, font: fontBold, color: cGold });
      page2.drawText(formatUSD(m.cogs), { x: colX[5], y: rowY, size: 7.5, font: fontRegular, color: cTextMuted });
      page2.drawText(formatUSD(m.grossProfit), { x: colX[6], y: rowY, size: 7.5, font: fontBold, color: cSuccess });
      page2.drawText(`${m.grossMarginPct.toFixed(1)}%`, { x: colX[7], y: rowY, size: 7.5, font: fontBold, color: cSuccess });

      // Visual progress bar of revenue
      const maxRev = 4000;
      const barW = Math.min(60, (m.revenueUsd / maxRev) * 60);
      page2.drawRectangle({
        x: colX[2] + 46,
        y: rowY + 1,
        width: barW,
        height: 6,
        color: cGold,
      });

      rowY -= 17;
    });

    // Total Row
    page2.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: rowY + 4 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: rowY + 4 },
      thickness: 1,
      color: cBorder,
    });
    page2.drawText("TOTAL / PROMEDIO", { x: colX[0], y: rowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page2.drawText(String(data.totalOrders), { x: colX[1], y: rowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page2.drawText(formatUSD(data.totalRevenueUsd), { x: colX[2], y: rowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page2.drawText(`${data.totalUnitsSold} u.`, { x: colX[3], y: rowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page2.drawText(formatUSD(data.averageOrderValue), { x: colX[4], y: rowY - 6, size: 7.5, font: fontBold, color: cGold });
    page2.drawText(formatUSD(data.totalCogs), { x: colX[5], y: rowY - 6, size: 7.5, font: fontBold, color: cTextMuted });
    page2.drawText(formatUSD(data.grossProfitUsd), { x: colX[6], y: rowY - 6, size: 7.5, font: fontBold, color: cSuccess });
    page2.drawText(`${data.grossMarginPct.toFixed(1)}%`, { x: colX[7], y: rowY - 6, size: 7.5, font: fontBold, color: cSuccess });

    curY -= 190;

    // Section 2: Day of Week Distribution (2-column layout)
    const midW = (CONTENT_WIDTH - 12) / 2;
    drawCard(page2, PAGE_MARGIN_X, curY, midW, 205, cWhite, cBorder);

    page2.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page2.drawText("ESTACIONALIDAD: VENTAS POR DIA DE LA SEMANA", {
      x: PAGE_MARGIN_X + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    let dowY = curY - 42;
    const maxDowRev = 3100;
    data.dayOfWeekDistribution.forEach(d => {
      const isPeak = d.dayName === "Martes" || d.dayName === "Jueves";
      page2.drawText(d.dayName, {
        x: PAGE_MARGIN_X + 12,
        y: dowY,
        size: 7.5,
        font: isPeak ? fontBold : fontRegular,
        color: isPeak ? cDarkCharcoal : cTextSecondary,
      });

      page2.drawText(`${d.orders} ped.`, {
        x: PAGE_MARGIN_X + 70,
        y: dowY,
        size: 7,
        font: fontRegular,
        color: cTextMuted,
      });

      page2.drawText(formatUSD(d.revenueUsd), {
        x: PAGE_MARGIN_X + 115,
        y: dowY,
        size: 7.5,
        font: fontBold,
        color: isPeak ? cSuccess : cDarkCharcoal,
      });

      page2.drawText(`${d.pctRevenue.toFixed(1)}%`, {
        x: PAGE_MARGIN_X + 165,
        y: dowY,
        size: 7,
        font: fontRegular,
        color: cTextSecondary,
      });

      // Bar
      const barLen = Math.max(2, (d.revenueUsd / maxDowRev) * 75);
      page2.drawRectangle({
        x: PAGE_MARGIN_X + 195,
        y: dowY - 1,
        width: barLen,
        height: 8,
        color: isPeak ? cSuccess : cGold,
      });

      dowY -= 17;
    });

    page2.drawText("Nota estrategica: Martes y Jueves concentran el 49.7% de los ingresos.", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 188,
      size: 6.8,
      font: fontBold,
      color: cTextSecondary,
    });

    // Right Column: Payment Rails & Dollarization
    const rightX = PAGE_MARGIN_X + midW + 12;
    drawCard(page2, rightX, curY, midW, 205, cWhite, cBorder);

    page2.drawRectangle({
      x: rightX,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page2.drawText("RIELES DE PAGO & DOLARIZACION EFECTIVA", {
      x: rightX + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    let payY = curY - 42;
    data.paymentMethods.forEach(p => {
      page2.drawText(cleanText(p.name), {
        x: rightX + 12,
        y: payY,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page2.drawText(`${p.transactions} tx`, {
        x: rightX + 85,
        y: payY,
        size: 7,
        font: fontRegular,
        color: cTextMuted,
      });

      page2.drawText(formatUSD(p.amountUsd), {
        x: rightX + 125,
        y: payY,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page2.drawText(`${p.sharePct.toFixed(1)}%`, {
        x: rightX + 175,
        y: payY,
        size: 7.5,
        font: fontBold,
        color: p.sharePct > 50 ? cSuccess : cGold,
      });

      // Visual bar
      const barLen = Math.max(2, (p.sharePct / 100) * 65);
      page2.drawRectangle({
        x: rightX + 205,
        y: payY - 1,
        width: barLen,
        height: 8,
        color: p.name.includes("Binance") ? cGold : p.name.includes("Zelle") ? cInfo : cSuccess,
      });

      payY -= 20;
    });

    // Dollarization conclusion box
    page2.drawRectangle({
      x: rightX + 8,
      y: curY - 195,
      width: midW - 16,
      height: 38,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });

    page2.drawText("BLINDAJE MONETARIO: 96% DOLARIZADO", {
      x: rightX + 14,
      y: curY - 170,
      size: 7,
      font: fontBold,
      color: cSuccess,
    });
    page2.drawText("El 67.9% en Binance USDT y 15.9% en Zelle otorgan liquidez inmediata para compras internacionales con nula exposicion a la devaluacion del bolivar.", {
      x: rightX + 14,
      y: curY - 182,
      size: 6.2,
      font: fontRegular,
      color: cTextSecondary,
      maxWidth: midW - 28,
    });

    curY -= 220;

    // Bottom Analytical Callout
    drawCard(page2, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 75, cGoldLight, cGold);
    page2.drawText("ANALISIS DE TENDENCIA FINANCIERA & SOSTENIBILIDAD", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 7.8,
      font: fontBold,
      color: cGold,
    });
    const finTakeaways = [
      "* Expansión del Ticket Promedio: De $20.00 en fase piloto a $62.64 en septiembre y $85.00 en octubre (+325%). Esto indica que los clientes estan adquiriendo conjuntos completos, combos o dotaciones multiples en lugar de piezas individuales.",
      "* Eficiencia Operativa: Con $11,100 en ingresos y solo $1,665.90 de gastos operativos, el negocio retiene 53.8 centavos de cada dolar vendido como utilidad neta libre para reinversion y crecimiento.",
    ];
    finTakeaways.forEach((t, i) => {
      page2.drawText(cleanText(t), {
        x: PAGE_MARGIN_X + 12,
        y: curY - 32 - i * 18,
        size: 7,
        font: fontRegular,
        color: cTextPrimary,
        maxWidth: CONTENT_WIDTH - 24,
      });
    });

    drawPageFooter(page2, 2);
  }

  // =========================================================================
  // PAGE 3: RENDIMIENTO DE PRODUCTO, MODELOS & PARETO
  // =========================================================================
  {
    const page3 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let curY = drawPageHeader(page3, "CAPITULO 02", "PORTAFOLIO DE PRODUCTOS, MODELOS Y CURVA DE PARETO", 3);

    // Section 1: Top Models Table
    const tableH = 220;
    drawCard(page3, PAGE_MARGIN_X, curY, CONTENT_WIDTH, tableH, cWhite, cBorder);

    page3.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });

    page3.drawText("RANKING DE MODELOS POR VENTAS, VOLUMEN, STOCK Y MARGEN BRUTO", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const mColX = [
      PAGE_MARGIN_X + 10,  // Codigo
      PAGE_MARGIN_X + 55,  // Nombre Modelo
      PAGE_MARGIN_X + 225, // Categoria / Genero
      PAGE_MARGIN_X + 315, // Unidades
      PAGE_MARGIN_X + 365, // Ventas USD
      PAGE_MARGIN_X + 430, // % Venta
      PAGE_MARGIN_X + 475, // Stock Actual
    ];

    const mHeadY = curY - 36;
    ["Cod.", "Modelo / Descripcion", "Categoria / Genero", "Unidades", "Ventas USD", "% Share", "Stock Actual"].forEach((h, i) => {
      page3.drawText(h, { x: mColX[i], y: mHeadY, size: 7, font: fontBold, color: cTextSecondary });
    });

    page3.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: mHeadY - 6 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: mHeadY - 6 },
      thickness: 0.5,
      color: cBorder,
    });

    let mRowY = mHeadY - 18;
    data.topModels.slice(0, 8).forEach((m, idx) => {
      const isZebra = idx % 2 === 1;
      if (isZebra) {
        page3.drawRectangle({
          x: PAGE_MARGIN_X + 1,
          y: mRowY - 4,
          width: CONTENT_WIDTH - 2,
          height: 18,
          color: cPanel,
        });
      }

      page3.drawText(m.modelId, { x: mColX[0], y: mRowY, size: 7.5, font: fontMonoBold, color: cDarkCharcoal });
      page3.drawText(cleanText(m.name), { x: mColX[1], y: mRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page3.drawText(cleanText(`${m.category} (${m.gender})`), { x: mColX[2], y: mRowY, size: 7, font: fontRegular, color: cTextSecondary });
      page3.drawText(`${m.unitsSold} u.`, { x: mColX[3], y: mRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page3.drawText(formatUSD(m.revenueUsd), { x: mColX[4], y: mRowY, size: 7.5, font: fontBold, color: cSuccess });
      page3.drawText(`${m.revenueSharePct.toFixed(1)}%`, { x: mColX[5], y: mRowY, size: 7.5, font: fontBold, color: m.revenueSharePct > 20 ? cGold : cTextPrimary });

      const isStockLow = m.currentStock < 30;
      page3.drawText(`${m.currentStock} u.`, {
        x: mColX[6],
        y: mRowY,
        size: 7.5,
        font: fontBold,
        color: isStockLow ? cDanger : cTextPrimary,
      });

      mRowY -= 19;
    });

    curY -= tableH + 15;

    // Section 2: Pareto 80/20 & Gender Distribution (2 columns)
    const midW = (CONTENT_WIDTH - 12) / 2;

    // Left: Pareto 80/20 Deep Dive
    drawCard(page3, PAGE_MARGIN_X, curY, midW, 195, cWhite, cBorder);
    page3.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page3.drawText("PRINCIPIO DE PARETO (REGLA 80/20)", {
      x: PAGE_MARGIN_X + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    page3.drawRectangle({
      x: PAGE_MARGIN_X + 12,
      y: curY - 64,
      width: midW - 24,
      height: 34,
      color: cGoldLight,
      borderColor: cGold,
      borderWidth: 1,
    });
    page3.drawText("54 SKUs GENERAN EL 80% DE INGRESOS", {
      x: PAGE_MARGIN_X + 18,
      y: curY - 44,
      size: 8.5,
      font: fontBold,
      color: cGold,
    });
    page3.drawText(`11.2% de las referencias explica 4 de cada 5 dolares vendidos.`, {
      x: PAGE_MARGIN_X + 18,
      y: curY - 56,
      size: 6.5,
      font: fontRegular,
      color: cTextPrimary,
    });

    const paretoPoints = [
      "Modelo 42168 (Cuello V Dama): 44.7% de facturacion ($4,960).",
      "Top 3 Modelos (42168, 42015, 42019): 68.0% de ventas totales.",
      "Gorros (22S): 97 u. vendidas como producto gancho de combos.",
      "Cola Larga (428 SKUs): Solo 20% venta y alto costo de stock.",
    ];

    let parY = curY - 78;
    paretoPoints.forEach(p => {
      page3.drawText("-", { x: PAGE_MARGIN_X + 14, y: parY, size: 7.5, font: fontBold, color: cGold });
      page3.drawText(cleanText(p), {
        x: PAGE_MARGIN_X + 24,
        y: parY,
        size: 7,
        font: fontRegular,
        color: cTextSecondary,
      });
      parY -= 24;
    });

    // Right: Gender & Category Split
    const rightX = PAGE_MARGIN_X + midW + 12;
    drawCard(page3, rightX, curY, midW, 195, cWhite, cBorder);
    page3.drawRectangle({
      x: rightX,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page3.drawText("DISTRIBUCION POR SEGMENTO & GENERO", {
      x: rightX + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const segments = [
      { name: "Uniformes Dama", rev: 8610, share: 77.6, units: 444, color: cDarkCharcoal },
      { name: "Uniformes Caballero", rev: 1240, share: 11.2, units: 62, color: cGold },
      { name: "Gorros / Unisex", rev: 1250, share: 11.2, units: 113, color: cInfo },
    ];

    let segY = curY - 45;
    segments.forEach(s => {
      page3.drawText(s.name, { x: rightX + 12, y: segY, size: 8, font: fontBold, color: cDarkCharcoal });
      page3.drawText(`${formatUSD(s.rev)} (${s.share}%) · ${s.units} prendas`, {
        x: rightX + 12,
        y: segY - 11,
        size: 7,
        font: fontRegular,
        color: cTextSecondary,
      });

      // Bar
      page3.drawRectangle({
        x: rightX + 12,
        y: segY - 19,
        width: (s.share / 100) * (midW - 24),
        height: 6,
        color: s.color,
      });

      segY -= 32;
    });

    page3.drawRectangle({
      x: rightX + 12,
      y: curY - 182,
      width: midW - 24,
      height: 38,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page3.drawText("OPORTUNIDAD EN EL SEGMENTO CABALLERO", {
      x: rightX + 18,
      y: curY - 158,
      size: 7,
      font: fontBold,
      color: cGold,
    });
    page3.drawText("Con un solo modelo masculino (42019), la marca capto $1,240 USD. Ampliar la linea masculina con 1 corte adicional podria duplicar este segmento sin canibalizar dama.", {
      x: rightX + 18,
      y: curY - 170,
      size: 6.2,
      font: fontRegular,
      color: cTextSecondary,
      maxWidth: midW - 36,
    });

    curY -= 210;

    // Bottom Strategy Note
    drawCard(page3, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 65, cPanel, cBorder);
    page3.drawText("RECOMENDACION DIRECTIVA DE MATRIZ DE PRODUCTO", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });
    page3.drawText("Concentrar el 75% del presupuesto de corte y confeccion en los modelos 42168, 42015 y 42019. Establecer un stock minimo de seguridad de 50 unidades por modelo lider para evitar quiebres de inventario prolongados.", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 30,
      size: 7,
      font: fontRegular,
      color: cTextSecondary,
      maxWidth: CONTENT_WIDTH - 24,
    });

    drawPageFooter(page3, 3);
  }

  // =========================================================================
  // PAGE 4: DINÁMICA DE TALLAS & CARTA CROMÁTICA
  // =========================================================================
  {
    const page4 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let curY = drawPageHeader(page4, "CAPITULO 03", "DINAMICA DE TALLAS, CURVA DE DEMANDA & CARTA CROMATICA", 4);

    // 2-column layout: Size curve on Left, Top Colors on Right
    const midW = (CONTENT_WIDTH - 12) / 2;

    // Left Column: Size Curve
    drawCard(page4, PAGE_MARGIN_X, curY, midW, 255, cWhite, cBorder);
    page4.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page4.drawText("CURVA REAL DE DEMANDA POR TALLAS", {
      x: PAGE_MARGIN_X + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    let szY = curY - 42;
    const maxSzUnits = 160;
    data.sizeDistribution.forEach(sz => {
      const isCore = sz.sizeName === "M" || sz.sizeName === "S";
      page4.drawText(cleanText(sz.sizeName), {
        x: PAGE_MARGIN_X + 12,
        y: szY,
        size: 8,
        font: fontBold,
        color: isCore ? cSuccess : cDarkCharcoal,
      });

      page4.drawText(`${sz.unitsSold} u.`, {
        x: PAGE_MARGIN_X + 68,
        y: szY,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page4.drawText(formatUSD(sz.revenueUsd), {
        x: PAGE_MARGIN_X + 110,
        y: szY,
        size: 7.5,
        font: fontRegular,
        color: cTextSecondary,
      });

      page4.drawText(`${sz.sharePct.toFixed(1)}%`, {
        x: PAGE_MARGIN_X + 160,
        y: szY,
        size: 7.5,
        font: fontBold,
        color: isCore ? cSuccess : cGold,
      });

      // Visual Bar
      const barLen = Math.max(3, (sz.unitsSold / maxSzUnits) * 75);
      page4.drawRectangle({
        x: PAGE_MARGIN_X + 185,
        y: szY - 1,
        width: barLen,
        height: 8,
        color: isCore ? cSuccess : cGold,
      });

      szY -= 20;
    });

    // Recommended Size Ratio Box
    page4.drawRectangle({
      x: PAGE_MARGIN_X + 8,
      y: curY - 250,
      width: midW - 16,
      height: 52,
      color: cGoldLight,
      borderColor: cGold,
      borderWidth: 1,
    });
    page4.drawText("CURVA OPTIMA DE CORTE (RATIO DE CONFECCION)", {
      x: PAGE_MARGIN_X + 14,
      y: curY - 208,
      size: 7.2,
      font: fontBold,
      color: cGold,
    });
    page4.drawText("Ratio recomendado por cada 100 prendas: 30 M, 28 S, 18 L, 12 XS, 8 XL y 4 2XL. Sigue fielmente la velocidad real de demanda historica.", {
      x: PAGE_MARGIN_X + 14,
      y: curY - 220,
      size: 6.5,
      font: fontRegular,
      color: cTextPrimary,
      maxWidth: midW - 28,
      lineHeight: 8.5,
    });

    // Right Column: Top Colors
    const rightX = PAGE_MARGIN_X + midW + 12;
    drawCard(page4, rightX, curY, midW, 255, cWhite, cBorder);
    page4.drawRectangle({
      x: rightX,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page4.drawText("TOP 10 COLORES MAS VENDIDOS (DE 143)", {
      x: rightX + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    let colY = curY - 42;
    const maxColUnits = 90;
    data.topColors.slice(0, 10).forEach(c => {
      // Swatch
      page4.drawRectangle({
        x: rightX + 12,
        y: colY - 2,
        width: 10,
        height: 10,
        color: hexToRgb(c.hex),
        borderColor: cBorder,
        borderWidth: 0.5,
      });

      page4.drawText(c.code, {
        x: rightX + 27,
        y: colY,
        size: 7,
        font: fontMonoBold,
        color: cTextSecondary,
      });

      page4.drawText(cleanText(c.name), {
        x: rightX + 54,
        y: colY,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page4.drawText(`${c.unitsSold} u.`, {
        x: rightX + 142,
        y: colY,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page4.drawText(`${c.sharePct.toFixed(1)}%`, {
        x: rightX + 172,
        y: colY,
        size: 7,
        font: fontRegular,
        color: cTextSecondary,
      });

      // Bar
      const barLen = Math.max(2, (c.unitsSold / maxColUnits) * 65);
      page4.drawRectangle({
        x: rightX + 195,
        y: colY - 1,
        width: barLen,
        height: 8,
        color: hexToRgb(c.hex),
      });

      colY -= 19;
    });

    curY -= 270;

    // Detailed Section: Color Palette Dispersion Analysis
    drawCard(page4, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 140, cWhite, cBorder);
    page4.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page4.drawText("DIAGNOSTICO DE DISPERSION CROMATICA & COLA LARGA (LONG TAIL)", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const colorDiagCols = [
      {
        title: "Top 3 Colores Nucleares (54.5%)",
        desc: "Negro (Z21) con 85 u, Azul Rey (Z22) con 55 u y Blanco (Z14) con 30 u concentran mas de la mitad de las prendas vendidas. Son indispensables en cualquier reposicion.",
        badge: "ALTA ROTACION",
        bg: cSuccessBg,
        col: cSuccess,
      },
      {
        title: "Colores Secundarios de Moda (26.3%)",
        desc: "Marron Claro (Z1), Rojo (Z40), Lila (Z15), Morado (Z20), Celeste (Z2), Marino (Z9) y Verde Oliva (Z16). Ofrecen variedad cromatica para personal medico particular.",
        badge: "ROTACION MEDIA",
        bg: cGoldLight,
        col: cGold,
      },
      {
        title: "Cola Larga Dispersa: 120+ Colores (19.2%)",
        desc: "120 colores registran 0 o 1 venta en 3.5 meses. Mantener stock confeccionado de estos tonos dispersa el capital y genera altos costos de flete de tela importada.",
        badge: "BAJA ROTACION / RIESGO",
        bg: cDangerBg,
        col: cDanger,
      },
    ];

    const colDiagW = (CONTENT_WIDTH - 24) / 3;
    let cdX = PAGE_MARGIN_X + 8;
    colorDiagCols.forEach(col => {
      drawCard(page4, cdX, curY - 32, colDiagW, 98, col.bg, cBorder);

      page4.drawText(cleanText(col.title), {
        x: cdX + 8,
        y: curY - 44,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page4.drawText(col.badge, {
        x: cdX + 8,
        y: curY - 56,
        size: 6.2,
        font: fontBold,
        color: col.col,
      });

      page4.drawText(cleanText(col.desc), {
        x: cdX + 8,
        y: curY - 68,
        size: 6.5,
        font: fontRegular,
        color: cTextSecondary,
        maxWidth: colDiagW - 16,
      });

      cdX += colDiagW + 8;
    });

    curY -= 155;

    // Bottom Directive Recommendation
    drawCard(page4, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 60, cPanel, cBorder);
    page4.drawText("DECISION EJECUTIVA PARA EL CATALOGO DE COLORES", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });
    page4.drawText("Pase a esquema 'Core 15 + Especiales bajo encargo': Mantener existencias fisicas inmediatas unicamente de los 15 colores lideres. El resto de la carta de 143 colores debe comercializarse bajo pedido previo con anticipo del 50%, eliminando el riesgo de tela dormida.", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 28,
      size: 6.8,
      font: fontRegular,
      color: cTextSecondary,
      maxWidth: CONTENT_WIDTH - 24,
    });

    drawPageFooter(page4, 4);
  }

  // =========================================================================
  // PAGE 5: SALUD DE INVENTARIO, RUPTURAS & CAPITAL INMOVILIZADO
  // =========================================================================
  {
    const page5 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let curY = drawPageHeader(page5, "CAPITULO 04", "AUDITORIA DE INVENTARIO, RUPTURAS Y DEAD STOCK", 5);

    // Section 1: Stockout Alerts Table (Top Sellers with 0 stock)
    const stockoutH = 195;
    drawCard(page5, PAGE_MARGIN_X, curY, CONTENT_WIDTH, stockoutH, cWhite, cBorder);

    page5.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cDangerBg,
      borderColor: cDanger,
      borderWidth: 1,
    });

    page5.drawText("ALERTA CRITICA: RUPTURA DE STOCK EN PRODUCTOS LIDERES (AGOTADOS)", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cDanger,
    });

    const soColX = [
      PAGE_MARGIN_X + 10,  // SKU
      PAGE_MARGIN_X + 105, // Modelo
      PAGE_MARGIN_X + 245, // Color
      PAGE_MARGIN_X + 335, // Talla
      PAGE_MARGIN_X + 375, // Vendidas
      PAGE_MARGIN_X + 430, // Stock Actual
      PAGE_MARGIN_X + 490, // Nivel Riesgo
    ];

    const soHeadY = curY - 36;
    ["Codigo SKU", "Modelo", "Color", "Talla", "Ventas", "Stock", "Estado"].forEach((h, i) => {
      page5.drawText(h, { x: soColX[i], y: soHeadY, size: 7, font: fontBold, color: cTextSecondary });
    });

    page5.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: soHeadY - 6 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: soHeadY - 6 },
      thickness: 0.5,
      color: cBorder,
    });

    let soRowY = soHeadY - 18;
    data.stockoutAlerts.slice(0, 7).forEach((s, idx) => {
      const isZebra = idx % 2 === 1;
      if (isZebra) {
        page5.drawRectangle({
          x: PAGE_MARGIN_X + 1,
          y: soRowY - 4,
          width: CONTENT_WIDTH - 2,
          height: 17,
          color: cPanel,
        });
      }

      page5.drawText(s.compositeCode, { x: soColX[0], y: soRowY, size: 7.5, font: fontMonoBold, color: cDarkCharcoal });
      page5.drawText(cleanText(s.modelName), { x: soColX[1], y: soRowY, size: 7, font: fontBold, color: cDarkCharcoal });
      page5.drawText(cleanText(s.colorName), { x: soColX[2], y: soRowY, size: 7, font: fontRegular, color: cTextSecondary });
      page5.drawText(s.sizeName, { x: soColX[3], y: soRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page5.drawText(`${s.unitsSold} u.`, { x: soColX[4], y: soRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });

      const isZero = s.stockLeft === 0;
      page5.drawText(`${s.stockLeft} u.`, {
        x: soColX[5],
        y: soRowY,
        size: 7.5,
        font: fontBold,
        color: isZero ? cDanger : cWarning,
      });

      page5.drawText(isZero ? "AGOTADO" : "CRITICO", {
        x: soColX[6],
        y: soRowY,
        size: 7,
        font: fontBold,
        color: isZero ? cDanger : cWarning,
      });

      soRowY -= 18;
    });

    curY -= stockoutH + 15;

    // Section 2: Dead Stock & Trapped Working Capital Analysis (2 Columns)
    const midW = (CONTENT_WIDTH - 12) / 2;

    // Left: Dead stock breakdown
    drawCard(page5, PAGE_MARGIN_X, curY, midW, 200, cWhite, cBorder);
    page5.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page5.drawText("DIAGNOSTICO DE CAPITAL DORMIDO (DEAD STOCK)", {
      x: PAGE_MARGIN_X + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const deadKpis = [
      { label: "SKUs sin ventas desde junio", val: `${data.deadStockSkusCount} referencias (${data.deadStockPct.toFixed(1)}%)` },
      { label: "Prendas fisicas estancadas", val: `${data.deadStockUnits.toLocaleString()} unidades` },
      { label: "Capital de costo atrapado", val: formatUSD(data.deadStockEstimatedCapital) },
      { label: "Valor de venta potencial detal", val: formatUSD(data.deadStockUnits * 20) },
    ];

    let dkY = curY - 42;
    deadKpis.forEach(k => {
      page5.drawText(k.label, { x: PAGE_MARGIN_X + 12, y: dkY, size: 7, font: fontRegular, color: cTextSecondary });
      page5.drawText(k.val, { x: PAGE_MARGIN_X + 12, y: dkY - 11, size: 8, font: fontBold, color: cWarning });
      dkY -= 26;
    });

    page5.drawRectangle({
      x: PAGE_MARGIN_X + 10,
      y: curY - 192,
      width: midW - 20,
      height: 42,
      color: cWarningBg,
      borderColor: cWarning,
      borderWidth: 1,
    });
    page5.drawText("IMPACTO EN EL FLUJO DE CAJA", {
      x: PAGE_MARGIN_X + 16,
      y: curY - 164,
      size: 7,
      font: fontBold,
      color: cWarning,
    });
    page5.drawText(`Convertir el 50% del inventario dormido inyectaria ~$4,000 USD de flujo inmediato para financiar reposicion de modelos lideres.`, {
      x: PAGE_MARGIN_X + 16,
      y: curY - 176,
      size: 6.2,
      font: fontRegular,
      color: cTextPrimary,
      maxWidth: midW - 32,
      lineHeight: 8.5,
    });

    // Right: Inventory Valuation & Run-rate
    const rightX = PAGE_MARGIN_X + midW + 12;
    drawCard(page5, rightX, curY, midW, 200, cWhite, cBorder);
    page5.drawRectangle({
      x: rightX,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page5.drawText("VALORACION Y VELOCIDAD DE ROTACION (RUN-RATE)", {
      x: rightX + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const runrateKpis = [
      { label: "Valoracion total al costo (COGS)", val: formatUSD(data.inventoryValuationCost) },
      { label: "Valoracion total precio detal", val: formatUSD(data.inventoryValuationRetail) },
      { label: "Margen bruto potencial en almacen", val: `${formatUSD(data.potentialStockGrossProfit)} (65.3%)` },
      { label: "Ritmo de salida promedio mensual", val: `~180 prendas / mes ($3,400 USD)` },
      { label: "Meses de cobertura global de inventario", val: `~13.7 meses de stock teorico` },
    ];

    let rkY = curY - 42;
    runrateKpis.forEach(k => {
      page5.drawText(k.label, { x: rightX + 12, y: rkY, size: 7, font: fontRegular, color: cTextSecondary });
      page5.drawText(k.val, { x: rightX + 12, y: rkY - 11, size: 8, font: fontBold, color: cDarkCharcoal });
      rkY -= 26;
    });

    page5.drawText("El descalce de 13.7 meses evidencia exceso en combinaciones lentas frente al desabastecimiento critico en tallas de alta demanda.", {
      x: rightX + 12,
      y: curY - 178,
      size: 6.2,
      font: fontRegular,
      color: cTextMuted,
      maxWidth: midW - 24,
      lineHeight: 8.5,
    });

    curY -= 215;

    // Bottom Strategy Action
    drawCard(page5, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 60, cPanel, cBorder);
    page5.drawText("PLAN DE DESBLOQUEO DE CAPITAL INMOVILIZADO", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });
    page5.drawText("Implementar promocion 'Combo Medico Total': Por la compra de cualquier scrub de rotacion regular, otorgar una prenda de inventario lento con 40% de descuento o un gorro quirurgico incluido. Adicionalmente, contactar centros de salud para ventas de lote cerrado.", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 28,
      size: 6.8,
      font: fontRegular,
      color: cTextSecondary,
      maxWidth: CONTENT_WIDTH - 24,
    });

    drawPageFooter(page5, 5);
  }

  // =========================================================================
  // PAGE 6: CARTERA DE CLIENTES, FIDELIZACIÓN & RFM
  // =========================================================================
  {
    const page6 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let curY = drawPageHeader(page6, "CAPITULO 05", "SEGMENTACION DE CLIENTES, VIP Y RETENCION (RFM)", 6);

    // Section 1: Customer Base KPIs Strip
    const custKpiH = 50;
    const cCardW = (CONTENT_WIDTH - 24) / 4;

    const cKpis = [
      { label: "CLIENTES REGISTRADOS", val: `${data.customerMetrics.totalRegistered}`, sub: "121 con compras efectivas" },
      { label: "TASA DE RECOMPRA", val: `${data.customerMetrics.repeatRatePct.toFixed(1)}%`, sub: "27 clientes recurrentes" },
      { label: "COMPRA UNICA", val: `${data.customerMetrics.singlePurchaseCount}`, sub: "Potencial de reactivacion" },
      { label: "CONCENTRACION TOP 10", val: `${data.customerMetrics.top10RevenueSharePct.toFixed(1)}%`, sub: "$5,780 USD facturados" },
    ];

    cKpis.forEach((k, idx) => {
      const cx = PAGE_MARGIN_X + idx * (cCardW + 8);
      drawCard(page6, cx, curY, cCardW, custKpiH, cWhite, cBorder);

      page6.drawText(k.label, { x: cx + 10, y: curY - 14, size: 6.5, font: fontBold, color: cTextSecondary });
      page6.drawText(k.val, { x: cx + 10, y: curY - 30, size: 12, font: fontBold, color: cDarkCharcoal });
      page6.drawText(k.sub, { x: cx + 10, y: curY - 42, size: 6.5, font: fontRegular, color: cTextMuted });
    });

    curY -= custKpiH + 15;

    // Section 2: Top 10 VIP Customers Table
    const tableH = 220;
    drawCard(page6, PAGE_MARGIN_X, curY, CONTENT_WIDTH, tableH, cWhite, cBorder);

    page6.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page6.drawText("CUADRO DE HONOR: TOP 10 CLIENTES VIP POR MONTO FACTURADO", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const cColX = [
      PAGE_MARGIN_X + 10,  // Nombre
      PAGE_MARGIN_X + 175, // Pedidos
      PAGE_MARGIN_X + 225, // Total Gastado
      PAGE_MARGIN_X + 295, // Ticket AOV
      PAGE_MARGIN_X + 360, // Ultima Compra
      PAGE_MARGIN_X + 430, // Recencia
      PAGE_MARGIN_X + 485, // Clasificacion
    ];

    const cHeadY = curY - 36;
    ["Nombre del Cliente", "Ordenes", "Total USD", "Ticket AOV", "Ultima Compra", "Recencia", "Segmento"].forEach((h, i) => {
      page6.drawText(h, { x: cColX[i], y: cHeadY, size: 7, font: fontBold, color: cTextSecondary });
    });

    page6.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: cHeadY - 6 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: cHeadY - 6 },
      thickness: 0.5,
      color: cBorder,
    });

    let cRowY = cHeadY - 18;
    data.topCustomers.slice(0, 10).forEach((c, idx) => {
      const isZebra = idx % 2 === 1;
      if (isZebra) {
        page6.drawRectangle({
          x: PAGE_MARGIN_X + 1,
          y: cRowY - 4,
          width: CONTENT_WIDTH - 2,
          height: 17,
          color: cPanel,
        });
      }

      page6.drawText(cleanText(c.name), { x: cColX[0], y: cRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page6.drawText(`${c.ordersCount}`, { x: cColX[1], y: cRowY, size: 7.5, font: fontRegular, color: cTextPrimary });
      page6.drawText(formatUSD(c.totalSpentUsd), { x: cColX[2], y: cRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page6.drawText(formatUSD(c.aov), { x: cColX[3], y: cRowY, size: 7.5, font: fontRegular, color: cTextSecondary });
      page6.drawText(c.lastOrderDate, { x: cColX[4], y: cRowY, size: 7, font: fontRegular, color: cTextMuted });

      const isLate = c.recencyDays > 30;
      page6.drawText(`${c.recencyDays} d.`, {
        x: cColX[5],
        y: cRowY,
        size: 7.2,
        font: fontBold,
        color: isLate ? cWarning : cSuccess,
      });

      page6.drawText(c.tier, {
        x: cColX[6],
        y: cRowY,
        size: 7,
        font: fontBold,
        color: c.tier === "VIP Oro" ? cGold : cInfo,
      });

      cRowY -= 17;
    });

    curY -= tableH + 15;

    // Section 3: VIP Spotlight & Churn Risk (2 columns)
    const midW = (CONTENT_WIDTH - 12) / 2;

    // Left: Customer Concentration & B2B Profile
    drawCard(page6, PAGE_MARGIN_X, curY, midW, 165, cWhite, cBorder);
    page6.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page6.drawText("PERFIL DEL CLIENTE ANCLA: TORRES REINER", {
      x: PAGE_MARGIN_X + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    page6.drawRectangle({
      x: PAGE_MARGIN_X + 10,
      y: curY - 60,
      width: midW - 20,
      height: 32,
      color: cGoldLight,
      borderColor: cGold,
      borderWidth: 1,
    });
    page6.drawText("CLIENTE INSTITUCIONAL CLAVE: $3,130.00 USD", {
      x: PAGE_MARGIN_X + 16,
      y: curY - 44,
      size: 8,
      font: fontBold,
      color: cGold,
    });
    page6.drawText("Explica el 28.2% de todas las ventas de la empresa con 6 pedidos de alto ticket.", {
      x: PAGE_MARGIN_X + 16,
      y: curY - 54,
      size: 6.2,
      font: fontRegular,
      color: cTextPrimary,
    });

    const trPoints = [
      "Volumen: Pedidos de 10 a 25 uniformes (promedio de $521 por compra).",
      "Ultima orden: 02 de Septiembre (30 dias de recencia activa).",
      "Riesgo: El 28.2% de ingresos depende de este unico cliente B2B.",
      "Accion: Atencion de cuenta clave con reposicion trimestral.",
    ];

    let trY = curY - 74;
    trPoints.forEach(p => {
      page6.drawText("-", { x: PAGE_MARGIN_X + 12, y: trY, size: 7.5, font: fontBold, color: cGold });
      page6.drawText(cleanText(p), {
        x: PAGE_MARGIN_X + 22,
        y: trY,
        size: 6.8,
        font: fontRegular,
        color: cTextSecondary,
        maxWidth: midW - 32,
      });
      trY -= 19;
    });

    // Right: Retention & Reactivation
    const rightX = PAGE_MARGIN_X + midW + 12;
    drawCard(page6, rightX, curY, midW, 165, cWhite, cBorder);
    page6.drawRectangle({
      x: rightX,
      y: curY - 24,
      width: midW,
      height: 24,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page6.drawText("PROTOCOLO DE RETENCION & RECOMPRA", {
      x: rightX + 10,
      y: curY - 16,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const retPoints = [
      {
        title: "Clientes Frecuentes (Ej: Daniela Torres - 10 pedidos)",
        desc: "Fidelidad sobresaliente. Premiar con envio gratuito o bordado personalizado.",
      },
      {
        title: "Compradores Unicos (94 clientes - 77.7%)",
        desc: "Enviar campana de reactivacion por WhatsApp a los 45 dias de la compra.",
      },
      {
        title: "Segmento Institucional (Ej: Centro Medico Dr. Plus)",
        desc: "Compra de $240 en sep. Oportunidad de dotacion recurrente de fin de ano.",
      },
    ];

    let retY = curY - 38;
    retPoints.forEach(rp => {
      page6.drawText(cleanText(rp.title), { x: rightX + 10, y: retY, size: 7.2, font: fontBold, color: cDarkCharcoal });
      page6.drawText(cleanText(rp.desc), {
        x: rightX + 10,
        y: retY - 11,
        size: 6.3,
        font: fontRegular,
        color: cTextSecondary,
        maxWidth: midW - 20,
      });
      retY -= 36;
    });

    curY -= 175;

    // Bottom Directive Note
    drawCard(page6, PAGE_MARGIN_X, curY, CONTENT_WIDTH, 50, cPanel, cBorder);
    page6.drawText("ACCION PRIORITARIA DE CRM", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 14,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });
    page6.drawText("Contactar esta semana a Torres Reiner y Ana Rivas (30+ dias sin compra) para presentarles la nueva coleccion y asegurar los pedidos corporativos del mes de octubre.", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 26,
      size: 6.8,
      font: fontRegular,
      color: cTextSecondary,
      maxWidth: CONTENT_WIDTH - 24,
    });

    drawPageFooter(page6, 6);
  }

  // =========================================================================
  // PAGE 7: CONSIGNACIONES, OPERACIONES & HOJA DE RUTA ESTRATÉGICA
  // =========================================================================
  {
    const page7 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let curY = drawPageHeader(page7, "CAPITULO 06", "CONSIGNACIONES, OPERACIONES & HOJA DE RUTA ESTRATEGICA", 7);

    // Section 1: Consignment Audit Table
    const consH = 145;
    drawCard(page7, PAGE_MARGIN_X, curY, CONTENT_WIDTH, consH, cWhite, cBorder);

    page7.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cWarningBg,
      borderColor: cWarning,
      borderWidth: 1,
    });
    page7.drawText("AUDITORIA DE CONSIGNACIONES: 96.5% DE PRENDAS RETENIDAS EN LA CALLE", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cWarning,
    });

    const cgColX = [
      PAGE_MARGIN_X + 10,  // Consignataria
      PAGE_MARGIN_X + 140, // Ubicacion
      PAGE_MARGIN_X + 225, // Lotes
      PAGE_MARGIN_X + 275, // Entregadas
      PAGE_MARGIN_X + 345, // Liquidadas
      PAGE_MARGIN_X + 415, // Devueltas
      PAGE_MARGIN_X + 480, // Pendientes
    ];

    const cgHeadY = curY - 36;
    ["Consignataria", "Ubicacion", "Lotes", "Entregadas", "Liquidadas", "Devueltas", "Pendientes"].forEach((h, i) => {
      page7.drawText(h, { x: cgColX[i], y: cgHeadY, size: 7, font: fontBold, color: cTextSecondary });
    });

    page7.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: cgHeadY - 6 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: cgHeadY - 6 },
      thickness: 0.5,
      color: cBorder,
    });

    let cgRowY = cgHeadY - 16;
    data.consignments.consignees.slice(0, 5).forEach((cg, idx) => {
      const isZebra = idx % 2 === 1;
      if (isZebra) {
        page7.drawRectangle({
          x: PAGE_MARGIN_X + 1,
          y: cgRowY - 4,
          width: CONTENT_WIDTH - 2,
          height: 15,
          color: cPanel,
        });
      }

      page7.drawText(cleanText(cg.name), { x: cgColX[0], y: cgRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page7.drawText(cleanText(cg.location), { x: cgColX[1], y: cgRowY, size: 7, font: fontRegular, color: cTextSecondary });
      page7.drawText(`${cg.lotsCount} lotes`, { x: cgColX[2], y: cgRowY, size: 7, font: fontRegular, color: cTextMuted });
      page7.drawText(`${cg.deliveredUnits} u.`, { x: cgColX[3], y: cgRowY, size: 7.5, font: fontBold, color: cDarkCharcoal });
      page7.drawText(`${cg.liquidatedUnits} u.`, { x: cgColX[4], y: cgRowY, size: 7.5, font: fontBold, color: cSuccess });
      page7.drawText(`${cg.returnedUnits} u.`, { x: cgColX[5], y: cgRowY, size: 7, font: fontRegular, color: cTextMuted });
      page7.drawText(`${cg.pendingUnits} u. (~$${cg.pendingUsd})`, {
        x: cgColX[6],
        y: cgRowY,
        size: 7.5,
        font: fontBold,
        color: cg.pendingUnits > 10 ? cDanger : cWarning,
      });

      cgRowY -= 16;
    });

    // Consignment total line
    page7.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: cgRowY + 3 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: cgRowY + 3 },
      thickness: 0.5,
      color: cBorder,
    });
    page7.drawText("TOTAL CONSIGNACIONES", { x: cgColX[0], y: cgRowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page7.drawText(`${data.consignments.totalLots} lotes`, { x: cgColX[2], y: cgRowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page7.drawText(`${data.consignments.totalUnitsDelivered} u.`, { x: cgColX[3], y: cgRowY - 6, size: 7.5, font: fontBold, color: cDarkCharcoal });
    page7.drawText(`${data.consignments.liquidatedUnits} u.`, { x: cgColX[4], y: cgRowY - 6, size: 7.5, font: fontBold, color: cSuccess });
    page7.drawText(`${data.consignments.returnedUnits} u.`, { x: cgColX[5], y: cgRowY - 6, size: 7.5, font: fontBold, color: cTextMuted });
    page7.drawText(`${data.consignments.pendingUnits} u. (~${formatUSD(data.consignments.pendingCapitalUsd)})`, {
      x: cgColX[6],
      y: cgRowY - 6,
      size: 7.5,
      font: fontBold,
      color: cDanger,
    });

    curY -= consH + 15;

    // Section 2: Operating Expenses Strip
    const expH = 70;
    drawCard(page7, PAGE_MARGIN_X, curY, CONTENT_WIDTH, expH, cWhite, cBorder);
    page7.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 22,
      width: CONTENT_WIDTH,
      height: 22,
      color: cPanel,
      borderColor: cBorder,
      borderWidth: 1,
    });
    page7.drawText(`ESTRUCTURA DE GASTOS OPERATIVOS REGISTRADOS: ${formatUSD(data.expenses.totalExpensesUsd)} USD`, {
      x: PAGE_MARGIN_X + 12,
      y: curY - 15,
      size: 7.5,
      font: fontBold,
      color: cDarkCharcoal,
    });

    const expColW = (CONTENT_WIDTH - 24) / 3;
    let ecX = PAGE_MARGIN_X + 12;
    data.expenses.categories.forEach(cat => {
      page7.drawText(cleanText(cat.category), { x: ecX, y: curY - 36, size: 7.2, font: fontBold, color: cDarkCharcoal });
      page7.drawText(`${formatUSD(cat.totalUsd)} (${cat.sharePct.toFixed(1)}%)`, {
        x: ecX,
        y: curY - 48,
        size: 8,
        font: fontBold,
        color: cGold,
      });
      page7.drawText(cleanText(cat.notes[0] || ""), {
        x: ecX,
        y: curY - 58,
        size: 6,
        font: fontRegular,
        color: cTextMuted,
        maxWidth: expColW - 10,
      });
      ecX += expColW + 8;
    });

    curY -= expH + 12;

    // Section 3: 5 Strategic Action Pillars (The Master Roadmap)
    const roadH = 225;
    drawCard(page7, PAGE_MARGIN_X, curY, CONTENT_WIDTH, roadH, cWhite, cBorder);

    page7.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 24,
      width: CONTENT_WIDTH,
      height: 24,
      color: cDarkCharcoal,
      borderColor: cBorderDark,
      borderWidth: 1,
    });

    page7.drawText("HOJA DE RUTA ESTRATEGICA: 5 PILARES DE ACCION INMEDIATA", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 16,
      size: 8,
      font: fontBold,
      color: cGold,
    });

    const pillars = [
      {
        num: "1",
        title: "REABASTECIMIENTO QUIRURGICO 80/20 (PRIORIDAD MAXIMA)",
        desc: "Corte prioritario de tallas S y M en Negro (Z21), Azul Rey (Z22) y Blanco (Z14) para modelos 42168, 42019 y 42015. Reponer 150 u. para capturar $1,500/mes de demanda insatisfecha.",
        color: cDanger,
      },
      {
        num: "2",
        title: "CAMPANA FLASH DE RECUPERACION DE DEAD STOCK (~$8,100 USD)",
        desc: "Lanzar 'Promo Dotacion Medica': Por cada scrub core, anadir una segunda prenda lenta o gorro por $5-$10 USD. Meta: Recuperar $3,500 USD en 30 dias para financiar nuevo tejido.",
        color: cWarning,
      },
      {
        num: "3",
        title: "SANEAMIENTO, AUDITORIA Y COBRO RIGUROSO DE CONSIGNACIONES",
        desc: "Congelar nuevos despachos a Andry (60 u) y Nelsy (43 u). Exigir arqueo fisico semanal, liquidacion en divisas/USDT de prendas vendidas y devolucion de no rotadas en 15 dias.",
        color: cDanger,
      },
      {
        num: "4",
        title: "PLAN CORPORATIVO B2B Y PROTOCOLO DE RETENCION DE CLIENTES VIP",
        desc: "Protocolo VIP con Torres Reiner, Daniela Torres y centros medicos. Presentar cotizaciones por volumen (10, 25, 50 prendas) y entrega programada para dotaciones de fin de ano.",
        color: cSuccess,
      },
      {
        num: "5",
        title: "RACIONALIZACION DEL CATALOGO CROMATICO ('CORE 15')",
        desc: "Concentrar la confeccion en el 'Top 15' de colores (88.6% del volumen). Los 128 tonos restantes pasaran a pedido exclusivo con anticipo del 50%, reduciendo drásticamente mermas.",
        color: cInfo,
      },
    ];

    let pilY = curY - 35;
    pillars.forEach(p => {
      // Badge
      page7.drawRectangle({
        x: PAGE_MARGIN_X + 10,
        y: pilY - 10,
        width: 13,
        height: 13,
        color: p.color,
      });
      page7.drawText(p.num, {
        x: PAGE_MARGIN_X + 14,
        y: pilY - 7,
        size: 7.5,
        font: fontBold,
        color: cWhite,
      });

      page7.drawText(cleanText(p.title), {
        x: PAGE_MARGIN_X + 30,
        y: pilY - 6,
        size: 7.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page7.drawText(cleanText(p.desc), {
        x: PAGE_MARGIN_X + 30,
        y: pilY - 16,
        size: 6.5,
        font: fontRegular,
        color: cTextSecondary,
        maxWidth: CONTENT_WIDTH - 42,
        lineHeight: 8.5,
      });

      pilY -= 37;
    });

    curY -= roadH + 12;

    // Section 4: Quarterly SMART Objectives & Commercial Governance
    const objH = 150;
    drawCard(page7, PAGE_MARGIN_X, curY, CONTENT_WIDTH, objH, cWhite, cBorder);

    page7.drawRectangle({
      x: PAGE_MARGIN_X,
      y: curY - 22,
      width: CONTENT_WIDTH,
      height: 22,
      color: cCardDark,
      borderColor: cBorderDark,
      borderWidth: 1,
    });

    page7.drawText("METAS ESTRATEGICAS CUANTITATIVAS (PLAN 90 DIAS) & GOBERNANZA", {
      x: PAGE_MARGIN_X + 12,
      y: curY - 15,
      size: 7.8,
      font: fontBold,
      color: cGold,
    });

    const targetBoxes = [
      {
        kpi: "META 01: RECUPERACION DE LIQUIDEZ",
        target: "+$5,000 USD",
        desc: "Cobro de consignaciones (109 u) y bundles de dead stock.",
        badgeColor: cSuccess,
      },
      {
        kpi: "META 02: DISPONIBILIDAD CORE 80/20",
        target: "98% Fill Rate",
        desc: "Cero quiebres en S y M para Negro, Azul Rey y Blanco.",
        badgeColor: cInfo,
      },
      {
        kpi: "META 03: ROTACION DE CONSIGNACION",
        target: "< 21 Dias",
        desc: "Bajar retencion en calle a <25% con liquidacion semanal.",
        badgeColor: cWarning,
      },
      {
        kpi: "META 04: ESCALABILIDAD MARGEN NETO",
        target: ">= 52% Margen",
        desc: "Sostener margen 68%+ y expandir facturacion a $7,500+/mes.",
        badgeColor: cGold,
      },
    ];

    const boxW = (CONTENT_WIDTH - 30) / 2;
    const boxH = 42;

    targetBoxes.forEach((tb, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bX = PAGE_MARGIN_X + 10 + col * (boxW + 10);
      const bY = curY - 29 - row * (boxH + 6);

      drawCard(page7, bX, bY, boxW, boxH, cPanel, cBorder);

      page7.drawText(cleanText(tb.kpi), {
        x: bX + 8,
        y: bY - 11,
        size: 6.5,
        font: fontBold,
        color: cDarkCharcoal,
      });

      page7.drawText(cleanText(tb.target), {
        x: bX + 8,
        y: bY - 23,
        size: 8.5,
        font: fontBold,
        color: tb.badgeColor,
      });

      page7.drawText(cleanText(tb.desc), {
        x: bX + 8,
        y: bY - 33,
        size: 6,
        font: fontRegular,
        color: cTextSecondary,
        maxWidth: boxW - 16,
      });
    });

    // Governance Sign-off & Verification Footer
    const signY = curY - 128;
    page7.drawLine({
      start: { x: PAGE_MARGIN_X + 10, y: signY },
      end: { x: PAGE_WIDTH - PAGE_MARGIN_X - 10, y: signY },
      thickness: 0.5,
      color: cBorder,
    });

    page7.drawText("DICTAMEN Y RESPALDO EJECUTIVO COMERCIAL", {
      x: PAGE_MARGIN_X + 12,
      y: signY - 8,
      size: 6.5,
      font: fontBold,
      color: cTextPrimary,
    });

    page7.drawText(cleanText("Este informe sintetiza 196 ordenes historicas ($11,100 USD). Directrices oficiales para compras textiles, produccion y comercializacion."), {
      x: PAGE_MARGIN_X + 12,
      y: signY - 16,
      size: 5.8,
      font: fontRegular,
      color: cTextMuted,
    });

    drawPageFooter(page7, 7);
  }

  return await pdfDoc.save();
}

import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getConfigData } from "@/lib/db/actions";
import { getBiReportDataFromDb } from "@/lib/bi/analytics";
import { generateBusinessIntelligencePdf } from "@/lib/pdf/bi-report-generator";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { session, user } = await getSessionUser();
  if (!session || !user) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const [config, biData] = await Promise.all([
      getConfigData(),
      getBiReportDataFromDb(),
    ]);

    let logoBytes: Uint8Array | null = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "assets", "logo.jpg");
      if (fs.existsSync(logoPath)) {
        logoBytes = new Uint8Array(fs.readFileSync(logoPath));
      }
    } catch {
      try {
        const url = new URL("/assets/logo.jpg", request.url);
        const res = await fetch(url.toString());
        if (res.ok) {
          logoBytes = new Uint8Array(await res.arrayBuffer());
        }
      } catch {
        logoBytes = null;
      }
    }

    const brandName = config.settings.marca || "K-Uniformes";
    const rif = config.settings.rif || "J-50468923-1";

    const pdfBytes = await generateBusinessIntelligencePdf(biData, {
      brandName,
      rif,
      logoBytes,
    });

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Reporte_Inteligencia_Comercial_${brandName.replace(/\s+/g, "_")}.pdf"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    console.error("Error generating BI report PDF:", error);
    return new Response(JSON.stringify({ error: error?.message || "Error al generar el reporte" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

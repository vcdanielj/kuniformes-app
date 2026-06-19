import { NextRequest } from "next/server";
import { getConfigData, getInventoryModels } from "@/lib/db/actions";
import { generateCatalogPdf } from "@/lib/pdf/generator";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSessionUser();
    if (!user) {
      return new Response("No autorizado", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const allowPrices = user.role === "admin";
    const showPrices = allowPrices && searchParams.get("showPrices") !== "false";
    
    // Fetch models List from DB
    const [modelsList, config] = await Promise.all([getInventoryModels(), getConfigData()]);

    const pdfBytes = await generateCatalogPdf(modelsList, showPrices, {
      brand: {
        name: config.settings.marca || "K-Uniformes",
        rif: config.settings.rif || "",
        phone: config.settings.telefono || "",
        instagram: config.settings.instagram || "",
        logoUrl: "/assets/logo.jpg",
      },
      baseUrl: request.url,
    });
    const pdfBody = Uint8Array.from(pdfBytes);

    return new Response(pdfBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="catalogo.pdf"`,
      },
    });
  } catch (e: unknown) {
    console.error("Error generating catalog PDF:", e);
    return new Response("Error al generar catálogo en PDF", { status: 500 });
  }
}

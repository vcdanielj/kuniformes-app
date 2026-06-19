import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { customers, models, sales, quotes } from "@/lib/db/schema";
import { like, or } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const { session, user } = await getSessionUser();
    if (!session || !user) {
      return new Response("No autorizado", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    if (query.trim().length < 2) {
      return Response.json({ customers: [], models: [], sales: [], quotes: [] });
    }

    const term = `%${query}%`;

    // Query customers
    const matchedCustomers = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(or(like(customers.name, term), like(customers.phone, term)))
      .limit(5);

    // Query models
    const matchedModels = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(or(like(models.id, term), like(models.name, term)))
      .limit(5);

    // Query sales (Notes of Entry)
    const matchedSales = await db
      .select({ id: sales.id, number: sales.number })
      .from(sales)
      .where(like(sales.number, term))
      .limit(5);

    // Query quotes
    const matchedQuotes = await db
      .select({ id: quotes.id, number: quotes.number })
      .from(quotes)
      .where(like(quotes.number, term))
      .limit(5);

    return Response.json({
      customers: matchedCustomers,
      models: matchedModels,
      sales: matchedSales,
      quotes: matchedQuotes,
    });
  } catch (e: unknown) {
    console.error("Search API error:", e);
    return new Response("Error al buscar", { status: 500 });
  }
}

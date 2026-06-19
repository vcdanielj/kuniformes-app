import { getCloudflareContext } from "@opennextjs/cloudflare";
import Database from "better-sqlite3";
import { drizzle as nodeDrizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as d1Drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "./schema";

// Drizzle exposes adapter-specific database types that are not directly compatible here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseInstance = any;

export function getDbForBindings(bindings?: { DB?: unknown } | null): DatabaseInstance {
  if (bindings?.DB) {
    return d1Drizzle(bindings.DB as Parameters<typeof d1Drizzle>[0], { schema });
  }

  const cloudflareDb = getCloudflareD1Database();
  if (cloudflareDb) {
    return cloudflareDb;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("No se encontro el binding DB de Cloudflare en este runtime.");
  }

  return getLocalDatabase();
}

function getCloudflareD1Database(): DatabaseInstance | null {
  try {
    const { env } = getCloudflareContext();
    const bindings = env as CloudflareEnv & { DB?: unknown };
    if (bindings.DB) {
      return getDbForBindings(bindings);
    }
  } catch {
    // Local Node.js dev and build do not expose Cloudflare bindings.
  }

  return null;
}

const getLocalDatabase = cache(() => {
  const sqlite = new Database("local.db");
  return nodeDrizzle(sqlite, { schema });
});

export const getDb = cache(() => {
  return getCloudflareD1Database() ?? getLocalDatabase();
});

export const db = new Proxy({} as DatabaseInstance, {
  get(_target, prop) {
    const currentDb = getDb();
    return Reflect.get(currentDb, prop, currentDb);
  },
});

export type DBType = DatabaseInstance;

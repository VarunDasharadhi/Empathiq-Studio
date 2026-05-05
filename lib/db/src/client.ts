import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

type Schema = typeof schema;

let _db: NodePgDatabase<Schema> | null = null;

function getDb(): NodePgDatabase<Schema> {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _db = drizzle(process.env.DATABASE_URL, { schema });
  }
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<Schema>, {
  get(_target, prop) {
    return getDb()[prop as keyof NodePgDatabase<Schema>];
  },
});

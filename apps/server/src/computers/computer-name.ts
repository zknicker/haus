import { sql } from 'drizzle-orm';
import { computersTable } from '../postgres/schema.ts';

/** A Computer's reported name, or null when it reported none. */
export const computerNameSql = sql<
    string | null
>`nullif(btrim(${computersTable.reportedInventory} ->> 'name'), '')`;

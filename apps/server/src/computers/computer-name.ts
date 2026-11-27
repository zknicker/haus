import { sql } from 'drizzle-orm';
import { computersTable } from '../postgres/schema.ts';

export const computerNameSql = sql<
    string | null
>`nullif(btrim(${computersTable.reportedInventory} ->> 'name'), '')`;

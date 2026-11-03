import type { SQL } from 'drizzle-orm';
import type { HausDatabase } from '../../postgres/connection.ts';

export type AdventReader = Pick<HausDatabase, 'execute'>;

/** The query's first row, or null when it returns none. */
export async function readRow<Row>(db: AdventReader, query: SQL): Promise<Row | null> {
    const rows = (await db.execute(query)) as unknown as Row[];
    return rows[0] ?? null;
}

/** A single `count` column, null when it is zero. */
export async function readCount(db: AdventReader, query: SQL): Promise<{ count: number } | null> {
    const row = await readRow<{ count: number }>(db, query);
    return row && row.count > 0 ? { count: row.count } : null;
}

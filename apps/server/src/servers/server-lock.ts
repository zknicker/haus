import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serversTable } from '../postgres/schema.ts';

/**
 * The Server row is the one serialization point for durable writes, and
 * every transaction that needs it takes it **first, before authorizing**.
 *
 * Two things depend on that order. Authorizing after the lock means a write
 * already in flight re-reads membership behind a concurrent removal, so
 * revocation is genuinely immediate rather than "immediate unless something was
 * mid-transaction". And taking the Server row before any Chat, message, or read
 * row means no two transactions can want those in opposite orders — removal
 * (Server, then read markers) and a read marker (its own row, then the Server
 * event cursor) would otherwise form a deadlock cycle.
 *
 * Transactions that take it: Server rename, message send, read marking, Thread
 * following, DM creation, claim writes, invitation creation/acceptance/revocation,
 * role change, removal, leaving, Computer attachment, message reactions, reminder
 * scheduling/mutation/firing, and operator reminder cancellation.
 */
export async function lockServerRow(
    tx: Pick<HausDatabase, 'execute'>,
    serverId: string
): Promise<void> {
    await tx.execute(sql`select id from ${serversTable} where id = ${serverId} for update`);
}

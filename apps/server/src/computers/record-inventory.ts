import type { ComputerInventory } from '@haus/api';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

export function recordComputerInventory(
    db: HausDatabase,
    computerId: string,
    inventory: ComputerInventory
) {
    return recordInventory(db, computerId, inventory, 'full');
}

export function recordComputerRuntimeInventory(
    db: HausDatabase,
    computerId: string,
    runtimes: ComputerInventory['runtimes']
) {
    return recordInventory(db, computerId, { runtimes }, 'runtimes');
}

export async function recordInvalidComputerInventory(db: HausDatabase, computerId: string) {
    const marked = await db
        .update(computersTable)
        .set({ inventoryInvalidAt: new Date() })
        .where(and(eq(computersTable.id, computerId), isNull(computersTable.inventoryInvalidAt)))
        .returning({ id: computersTable.id });
    return marked.length > 0;
}

/**
 * Runtime scans preserve unrelated inventory fields, and any valid report
 * clears an earlier invalid one. Resolves whether a read-visible row changed:
 * a Computer re-sends its whole inventory after every turn, and an identical
 * one writes nothing.
 */
async function recordInventory(
    db: HausDatabase,
    computerId: string,
    inventory: ComputerInventory,
    scope: 'full' | 'runtimes'
) {
    // jsonb equality ignores key order, so a re-sent inventory compares equal.
    const stored =
        scope === 'full'
            ? computersTable.reportedInventory
            : sql`${computersTable.reportedInventory}->'runtimes'`;
    const reported = scope === 'full' ? inventory : inventory.runtimes;
    const inventoryChanged = await db
        .update(computersTable)
        .set({
            inventoryInvalidAt: null,
            reportedInventory:
                scope === 'full'
                    ? inventory
                    : sql`jsonb_set(coalesce(${computersTable.reportedInventory}, '{}'::jsonb), '{runtimes}', ${sql.param(inventory.runtimes)}::jsonb)`,
        })
        .where(
            and(
                eq(computersTable.id, computerId),
                or(
                    sql`${stored} is distinct from ${sql.param(reported)}::jsonb`,
                    isNotNull(computersTable.inventoryInvalidAt)
                )
            )
        )
        .returning({ id: computersTable.id });
    return inventoryChanged.length > 0;
}

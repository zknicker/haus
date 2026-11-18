import type { ComputerInventory } from '@haus/api';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, serverOnboardingTable } from '../postgres/schema.ts';

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

/** An invalid inventory report fails an unfinished onboarding; true when it did. */
export async function recordInvalidComputerInventory(
    db: HausDatabase,
    computerId: string,
    serverId: string
): Promise<boolean> {
    const updated = await db
        .update(serverOnboardingTable)
        .set({
            computerId,
            failureCode: 'inventory-invalid',
            failureDetail: 'The Computer reported invalid inventory. Update it and reconnect.',
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(serverOnboardingTable.serverId, serverId),
                ne(serverOnboardingTable.phase, 'complete'),
                or(
                    eq(serverOnboardingTable.phase, 'awaiting-computer'),
                    eq(serverOnboardingTable.computerId, computerId)
                )
            )
        )
        .returning({ serverId: serverOnboardingTable.serverId });
    return updated.length > 0;
}

/**
 * Runtime scans preserve unrelated inventory fields and update onboarding
 * readiness. Resolves whether a read-visible row changed: a Computer re-sends
 * its whole inventory after every turn, and an identical one writes nothing.
 */
async function recordInventory(
    db: HausDatabase,
    computerId: string,
    inventory: ComputerInventory,
    scope: 'full' | 'runtimes'
): Promise<boolean> {
    return await db.transaction(async (tx) => {
        const [computer] = await tx
            .select({ serverId: computersTable.serverId })
            .from(computersTable)
            .where(eq(computersTable.id, computerId))
            .limit(1);
        if (!computer) {
            return false;
        }
        // jsonb equality ignores key order, so a re-sent inventory compares equal.
        const stored =
            scope === 'full'
                ? computersTable.reportedInventory
                : sql`${computersTable.reportedInventory}->'runtimes'`;
        const reported = scope === 'full' ? inventory : inventory.runtimes;
        const inventoryChanged = await tx
            .update(computersTable)
            .set({
                reportedInventory:
                    scope === 'full'
                        ? inventory
                        : sql`jsonb_set(coalesce(${computersTable.reportedInventory}, '{}'::jsonb), '{runtimes}', ${sql.param(inventory.runtimes)}::jsonb)`,
            })
            .where(
                and(
                    eq(computersTable.id, computerId),
                    sql`${stored} is distinct from ${sql.param(reported)}::jsonb`
                )
            )
            .returning({ id: computersTable.id });
        const onboardingChanged = await recordOnboardingReadiness(
            tx,
            computerId,
            computer.serverId,
            inventory.runtimes.some((runtime) => runtime.models.length > 0)
        );
        return inventoryChanged.length > 0 || onboardingChanged;
    });
}

/** An unfinished onboarding tracks whether this Computer reported a usable runtime. */
async function recordOnboardingReadiness(
    tx: Parameters<Parameters<HausDatabase['transaction']>[0]>[0],
    computerId: string,
    serverId: string,
    usable: boolean
): Promise<boolean> {
    const [onboarding] = await tx
        .select({
            failureCode: serverOnboardingTable.failureCode,
            phase: serverOnboardingTable.phase,
        })
        .from(serverOnboardingTable)
        .where(eq(serverOnboardingTable.serverId, serverId))
        .limit(1);
    const keepsApplicationFailure = usable && onboarding?.failureCode === 'application-failed';
    const updated = await tx
        .update(serverOnboardingTable)
        .set({
            computerId,
            failureCode: keepsApplicationFailure
                ? 'application-failed'
                : usable
                  ? null
                  : 'inventory-empty',
            failureDetail: keepsApplicationFailure
                ? undefined
                : usable
                  ? null
                  : 'This Computer did not report a usable runtime and model.',
            ...(usable && onboarding?.phase === 'awaiting-computer'
                ? { phase: 'awaiting-cove' as const }
                : {}),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(serverOnboardingTable.serverId, serverId),
                ne(serverOnboardingTable.phase, 'complete'),
                or(
                    eq(serverOnboardingTable.phase, 'awaiting-computer'),
                    eq(serverOnboardingTable.computerId, computerId)
                )
            )
        )
        .returning({ serverId: serverOnboardingTable.serverId });
    return updated.length > 0;
}

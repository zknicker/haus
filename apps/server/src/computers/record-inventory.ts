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

/** Runtime scans preserve unrelated inventory fields and update onboarding readiness. */
async function recordInventory(
    db: HausDatabase,
    computerId: string,
    inventory: ComputerInventory,
    scope: 'full' | 'runtimes'
) {
    await db.transaction(async (tx) => {
        const [computer] = await tx
            .select({ serverId: computersTable.serverId })
            .from(computersTable)
            .where(eq(computersTable.id, computerId))
            .limit(1);
        if (!computer) {
            return;
        }
        await tx
            .update(computersTable)
            .set({
                reportedInventory:
                    scope === 'full'
                        ? inventory
                        : sql`jsonb_set(coalesce(${computersTable.reportedInventory}, '{}'::jsonb), '{runtimes}', ${sql.param(inventory.runtimes)}::jsonb)`,
            })
            .where(eq(computersTable.id, computerId));
        const usable = inventory.runtimes.some((runtime) => runtime.models.length > 0);
        const [onboarding] = await tx
            .select({
                failureCode: serverOnboardingTable.failureCode,
                phase: serverOnboardingTable.phase,
            })
            .from(serverOnboardingTable)
            .where(eq(serverOnboardingTable.serverId, computer.serverId))
            .limit(1);
        await tx
            .update(serverOnboardingTable)
            .set({
                computerId,
                failureCode:
                    usable && onboarding?.failureCode === 'application-failed'
                        ? 'application-failed'
                        : usable
                          ? null
                          : 'inventory-empty',
                failureDetail:
                    usable && onboarding?.failureCode === 'application-failed'
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
                    eq(serverOnboardingTable.serverId, computer.serverId),
                    ne(serverOnboardingTable.phase, 'complete'),
                    or(
                        eq(serverOnboardingTable.phase, 'awaiting-computer'),
                        eq(serverOnboardingTable.computerId, computerId)
                    )
                )
            );
    });
}

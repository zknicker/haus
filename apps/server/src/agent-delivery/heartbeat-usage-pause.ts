import type { UsageOverview } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

/** A heartbeat pauses once its plan's weekly meter reaches this share (specs/heartbeat.md). */
export const heartbeatUsagePausePercent = 80;

/**
 * Whether the Computer's latest usage snapshot shows the weekly meter of the
 * plan this runtime bills against at or past the pause line. A missing snapshot,
 * an errored provider, or a runtime with no weekly meter never pauses.
 */
export async function isHeartbeatUsagePaused(
    db: HausDatabase,
    input: { computerId: string; runtimeId: string | null }
): Promise<boolean> {
    const [row] = await db
        .select({ usage: computersTable.usageSnapshot })
        .from(computersTable)
        .where(eq(computersTable.id, input.computerId))
        .limit(1);
    const used = weeklyUsedPercent(row?.usage ?? null, input.runtimeId);
    return used !== null && used >= heartbeatUsagePausePercent;
}

/** The weekly meter's used percent for a runtime's plan, or null when unreported. */
export function weeklyUsedPercent(
    usage: UsageOverview | null,
    runtimeId: string | null
): number | null {
    if (!usage) {
        return null;
    }
    if (runtimeId === 'codex' && usage.codex.status === 'ok') {
        return (
            usage.codex.snapshot.windows.find((window) => window.id === 'current-week')
                ?.usedPercent ?? null
        );
    }
    if (runtimeId === 'claude-code' && usage.claude.status === 'ok') {
        return (
            usage.claude.snapshot.windows.find((window) => window.id === 'current-week-all-models')
                ?.usedPercent ?? null
        );
    }
    return null;
}

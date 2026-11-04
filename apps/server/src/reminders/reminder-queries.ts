import type { ReminderRunOutcome } from '@haus/api';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    reminderAgentAttentionTable,
    reminderFiresTable,
    remindersTable,
} from '../postgres/schema.ts';
import {
    agentCanAccessAnchor,
    type Reminder,
    requireActiveAgent,
    toReminder,
} from './reminder-model.ts';

export interface ReminderFire {
    durationMs: number | null;
    firedAt: string;
    id: string;
    /** Null means the Computer has not settled this script fire yet; callers resolve it to `not_reported`. */
    outcome: ReminderRunOutcome | null;
    reminderId: string;
    scheduledFor: string;
    scriptExitCode?: number | null;
    scriptOutput?: string | null;
    scriptTimedOut?: boolean;
    wakeTotalTokens: number | null;
}

export interface ReminderAgentAttention {
    agentId: string;
    anchorChatId: string;
    fireId: string;
    id: string;
    kind: 'reminder' | 'reminder_script';
    queuedAt: string;
    reminderId: string;
    script: string | null;
}

/**
 * A pathological cadence (sub-minute, over the whole retention window) is the
 * only realistic way to exceed this; it bounds worst-case memory without
 * affecting the summary for any sane cadence, since retention already caps
 * the window this reads from.
 */
const REMINDER_FIRES_QUERY_LIMIT = 10_000;

export async function listReminderFires(
    db: HausDatabase,
    input: {
        actor: { agentId: string; kind: 'agent' };
        reminderId: string;
        /**
         * Bounds the query to fires at or after this time. Optional, rather
         * than always defaulting to the real clock, because write-path tests
         * fire reminders under an injected `ReminderClock` far from real
         * "now" and then read them straight back; the one production caller
         * (`readAgentReminderLog`) always passes `REMINDER_HISTORY_RETENTION_DAYS`
         * back from its own `now`.
         */
        since?: Date;
        serverId: string;
    }
): Promise<ReminderFire[]> {
    await requireVisibleOwnedReminder(db, input.serverId, input.actor.agentId, input.reminderId);
    const rows = await db
        .select()
        .from(reminderFiresTable)
        .where(
            and(
                eq(reminderFiresTable.serverId, input.serverId),
                eq(reminderFiresTable.reminderId, input.reminderId),
                ...(input.since ? [gte(reminderFiresTable.firedAt, input.since)] : [])
            )
        )
        // Newest first under the cap, then restored to the caller's usual
        // oldest-first order, so a long-lived reminder loses its oldest fires
        // rather than its most recent ones if it ever exceeds the cap.
        .orderBy(desc(reminderFiresTable.scheduledFor), desc(reminderFiresTable.id))
        .limit(REMINDER_FIRES_QUERY_LIMIT);
    return rows.reverse().map((row) => ({
        durationMs: row.durationMs,
        firedAt: row.firedAt.toISOString(),
        id: row.id,
        outcome: row.outcome,
        reminderId: row.reminderId,
        scheduledFor: row.scheduledFor.toISOString(),
        scriptExitCode: row.scriptExitCode,
        scriptOutput: row.scriptOutput,
        scriptTimedOut: row.scriptTimedOut,
        wakeTotalTokens: row.wakeTotalTokens,
    }));
}

export async function listReminderAgentAttention(
    db: HausDatabase,
    input: { agentId: string; serverId: string }
): Promise<ReminderAgentAttention[]> {
    await requireActiveAgent(db, input.serverId, input.agentId);
    const rows = await db
        .select()
        .from(reminderAgentAttentionTable)
        .where(
            and(
                eq(reminderAgentAttentionTable.serverId, input.serverId),
                eq(reminderAgentAttentionTable.agentId, input.agentId)
            )
        )
        .orderBy(asc(reminderAgentAttentionTable.queuedAt), asc(reminderAgentAttentionTable.id));
    return rows.map((row) => ({
        agentId: row.agentId,
        anchorChatId: row.anchorChatId,
        fireId: row.fireId,
        id: row.id,
        kind: row.kind,
        queuedAt: row.queuedAt.toISOString(),
        reminderId: row.reminderId,
        script: row.script,
    }));
}

/**
 * Ownership only. Mutations that need anchor access check that themselves;
 * cancel deliberately does not, so a left Chat can still be cleaned up.
 */
export async function readOwnedReminder(
    db: HausDatabase,
    input: { agentId: string; reminderId: string; serverId: string }
): Promise<Reminder> {
    await requireActiveAgent(db, input.serverId, input.agentId);
    const [row] = await db
        .select({ agent: agentsTable, reminder: remindersTable })
        .from(remindersTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, remindersTable.serverId),
                eq(agentsTable.id, remindersTable.ownerAgentId)
            )
        )
        .where(
            and(
                eq(remindersTable.serverId, input.serverId),
                eq(remindersTable.id, input.reminderId),
                eq(remindersTable.ownerAgentId, input.agentId)
            )
        )
        .limit(1);
    if (!row) {
        throw new Error('The reminder is not owned by this Agent.');
    }
    return toReminder(row.reminder, row.agent.handle);
}

/**
 * Log visibility matches list: settled reminders whose anchor the author lost
 * are hidden; still-scheduled ones remain readable so the author can inspect
 * fires and cancel.
 */
async function requireVisibleOwnedReminder(
    db: HausDatabase,
    serverId: string,
    agentId: string,
    reminderId: string
) {
    const reminder = await readOwnedReminder(db, { agentId, reminderId, serverId });
    const anchorAccessible = await agentCanAccessAnchor(db, {
        agentId,
        anchorChatId: reminder.anchorChatId,
        anchorMessageId: reminder.anchorMessageId,
        serverId,
    });
    if (!(anchorAccessible || reminder.status === 'scheduled')) {
        throw new Error('The reminder is not owned by this Agent.');
    }
}

import { automationSnippetMaxChars, type MessageCause, type MessageCauseLive } from '@haus/api';
import { and, count, eq, inArray, max } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    messageCausesTable,
    reminderFiresTable,
    remindersTable,
    triggerFiresTable,
    triggersTable,
} from '../postgres/schema.ts';

/**
 * The provenance mark for each message that has one. The App renders the header
 * mark and its hover card from the message alone, so everything the mark needs
 * rides the message: title, description, cadence or kind label, fire time, and owning Agent
 * come from the snapshot the cause carries, which is why a mark survives its
 * automation. `live` is the automation as it stands today — status, counters,
 * instruction — and is null once the automation or the answered fire is gone.
 */
export async function readMessageCauses(
    db: HausDatabase,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, MessageCause>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const snapshot = {
        attribution: messageCausesTable.attribution,
        description: messageCausesTable.description,
        firedAt: messageCausesTable.firedAt,
        messageId: messageCausesTable.messageId,
        ownerAgentId: messageCausesTable.ownerAgentId,
        summary: messageCausesTable.summary,
        title: messageCausesTable.title,
    };
    const scope = and(
        eq(messageCausesTable.serverId, serverId),
        inArray(messageCausesTable.messageId, messageIds)
    );
    const [triggerRows, reminderRows] = await Promise.all([
        db
            .select({
                ...snapshot,
                automationId: messageCausesTable.triggerId,
                deletedAt: triggersTable.deletedAt,
                fireCount: triggersTable.fireCount,
                fireId: messageCausesTable.triggerFireId,
                firePresent: triggerFiresTable.id,
                instruction: triggersTable.instruction,
                lastFiredAt: triggersTable.lastFiredAt,
                status: triggersTable.status,
            })
            .from(messageCausesTable)
            .leftJoin(
                triggersTable,
                and(
                    eq(triggersTable.serverId, messageCausesTable.serverId),
                    eq(triggersTable.id, messageCausesTable.triggerId)
                )
            )
            .leftJoin(
                triggerFiresTable,
                and(
                    eq(triggerFiresTable.serverId, messageCausesTable.serverId),
                    eq(triggerFiresTable.id, messageCausesTable.triggerFireId)
                )
            )
            .where(and(scope, eq(messageCausesTable.kind, 'trigger_fire'))),
        db
            .select({
                ...snapshot,
                automationId: messageCausesTable.reminderId,
                fireId: messageCausesTable.reminderFireId,
                firePresent: reminderFiresTable.id,
                reminderId: remindersTable.id,
                script: remindersTable.script,
                status: remindersTable.status,
            })
            .from(messageCausesTable)
            .leftJoin(
                remindersTable,
                and(
                    eq(remindersTable.serverId, messageCausesTable.serverId),
                    eq(remindersTable.id, messageCausesTable.reminderId)
                )
            )
            .leftJoin(
                reminderFiresTable,
                and(
                    eq(reminderFiresTable.serverId, messageCausesTable.serverId),
                    eq(reminderFiresTable.id, messageCausesTable.reminderFireId)
                )
            )
            .where(and(scope, eq(messageCausesTable.kind, 'reminder_fire'))),
    ]);
    const fireStats = await readReminderFireStats(
        db,
        serverId,
        reminderRows.map((row) => row.reminderId).filter((id): id is string => id !== null)
    );
    const causes = new Map<string, MessageCause>();
    for (const row of triggerRows) {
        if (!(row.automationId && row.fireId)) {
            continue;
        }
        const live: MessageCauseLive | null =
            row.firePresent && row.status && !row.deletedAt
                ? {
                      fireCount: Math.max(row.fireCount ?? 1, 1),
                      instruction: snippet(row.instruction),
                      lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
                      status: row.status,
                  }
                : null;
        causes.set(row.messageId, {
            attribution: row.attribution,
            automationId: row.automationId,
            description: row.description,
            firedAt: row.firedAt.toISOString(),
            fireId: row.fireId,
            kind: 'trigger',
            live,
            ownerAgentId: row.ownerAgentId,
            summary: row.summary,
            title: row.title,
        });
    }
    for (const row of reminderRows) {
        if (!(row.automationId && row.fireId)) {
            continue;
        }
        const stats = row.reminderId ? fireStats.get(row.reminderId) : undefined;
        const live: MessageCauseLive | null =
            row.firePresent && row.status
                ? {
                      fireCount: Math.max(stats?.fireCount ?? 1, 1),
                      instruction: snippet(row.script),
                      lastFiredAt: stats?.lastFiredAt?.toISOString() ?? null,
                      status: row.status,
                  }
                : null;
        causes.set(row.messageId, {
            attribution: row.attribution,
            automationId: row.automationId,
            description: row.description,
            firedAt: row.firedAt.toISOString(),
            fireId: row.fireId,
            kind: 'reminder',
            live,
            ownerAgentId: row.ownerAgentId,
            summary: row.summary,
            title: row.title,
        });
    }
    return causes;
}

/** How often each reminder has fired and when it last did, for the live half of a mark. */
async function readReminderFireStats(
    db: HausDatabase,
    serverId: string,
    reminderIds: string[]
): Promise<Map<string, { fireCount: number; lastFiredAt: Date | null }>> {
    if (reminderIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            lastFiredAt: max(reminderFiresTable.firedAt),
            reminderId: reminderFiresTable.reminderId,
            total: count(),
        })
        .from(reminderFiresTable)
        .where(
            and(
                eq(reminderFiresTable.serverId, serverId),
                inArray(reminderFiresTable.reminderId, reminderIds)
            )
        )
        .groupBy(reminderFiresTable.reminderId);
    return new Map(
        rows.map((row) => [
            row.reminderId,
            { fireCount: row.total, lastFiredAt: row.lastFiredAt ?? null },
        ])
    );
}

function snippet(value: string | null): string | null {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, automationSnippetMaxChars) : null;
}

import type { MessageCauseAttribution } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    messageCausesTable,
    reminderFiresTable,
    remindersTable,
    triggerFiresTable,
    triggersTable,
} from '../postgres/schema.ts';
import { reminderCadenceSummary, triggerKindSummary } from './automation-summary.ts';

/**
 * The facts the provenance mark keeps once the automation is gone, read from
 * the live records at the moment the cause is recorded.
 */
interface MessageCauseSnapshot {
    anchorChatId: string;
    description: string | null;
    firedAt: Date;
    ownerAgentId: string;
    summary: string;
    title: string;
}

/** One resolved, owner-checked fire, ready to record against a message. */
export type ResolvedMessageCause = MessageCauseSnapshot &
    (
        | { fireId: string; kind: 'reminder_fire'; reminderId: string }
        | {
              fireId: string;
              kind: 'trigger_fire';
              triggerId: string;
          }
    );

/** That fire plus how the Server learned the Agent was answering it. */
export interface AttributedMessageCause {
    attribution: MessageCauseAttribution;
    fire: ResolvedMessageCause;
}

/** A `--cause` the Server will not record, with the reason the Agent gets back. */
export class MessageCauseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MessageCauseError';
    }
}

/**
 * Resolves `haus message send --cause <fireId>` to the fire it names. Fire ids
 * carry their own prefix, so the kind is decided before any lookup. The sending
 * Agent must own the automation: provenance is a claim about who was woken, and
 * one Agent may not attribute its message to another's Trigger or Reminder.
 *
 * The same read collects the snapshot the mark keeps for good, so the title,
 * description, and cadence a reader sees are the ones that were true when the fire happened.
 */
export async function resolveMessageCause(
    db: HausDatabase,
    input: { agentId: string; cause: string; serverId: string }
): Promise<ResolvedMessageCause> {
    if (input.cause.startsWith('trf_')) {
        const [row] = await db
            .select({
                anchorChatId: triggersTable.anchorChatId,
                firedAt: triggerFiresTable.receivedAt,
                kind: triggersTable.kind,
                ownerAgentId: triggersTable.ownerAgentId,
                title: triggersTable.title,
                triggerId: triggersTable.id,
            })
            .from(triggerFiresTable)
            .innerJoin(
                triggersTable,
                and(
                    eq(triggersTable.serverId, triggerFiresTable.serverId),
                    eq(triggersTable.id, triggerFiresTable.triggerId)
                )
            )
            .where(
                and(
                    eq(triggerFiresTable.serverId, input.serverId),
                    eq(triggerFiresTable.id, input.cause)
                )
            )
            .limit(1);
        if (!row) {
            throw new MessageCauseError(`No Trigger fire ${input.cause} exists on this Server.`);
        }
        if (row.ownerAgentId !== input.agentId) {
            throw new MessageCauseError(
                `Trigger fire ${input.cause} belongs to another Agent's Trigger.`
            );
        }
        return {
            anchorChatId: row.anchorChatId,
            // A Trigger's standing instruction rides `live`; it has no description.
            description: null,
            firedAt: row.firedAt,
            fireId: input.cause,
            kind: 'trigger_fire',
            ownerAgentId: row.ownerAgentId,
            summary: triggerKindSummary(row.kind),
            title: row.title,
            triggerId: row.triggerId,
        };
    }
    if (input.cause.startsWith('rmf_')) {
        const [row] = await db
            .select({
                anchorChatId: remindersTable.anchorChatId,
                description: remindersTable.description,
                firedAt: reminderFiresTable.firedAt,
                ownerAgentId: remindersTable.ownerAgentId,
                reminderId: remindersTable.id,
                repeat: remindersTable.repeat,
                title: remindersTable.title,
            })
            .from(reminderFiresTable)
            .innerJoin(
                remindersTable,
                and(
                    eq(remindersTable.serverId, reminderFiresTable.serverId),
                    eq(remindersTable.id, reminderFiresTable.reminderId)
                )
            )
            .where(
                and(
                    eq(reminderFiresTable.serverId, input.serverId),
                    eq(reminderFiresTable.id, input.cause)
                )
            )
            .limit(1);
        if (!row) {
            throw new MessageCauseError(`No Reminder fire ${input.cause} exists on this Server.`);
        }
        if (row.ownerAgentId !== input.agentId) {
            throw new MessageCauseError(
                `Reminder fire ${input.cause} belongs to another Agent's Reminder.`
            );
        }
        return {
            anchorChatId: row.anchorChatId,
            description: row.description,
            firedAt: row.firedAt,
            fireId: input.cause,
            kind: 'reminder_fire',
            ownerAgentId: row.ownerAgentId,
            reminderId: row.reminderId,
            summary: reminderCadenceSummary(row.repeat),
            title: row.title,
        };
    }
    throw new MessageCauseError(
        `${input.cause} is not a Trigger or Reminder fire id; use the fire id from the wake envelope.`
    );
}

export async function insertMessageCause(
    db: HausDatabase,
    input: {
        attribution: MessageCauseAttribution;
        cause: ResolvedMessageCause;
        messageId: string;
        serverId: string;
    }
): Promise<void> {
    const snapshot = {
        anchorChatId: input.cause.anchorChatId,
        attribution: input.attribution,
        description: input.cause.description,
        firedAt: input.cause.firedAt,
        messageId: input.messageId,
        ownerAgentId: input.cause.ownerAgentId,
        serverId: input.serverId,
        summary: input.cause.summary,
        title: input.cause.title,
    };
    await db
        .insert(messageCausesTable)
        .values(
            input.cause.kind === 'trigger_fire'
                ? {
                      ...snapshot,
                      kind: 'trigger_fire' as const,
                      triggerFireId: input.cause.fireId,
                      triggerId: input.cause.triggerId,
                  }
                : {
                      ...snapshot,
                      kind: 'reminder_fire' as const,
                      reminderFireId: input.cause.fireId,
                      reminderId: input.cause.reminderId,
                  }
        )
        .onConflictDoNothing();
}

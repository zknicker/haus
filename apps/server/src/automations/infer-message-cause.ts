import { and, eq, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, chatsTable } from '../postgres/schema.ts';
import {
    type AttributedMessageCause,
    MessageCauseError,
    resolveMessageCause,
} from './message-cause.ts';

/**
 * The cause of an Agent message: the fire its `--cause` names, refused with
 * `MessageCauseError` when unknown or another Agent's, or else the inferred one.
 * `haus message send` and `haus cloud-agent start --say` share this rule.
 */
export async function resolveAgentMessageCause(
    db: HausDatabase,
    input: { agentId: string; cause?: string; chatId: string; runId: string; serverId: string }
): Promise<AttributedMessageCause | undefined> {
    if (!input.cause) {
        return await inferMessageCause(db, input);
    }
    return {
        attribution: 'explicit',
        fire: await resolveMessageCause(db, {
            agentId: input.agentId,
            cause: input.cause,
            serverId: input.serverId,
        }),
    };
}

/**
 * The cause of an Agent message that carried no `--cause`.
 *
 * A fire is inferable only when it was the whole reason the run had anything to
 * say: the sending run was served exactly one inbox item, that item is the
 * fire, and the message landed in the fire's anchor Chat (a Thread resolves to
 * its parent). Any other shape — a second item, a human message alongside the
 * fire, an answer somewhere else — leaves the message unmarked rather than
 * guessing which item it answered.
 */
export async function inferMessageCause(
    db: HausDatabase,
    input: { agentId: string; chatId: string; runId: string; serverId: string }
): Promise<AttributedMessageCause | undefined> {
    const served = await db
        .select({ dedupeKey: agentInboxTable.dedupeKey, chatId: agentInboxTable.chatId })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, input.serverId),
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                isNotNull(agentInboxTable.servedAt)
            )
        )
        .limit(2);
    const [item] = served;
    if (!item || served.length !== 1 || !isFireIdentity(item.dedupeKey)) {
        return undefined;
    }
    if (item.chatId !== (await anchorChatId(db, input))) {
        return undefined;
    }
    try {
        return {
            attribution: 'inferred',
            fire: await resolveMessageCause(db, {
                agentId: input.agentId,
                cause: item.dedupeKey,
                serverId: input.serverId,
            }),
        };
    } catch (cause) {
        // A fire whose automation is gone leaves the message unmarked; nothing
        // about a missing cause should fail the send.
        if (cause instanceof MessageCauseError) {
            return undefined;
        }
        throw cause;
    }
}

function isFireIdentity(dedupeKey: string): boolean {
    return dedupeKey.startsWith('trf_') || dedupeKey.startsWith('rmf_');
}

/** A Thread answers for its parent Chat; every other Chat answers for itself. */
async function anchorChatId(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
): Promise<string> {
    const [chat] = await db
        .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (chat?.kind === 'thread' && chat.parentChatId) {
        return chat.parentChatId;
    }
    return input.chatId;
}

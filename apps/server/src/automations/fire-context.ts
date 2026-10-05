import {
    type AutomationFireContext,
    automationPayloadExcerptMaxChars,
    automationSnippetMaxChars,
    type MessageCause,
} from '@haus/api';
import { and, count, eq, lte } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatMessagesTable,
    messageCausesTable,
    reminderFiresTable,
    remindersTable,
    triggerFiresTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readMessageCauses } from './message-cause-read.ts';

export class AutomationFireContextNotFoundError extends Error {
    constructor() {
        super('That message has no automation provenance.');
        this.name = 'AutomationFireContextNotFoundError';
    }
}

/**
 * The Thread pane's context card for one caused message: the same provenance
 * the cause line shows, plus the fire's own detail. Authorization is ordinary
 * Chat access — anyone who can read the message can see why it was written.
 *
 * A message with a cause always has a context. Once the automation or its fire
 * has been archived the card falls back to the snapshot the cause carries: the
 * mark's own fields stand, and every counter and kind-specific detail the fire
 * row held reads null.
 */
export async function readAutomationFireContext(
    db: HausDatabase,
    member: HausUser | null,
    input: { messageId: string; serverId: string }
): Promise<AutomationFireContext> {
    const [message] = await db
        .select({
            anchorChatId: messageCausesTable.anchorChatId,
            chatId: chatMessagesTable.chatId,
        })
        .from(chatMessagesTable)
        .innerJoin(
            messageCausesTable,
            and(
                eq(messageCausesTable.serverId, chatMessagesTable.serverId),
                eq(messageCausesTable.messageId, chatMessagesTable.id)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!message) {
        throw new AutomationFireContextNotFoundError();
    }
    await requireChatAccess(db, member, { chatId: message.chatId, serverId: input.serverId });
    const cause = (await readMessageCauses(db, input.serverId, [input.messageId])).get(
        input.messageId
    );
    if (!cause) {
        throw new AutomationFireContextNotFoundError();
    }
    // A pre-snapshot cause has no anchor of its own; the answer's own Chat is
    // the closest true thing we know about where the automation spoke.
    const anchorChatId = message.anchorChatId ?? message.chatId;
    if (!cause.live) {
        return archivedFireContext(cause, anchorChatId);
    }
    return cause.kind === 'trigger'
        ? await triggerFireContext(db, input.serverId, cause, anchorChatId)
        : await reminderFireContext(db, input.serverId, cause, anchorChatId);
}

/** The context of a caused message whose automation or fire row is gone. */
function archivedFireContext(cause: MessageCause, anchorChatId: string): AutomationFireContext {
    return {
        anchorChatId,
        anchorExcerpt: null,
        anchorMessageId: null,
        cause,
        contentType: null,
        firedAt: cause.firedAt,
        fireOrdinal: null,
        fireTotal: null,
        nextFireAt: null,
        payload: null,
        payloadBytes: null,
        payloadTruncated: false,
        repeat: null,
    };
}

async function triggerFireContext(
    db: HausDatabase,
    serverId: string,
    cause: MessageCause,
    anchorChatId: string
): Promise<AutomationFireContext> {
    const [fire] = await db
        .select({
            contentType: triggerFiresTable.contentType,
            payload: triggerFiresTable.payload,
            payloadBytes: triggerFiresTable.payloadBytes,
            receivedAt: triggerFiresTable.receivedAt,
        })
        .from(triggerFiresTable)
        .where(
            and(eq(triggerFiresTable.serverId, serverId), eq(triggerFiresTable.id, cause.fireId))
        )
        .limit(1);
    if (!fire) {
        return archivedFireContext(cause, anchorChatId);
    }
    const [ordinal] = await db
        .select({ total: count() })
        .from(triggerFiresTable)
        .where(
            and(
                eq(triggerFiresTable.serverId, serverId),
                eq(triggerFiresTable.triggerId, cause.automationId),
                lte(triggerFiresTable.receivedAt, fire.receivedAt)
            )
        );
    const [stored] = await db
        .select({ total: count() })
        .from(triggerFiresTable)
        .where(
            and(
                eq(triggerFiresTable.serverId, serverId),
                eq(triggerFiresTable.triggerId, cause.automationId)
            )
        );
    const payload = fire.payload.slice(0, automationPayloadExcerptMaxChars);
    return {
        anchorChatId,
        anchorExcerpt: null,
        anchorMessageId: null,
        cause,
        contentType: fire.contentType,
        firedAt: cause.firedAt,
        fireOrdinal: Math.max(ordinal?.total ?? 1, 1),
        // Stored fires are pruned; the Trigger's own counter is the honest total.
        fireTotal: Math.max(cause.live?.fireCount ?? 1, stored?.total ?? 1, 1),
        nextFireAt: null,
        payload,
        payloadBytes: fire.payloadBytes,
        payloadTruncated: payload.length < fire.payload.length,
        repeat: null,
    };
}

async function reminderFireContext(
    db: HausDatabase,
    serverId: string,
    cause: MessageCause,
    anchorChatId: string
): Promise<AutomationFireContext> {
    const [fire] = await db
        .select({
            anchorContent: chatMessagesTable.content,
            anchorMessageId: remindersTable.anchorMessageId,
            fireAt: remindersTable.fireAt,
            firedAt: reminderFiresTable.firedAt,
            repeat: remindersTable.repeat,
            status: remindersTable.status,
        })
        .from(reminderFiresTable)
        .innerJoin(
            remindersTable,
            and(
                eq(remindersTable.serverId, reminderFiresTable.serverId),
                eq(remindersTable.id, reminderFiresTable.reminderId)
            )
        )
        .leftJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, remindersTable.serverId),
                eq(chatMessagesTable.id, remindersTable.anchorMessageId)
            )
        )
        .where(
            and(eq(reminderFiresTable.serverId, serverId), eq(reminderFiresTable.id, cause.fireId))
        )
        .limit(1);
    if (!fire) {
        return archivedFireContext(cause, anchorChatId);
    }
    const [ordinal] = await db
        .select({ total: count() })
        .from(reminderFiresTable)
        .where(
            and(
                eq(reminderFiresTable.serverId, serverId),
                eq(reminderFiresTable.reminderId, cause.automationId),
                lte(reminderFiresTable.firedAt, fire.firedAt)
            )
        );
    return {
        anchorChatId,
        anchorExcerpt: fire.anchorContent
            ? fire.anchorContent.trim().slice(0, automationSnippetMaxChars)
            : null,
        anchorMessageId: fire.anchorMessageId,
        cause,
        contentType: null,
        firedAt: cause.firedAt,
        fireOrdinal: Math.max(ordinal?.total ?? 1, 1),
        fireTotal: Math.max(cause.live?.fireCount ?? 1, 1),
        nextFireAt: fire.status === 'scheduled' ? fire.fireAt.toISOString() : null,
        payload: null,
        payloadBytes: null,
        payloadTruncated: false,
        repeat: fire.repeat,
    };
}

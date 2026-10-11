import type { AttachmentMetadata, HausAgentMessage, MessageBodyKind } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { replayCloudAgentWorkLinks } from './cloud-agent-work-links.ts';
import { readInlineReplyContext } from './reply-context.ts';
import type { SendAgentMessageInput, SendAgentMessageResult } from './send-agent-message.ts';
import { AgentSendConflictError } from './send-agent-message-errors.ts';

export async function readExistingAgentMessage(
    db: Pick<HausDatabase, 'select'>,
    input: SendAgentMessageInput
) {
    const [existing] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            bodyKind: chatMessagesTable.bodyKind,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            id: chatMessagesTable.id,
            nonce: chatMessagesTable.nonce,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
            runId: chatMessagesTable.runId,
            sequence: chatMessagesTable.sequence,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.nonce, input.nonce)
            )
        )
        .limit(1);
    return existing;
}

type ExistingAgentMessage = NonNullable<Awaited<ReturnType<typeof readExistingAgentMessage>>>;

export async function replayAgentMessage(
    db: Pick<HausDatabase, 'select'>,
    input: SendAgentMessageInput,
    agent: { description: string | null; displayName: string; handle: string },
    existing: ExistingAgentMessage,
    canonical: string,
    replyParentId: string | null
): Promise<SendAgentMessageResult> {
    const content = await replayCloudAgentWorkLinks(db, {
        content: canonical,
        messageId: existing.id,
        serverId: input.serverId,
    });
    const existingAttachments =
        (await readMessageAttachments(db, input.serverId, [existing.id])).get(existing.id) ?? [];
    if (
        existing.authorAgentId !== input.agentId ||
        existing.content !== content ||
        (existing.replyToMessageId ?? null) !== replyParentId ||
        existingAttachments.map(({ id }) => id).join('\0') !== input.attachmentIds.join('\0')
    ) {
        throw new AgentSendConflictError();
    }
    return {
        activities: [],
        events: [],
        message: toAgentCliMessage(existing, {
            ...agent,
            agentId: input.agentId,
            attachments: existingAttachments,
            chatId: input.chatId,
            reply: await readInlineReplyContext(db, input.serverId, existing),
        }),
        receipt: {
            chatId: input.chatId,
            idempotent: true,
            messageId: existing.id,
            sequence: existing.sequence,
            target: input.target,
        },
        wakes: [],
    };
}

export function toAgentCliMessage(
    message: {
        bodyKind: MessageBodyKind;
        content: string;
        createdAt: Date;
        id: string;
        nonce: string;
        replyRootMessageId?: string | null;
        replyToMessageId?: string | null;
        sequence: number;
    },
    agent: {
        agentId: string;
        attachments: AttachmentMetadata[];
        chatId: string;
        description: string | null;
        displayName: string;
        handle: string;
        reply?: HausAgentMessage['reply'];
    }
): HausAgentMessage {
    return {
        attachments: agent.attachments,
        author: {
            id: agent.agentId,
            kind: 'agent',
            label: agent.displayName,
            metadata: {},
        },
        body_kind: message.bodyKind,
        chat_id: agent.chatId,
        content: message.content,
        created_at: message.createdAt.toISOString(),
        deleted_at: null,
        delivery_id: null,
        id: message.id,
        metadata: {},
        nonce: message.nonce,
        reply: agent.reply ?? null,
        role: 'assistant',
        sender: { description: agent.description, handle: agent.handle, type: 'agent' },
        sequence: message.sequence,
    };
}

import type { ChatMessagesInput, chatMessagePageSchema } from '@haus/api';
import { and, eq, or, type SQL } from 'drizzle-orm';
import type * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { listTaskPreviews } from '../tasks/task-previews.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireChatAccess } from './chat-access.ts';
import { projectChatMessages } from './project-messages.ts';
import { resolveInlineReplyParent } from './reply-context.ts';
import { selectMessagePage } from './select-message-page.ts';

type ChatMessagePage = z.output<typeof chatMessagePageSchema>;

export async function listChatMessages(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatMessagesInput
): Promise<ChatMessagePage> {
    const chatKind = (await requireChatAccess(db, member, input)).kind;
    const predicates = await buildMessagePredicates(db, input);
    // Read before the page: a message committed after this read lands above the
    // reported scan position, so the next tail read still finds it.
    const chatSequence = await readChatSequence(db, input);
    const page = await selectMessagePage(db, predicates, input);
    const lastSequence = page.messages.at(-1)?.sequence ?? 0;
    const messages = await projectChatMessages(db, input, page.messages);

    return {
        messages,
        nextAfterSequence: page.nextAfterSequence,
        nextBeforeSequence: page.nextBeforeSequence,
        // A page that reaches the newest match examined the whole Chat up to its
        // head; a filtered read can scan past its last match (inline replies).
        scannedThroughSequence:
            page.nextAfterSequence === null ? Math.max(chatSequence, lastSequence) : lastSequence,
        tasks:
            chatKind !== 'task' && member
                ? await listTaskPreviews(db, member.id, {
                      chatId: input.chatId,
                      originMessageIds: messages.map((message) => message.id),
                      serverId: input.serverId,
                  })
                : [],
    };
}

async function buildMessagePredicates(db: HausDatabase, input: ChatMessagesInput) {
    const predicates: SQL<unknown>[] = [
        eq(chatMessagesTable.serverId, input.serverId),
        eq(chatMessagesTable.chatId, input.chatId),
    ];

    if (input.replyRootMessageId) {
        const { root } = await resolveInlineReplyParent(db, {
            chatId: input.chatId,
            replyToMessageId: input.replyRootMessageId,
            serverId: input.serverId,
        });
        const inChain = or(
            eq(chatMessagesTable.id, root.id),
            eq(chatMessagesTable.replyRootMessageId, root.id)
        );
        if (inChain) {
            predicates.push(inChain);
        }
    }

    return predicates;
}

async function readChatSequence(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
): Promise<number> {
    const [chat] = await db
        .select({ sequence: chatsTable.lastMessageSequence })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    return chat?.sequence ?? 0;
}

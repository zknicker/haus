import type { ChatMessage, ThreadSummary } from '@haus/api';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readMessageCauses } from '../automations/message-cause-read.ts';
import { readLinkedCloudAgentWork } from '../cloud-agents/linked-cloud-agent-work.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { listMessageTaskMap } from '../tasks/task-shape.ts';
import { listThreadSummaries } from '../threads/list-thread-summaries.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readMessageBodies } from './message-bodies.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readStoredAuthorProfile, toChatMessage } from './message-shape.ts';
import { readInlineReplyContexts } from './reply-context.ts';
import type { SelectedMessageRow } from './select-message-page.ts';

/**
 * The one canonical transcript projection (specs/realtime-events.md): every
 * `chat.messages` page and every `chat.message` entity goes through here, so a
 * message and its viewer's Thread summary read the same from either.
 */
export async function projectChatMessages(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; serverId: string },
    rows: SelectedMessageRow[]
): Promise<{ messages: ChatMessage[]; threads: ThreadSummary[] }> {
    const messageIds = rows.map((message) => message.id);
    const [
        attachmentsByMessageId,
        taskByMessageId,
        causeByMessageId,
        bodyByMessageId,
        workByMessageId,
        imageGenerationsByMessageId,
        reactionsByMessageId,
        replyByMessageId,
    ] = await Promise.all([
        readMessageAttachments(db, input.serverId, messageIds),
        listMessageTaskMap(db, input.serverId, messageIds),
        readMessageCauses(db, input.serverId, messageIds),
        readMessageBodies(db, input.serverId, messageIds),
        readLinkedCloudAgentWork(db, input.serverId, messageIds),
        readLinkedImageGenerations(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        readInlineReplyContexts(db, input.serverId, rows),
    ]);
    const messages = rows.map((message) => ({
        ...toChatMessage(message, {
            attachments: attachmentsByMessageId.get(message.id) ?? [],
            authorProfile: readStoredAuthorProfile(message),
            body: bodyByMessageId.get(message.id),
            cause: causeByMessageId.get(message.id),
            cloudAgentWork: workByMessageId.get(message.id),
            imageGenerations: imageGenerationsByMessageId.get(message.id),
            reactions: reactionsByMessageId.get(message.id),
            reply: replyByMessageId.get(message.id) ?? null,
        }),
        task: taskByMessageId.get(message.id) ?? null,
    }));

    return {
        messages,
        threads: await listThreadSummaries(db, member, {
            anchorMessageIds: messageIds,
            parentChatId: input.chatId,
            serverId: input.serverId,
        }),
    };
}

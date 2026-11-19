import type { ChatMessage } from '@haus/api';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readMessageCauses } from '../automations/message-cause-read.ts';
import { listMessageClaimMap } from '../claims/claim-shape.ts';
import { readMessageDriveCitations } from '../drive/citations.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { readMessageTaskLinks } from '../tasks/task-reference-links.ts';
import { readLinkedWorker } from '../workers/linked-worker.ts';
import { readMessageBodies } from './message-bodies.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readStoredAuthorProfile, toChatMessage } from './message-shape.ts';
import { readInlineReplyContexts } from './reply-context.ts';
import type { SelectedMessageRow } from './select-message-page.ts';

/**
 * The one canonical transcript projection (specs/realtime-events.md): every
 * `chat.messages` page and every `chat.message` entity goes through here, so a
 * message reads the same from either.
 */
export async function projectChatMessages(
    db: HausDatabase,
    input: { chatId: string; serverId: string },
    rows: SelectedMessageRow[]
): Promise<ChatMessage[]> {
    const messageIds = rows.map((message) => message.id);
    const [
        attachmentsByMessageId,
        claimByMessageId,
        causeByMessageId,
        bodyByMessageId,
        workByMessageId,
        imageGenerationsByMessageId,
        reactionsByMessageId,
        replyByMessageId,
        taskLinksByMessageId,
        citationsByMessageId,
    ] = await Promise.all([
        readMessageAttachments(db, input.serverId, messageIds),
        listMessageClaimMap(db, input.serverId, messageIds),
        readMessageCauses(db, input.serverId, messageIds),
        readMessageBodies(db, input.serverId, messageIds),
        readLinkedWorker(db, input.serverId, messageIds),
        readLinkedImageGenerations(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        readInlineReplyContexts(db, input.serverId, rows),
        readMessageTaskLinks(db, input.serverId, messageIds),
        readMessageDriveCitations(db, input.serverId, messageIds),
    ]);
    return rows.map((message) => ({
        ...toChatMessage(message, {
            attachments: attachmentsByMessageId.get(message.id) ?? [],
            authorProfile: readStoredAuthorProfile(message),
            body: bodyByMessageId.get(message.id),
            cause: causeByMessageId.get(message.id),
            workers: workByMessageId.get(message.id),
            driveCitations: citationsByMessageId.get(message.id),
            imageGenerations: imageGenerationsByMessageId.get(message.id),
            reactions: reactionsByMessageId.get(message.id),
            reply: replyByMessageId.get(message.id) ?? null,
            taskLinks: taskLinksByMessageId.get(message.id),
        }),
        claim: claimByMessageId.get(message.id) ?? null,
    }));
}

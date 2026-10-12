import { withLocalTimelineMessageMetadata } from '../../chats/local-timeline-message.ts';
import { localAttachmentItems } from './attachment-view.ts';
import type { ProjectedChatMessageRow } from './chat-message-model.ts';
import { MessageAttachments, type MessageSharedArtifacts } from './message-attachments.tsx';
import type { PendingChatMessage } from './use-pending-messages.ts';

/**
 * Projects local sends into the same transcript input as durable messages.
 * The transcript therefore owns ordering, grouping, and shared turn chrome for
 * both representations instead of reconciling two independently rendered lists.
 */
export function projectPendingChatMessageRows(
    messages: readonly PendingChatMessage[],
    viewerUserId: string
): ProjectedChatMessageRow[] {
    const actor = { id: viewerUserId, kind: 'participant' as const };
    // Sends are append-only from the sender's seat. Adopting the Server's time
    // could otherwise sort a settled row before a still-pending later one when
    // the two clocks disagree, visibly swapping two of the sender's messages.
    let notBefore = '';

    return messages.map((message) => {
        const id = `pending:${message.nonce}`;
        const sentAt = message.createdAt ?? message.submittedAt;
        notBefore = sentAt > notBefore ? sentAt : notBefore;

        return {
            actor,
            connectsToNext: false,
            connectsToPrevious: false,
            id,
            isFirstInGroup: true,
            kind: 'message',
            message: {
                actor,
                content: message.content,
                id,
                metadata: withLocalTimelineMessageMetadata(),
                reply: message.reply ?? null,
                sendNonce: message.nonce,
                sender: 'You',
                senderType: 'user',
                sourceSessionId: null,
                sourceSessionKey: 'hosted:human',
                task: null,
                // The Server's own creation time as soon as the receipt names
                // it, so the turn header's time never changes on confirmation.
                timestamp: notBefore,
            },
            thread: null,
        } satisfies ProjectedChatMessageRow;
    });
}

/**
 * Null, never an empty strip: a media slot with nothing in it is height the
 * durable row does not have, so the row would shrink the moment the Server
 * confirmed it. Staged files render through the same strip as durable ones,
 * drawn from the File itself, with no download action: the bytes are still on
 * their way up. Linked library artifacts ride along exactly as they will once
 * the send is confirmed.
 */
export function renderPendingMessageAttachments(
    message: PendingChatMessage,
    sharedArtifacts: MessageSharedArtifacts | null = null
) {
    return message.attachments.length === 0 && !sharedArtifacts ? null : (
        <MessageAttachments
            attachments={localAttachmentItems(message.attachments)}
            sharedArtifacts={sharedArtifacts}
        />
    );
}

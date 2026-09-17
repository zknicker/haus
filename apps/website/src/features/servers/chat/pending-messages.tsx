import type { AttachmentMetadata } from '@haus/api';
import { Attachment01Icon } from '@hugeicons-pro/core-stroke-rounded';
import {
    Attachment,
    AttachmentContent,
    AttachmentMedia,
    AttachmentTitle,
} from '../../../components/chats/attachment.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { withLocalTimelineMessageMetadata } from '../../chats/local-timeline-message.ts';
import type { ProjectedChatMessageRow } from './chat-message-model.ts';
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

    return messages.map((message) => {
        const id = `pending:${message.nonce}`;

        return {
            actor,
            connectsToNext: false,
            connectsToPrevious: false,
            id,
            isFirstInGroup: true,
            kind: 'message',
            message: {
                actor,
                attachments: [],
                content: message.content,
                id,
                metadata: withLocalTimelineMessageMetadata(),
                reply: message.reply ?? null,
                sender: 'You',
                senderType: 'user',
                sourceSessionId: null,
                sourceSessionKey: 'hosted:human',
                task: null,
                timestamp: message.submittedAt,
            },
            thread: null,
        } satisfies ProjectedChatMessageRow;
    });
}

// Named, not downloadable: the bytes are still on their way up, so the pending
// row carries no download action for the durable row's to collide with.
export function PendingMessageAttachments({
    attachments,
}: {
    attachments: readonly AttachmentMetadata[];
}) {
    if (attachments.length === 0) {
        return null;
    }

    return (
        <>
            {attachments.map((attachment) => (
                <Attachment key={attachment.id} size="sm">
                    <AttachmentMedia>
                        <Icon icon={Attachment01Icon} />
                    </AttachmentMedia>
                    <AttachmentContent>
                        <AttachmentTitle>{attachment.filename}</AttachmentTitle>
                    </AttachmentContent>
                </Attachment>
            ))}
        </>
    );
}

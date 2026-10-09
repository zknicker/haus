import * as React from 'react';
import {
    ChatTranscriptMessageContent,
    renderTranscriptMessageAttachments,
} from './chat-transcript-message.tsx';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';
import type { TranscriptItem } from './chat-transcript-model.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { InlineReplyMessageSurface } from './inline-reply-action.tsx';
import { isLocalTimelineMessageMetadata } from './local-timeline-message.ts';

interface UserTurnItemProps {
    from: 'assistant' | 'user';
    item: TranscriptItem;
}

/**
 * One message in a person's turn. The transcript model wraps every row in a
 * fresh item on each build, but the rows keep their identity, so the item
 * compares by row: a new message in a run of sends renders itself, not every
 * message above it in the turn.
 */
export const UserTurnItem = React.memo(function UserTurnItem({ from, item }: UserTurnItemProps) {
    return <UserTurnItemView from={from} item={item} />;
}, sameUserTurnItem);

function sameUserTurnItem(previous: UserTurnItemProps, next: UserTurnItemProps) {
    if (previous.from !== next.from) {
        return false;
    }
    if (previous.item === next.item) {
        return true;
    }
    return (
        previous.item.kind === 'row' &&
        next.item.kind === 'row' &&
        previous.item.row === next.item.row
    );
}

function UserTurnItemView({ from, item }: UserTurnItemProps) {
    const context = useTranscriptRenderContextOptional();

    if (item.kind !== 'row' || item.row.kind !== 'message') {
        return null;
    }

    const message = item.row.message;
    const attachments = context?.renderMessageAttachments
        ? context.renderMessageAttachments(message)
        : renderTranscriptMessageAttachments(message.attachments);
    const body = context?.renderMessageContent ? (
        context.renderMessageContent(message)
    ) : (
        <ChatTranscriptMessageContent message={message} textClassName="text-current" />
    );

    if (!body) {
        return null;
    }

    // A send renders exactly as it will once the Server confirms it, through
    // the same surface, so the confirmation swap changes no DOM and no pixels.
    // The data-slot is the only trace, and it is a test hook, not a treatment.
    return (
        <InlineReplyMessageSurface row={item.row}>
            <TranscriptMessageBlock
                attachments={attachments}
                data-slot={
                    isLocalTimelineMessageMetadata(message.metadata)
                        ? 'pending-chat-message'
                        : undefined
                }
                from={from}
            >
                {body}
            </TranscriptMessageBlock>
        </InlineReplyMessageSurface>
    );
}

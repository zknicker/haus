import {
    ChatTranscriptMessageContent,
    renderTranscriptMessageAttachments,
} from './chat-transcript-message.tsx';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';
import type { TranscriptItem } from './chat-transcript-model.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { InlineReplyMessageSurface } from './inline-reply-action.tsx';
import { isLocalTimelineMessageMetadata } from './local-timeline-message.ts';

export function UserTurnItem({ from, item }: { from: 'assistant' | 'user'; item: TranscriptItem }) {
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

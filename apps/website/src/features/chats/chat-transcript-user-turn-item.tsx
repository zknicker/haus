import { getTranscriptItemKey } from './chat-transcript-item-utils.ts';
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
    const animateLiveEnter = useLiveEdgeMessageEnter(item);
    const context = useTranscriptRenderContextOptional();

    if (item.kind !== 'row' || item.row.kind !== 'message') {
        return null;
    }

    const message = item.row.message;
    const pending = isLocalTimelineMessageMetadata(message.metadata);
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

    const block = (
        <TranscriptMessageBlock
            {...(pending ? { animate: { opacity: 0.7, scale: 1, y: 0 } } : {})}
            animateEnter={pending || animateLiveEnter}
            attachments={attachments}
            data-slot={pending ? 'pending-chat-message' : undefined}
            from={from}
        >
            {body}
        </TranscriptMessageBlock>
    );

    return pending ? (
        block
    ) : (
        <InlineReplyMessageSurface row={item.row}>{block}</InlineReplyMessageSurface>
    );
}

// Whether this item is a message landing at the transcript's live edge right
// now; such messages animate in instead of popping. Always false outside the
// transcript (the turn drawer).
export function useLiveEdgeMessageEnter(item: TranscriptItem) {
    const context = useTranscriptRenderContextOptional();

    if (!(context && item.kind === 'row' && item.row.kind === 'message')) {
        return false;
    }

    const timestampMs = Date.parse(item.row.message.timestamp);

    return context.shouldAnimateItemEnter(
        getTranscriptItemKey(item),
        Number.isNaN(timestampMs) ? null : timestampMs
    );
}

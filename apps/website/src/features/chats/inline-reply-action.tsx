import { ChatMessage } from '@heroui-pro/react';
import { ReplyIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { ActionTooltip } from './chat-action-tooltip.tsx';
import type { TranscriptItem } from './chat-transcript-model.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { isThreadAnchorRow } from './thread/thread-anchor.ts';
import { ThreadMessageSurface } from './thread/thread-message-surface.tsx';
import type { TranscriptMessageRow } from './transcript-contract.ts';

interface InlineReplyHoverState {
    clear: () => void;
    row: TranscriptMessageRow | null;
    setHoveredMessageId: (messageId: string) => void;
}

const InlineReplyHoverContext = React.createContext<InlineReplyHoverState | null>(null);

export function useInlineReplyHoverState(
    items: readonly TranscriptItem[],
    fallback: TranscriptMessageRow | null
) {
    const [hoveredMessageId, setHoveredMessageId] = React.useState<string | null>(null);
    const row = getInlineReplyTargetRow(items, hoveredMessageId, fallback);
    const clear = React.useCallback(() => setHoveredMessageId(null), []);
    const setHovered = React.useCallback((messageId: string) => setHoveredMessageId(messageId), []);

    return React.useMemo(
        () => ({ clear, row, setHoveredMessageId: setHovered }),
        [clear, row, setHovered]
    );
}

/** Selects the hovered durable message, falling back to the turn's last row. */
export function getInlineReplyTargetRow(
    items: readonly TranscriptItem[],
    hoveredMessageId: string | null,
    fallback: TranscriptMessageRow | null
): TranscriptMessageRow | null {
    const hoveredRow = getMessageRow(items, hoveredMessageId);
    return hoveredRow && isThreadAnchorRow(hoveredRow) ? hoveredRow : fallback;
}

export function InlineReplyHoverProvider({
    children,
    state,
}: {
    children: React.ReactNode;
    state: InlineReplyHoverState;
}) {
    return <InlineReplyHoverContext value={state}>{children}</InlineReplyHoverContext>;
}

/** Adds the per-message hover target used by the turn's shared action bar. */
export function InlineReplyMessageSurface({
    children,
    row,
}: {
    children: React.ReactNode;
    row: TranscriptMessageRow;
}) {
    const hover = React.useContext(InlineReplyHoverContext);

    return (
        <ThreadMessageSurface
            onMessageHover={hover ? () => hover.setHoveredMessageId(row.message.id) : undefined}
            row={row}
        >
            {children}
        </ThreadMessageSurface>
    );
}

/** The inline reply action follows the message currently under the turn. */
export function InlineReplyAction({ className }: { className?: string }) {
    const context = useTranscriptRenderContextOptional();
    const row = React.useContext(InlineReplyHoverContext)?.row;

    if (!(context?.onSelectInlineReply && row && isThreadAnchorRow(row))) {
        return null;
    }

    return (
        <ActionTooltip label="Reply">
            <ChatMessage.Action
                aria-label="Reply"
                className={className}
                onPress={() => context.onSelectInlineReply?.(row.message)}
            >
                <Icon icon={ReplyIcon} />
            </ChatMessage.Action>
        </ActionTooltip>
    );
}

function getMessageRow(
    items: readonly TranscriptItem[],
    messageId: string | null
): TranscriptMessageRow | null {
    if (!messageId) {
        return null;
    }

    for (const item of items) {
        if (item.kind !== 'row' || item.row.kind !== 'message') {
            continue;
        }
        if (item.row.message.id === messageId) {
            return item.row;
        }
    }

    return null;
}

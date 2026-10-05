import { useMessageScroller } from '../../components/chats/message-scroller.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { cn } from '../../lib/utils.ts';
import type { TranscriptTurnEntry } from './chat-transcript-model.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { messagePreviewLine } from './message-preview-line.ts';
import type { TranscriptReplyReference } from './transcript-reply-contract.ts';
import { TurnContextLine, turnContextLineContentClassName } from './turn-context-line.tsx';

type OpenInlineReply = (
    reference: TranscriptReplyReference,
    scrollToMessage: (id: string) => boolean
) => void;

/**
 * The parent this turn replies to, when its reference line should show. A
 * same-author follow-up to the same parent skips it (markRepeatedReplyReferences).
 */
export function useTurnReplyReference(
    entry: TranscriptTurnEntry
): { onOpen: OpenInlineReply; reference: TranscriptReplyReference } | null {
    const context = useTranscriptRenderContextOptional();
    const message = entry.items.find((item) => item.kind === 'row' && item.row.kind === 'message');
    const reply =
        message?.kind === 'row' && message.row.kind === 'message'
            ? message.row.message.reply
            : null;
    if (!(reply && entry.showReplyReference && context?.onOpenInlineReply)) {
        return null;
    }
    return { onOpen: context.onOpenInlineReply, reference: reply.parent };
}

export function NavigableInlineReply({
    reference,
    onOpen,
}: {
    reference: TranscriptReplyReference;
    onOpen: OpenInlineReply;
}) {
    const { scrollToMessage } = useMessageScroller();
    return (
        <InlineReplyPreview
            onPress={() =>
                onOpen(reference, (id) =>
                    scrollToMessage(id, { align: 'center', behavior: 'instant' })
                )
            }
            reference={reference}
        />
    );
}

export function InlineReplyPreview({
    onPress,
    reference,
}: {
    onPress: () => void;
    reference: TranscriptReplyReference;
}) {
    const author = replyAuthorName(reference.author);
    const excerpt = messagePreviewLine(reference.content) || 'Attachment';
    return (
        <TurnContextLine>
            <button
                aria-label={`Jump to ${author}'s message: ${excerpt}`}
                className={cn(
                    turnContextLineContentClassName,
                    'w-full cursor-(--cursor-interactive) text-muted hover:text-foreground'
                )}
                data-inline-reply-preview=""
                onClick={onPress}
                type="button"
            >
                <EntityAvatar name={author} size={16} src={reference.author.profile?.avatarUrl} />
                <span className="max-w-40 shrink-0 truncate font-medium">{author}</span>
                <span className="min-w-0 truncate" title={excerpt}>
                    {excerpt}
                </span>
            </button>
        </TurnContextLine>
    );
}

export function replyAuthorName(author: TranscriptReplyReference['author']) {
    if (author.kind === 'agent') {
        return author.profile?.displayName ?? author.agentId;
    }
    return author.profile?.displayName ?? author.userId;
}

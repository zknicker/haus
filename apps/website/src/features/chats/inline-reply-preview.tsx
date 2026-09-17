import { useMessageScroller } from '../../components/chats/message-scroller.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import type { TranscriptItem } from './chat-transcript-model.ts';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { messagePreviewLine } from './message-preview-line.ts';
import type { TranscriptReplyReference } from './transcript-reply-contract.ts';

/** The reference precedes the turn's identity, with the elbow in its avatar rail. */
export function InlineReplyTurnHeader({ items }: { items: readonly TranscriptItem[] }) {
    const context = useTranscriptRenderContextOptional();
    const message = items.find((item) => item.kind === 'row' && item.row.kind === 'message');
    const reply =
        message?.kind === 'row' && message.row.kind === 'message'
            ? message.row.message.reply
            : null;
    if (!(reply && context?.onOpenInlineReply)) {
        return null;
    }
    return <NavigableInlineReply onOpen={context.onOpenInlineReply} reference={reply.parent} />;
}

function NavigableInlineReply({
    reference,
    onOpen,
}: {
    reference: TranscriptReplyReference;
    onOpen: (reference: TranscriptReplyReference, scrollToMessage: (id: string) => boolean) => void;
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
        <div className="relative min-w-0 pt-1 pl-11">
            <span
                aria-hidden="true"
                className="absolute top-3 left-4 size-4 rounded-tl-lg border-separator border-t-2 border-l-2"
            />
            <button
                aria-label={`Jump to ${author}'s message: ${excerpt}`}
                className="flex w-full min-w-0 cursor-(--cursor-interactive) items-center gap-1.5 text-left text-muted text-xs hover:text-foreground"
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
        </div>
    );
}

export function replyAuthorName(author: TranscriptReplyReference['author']) {
    if (author.kind === 'agent') {
        return author.profile?.displayName ?? author.agentId;
    }
    return author.profile?.displayName ?? author.userId;
}

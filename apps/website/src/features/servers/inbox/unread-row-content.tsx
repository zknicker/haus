import type { ChatUnreadPreview } from '@haus/api';
import { Button } from '@heroui/react';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useUnreadPreview } from '../../../hooks/inbox/use-unread-previews.ts';
import { UnreadRowMessages } from './unread-row-messages.tsx';
import { earlierUnread } from './unread-row-model.ts';

/**
 * What an open row says under its source line: the newest waiting message,
 * rendered as the conversation renders it, and "N earlier" above it when more
 * is waiting (ADR 0050). The newest message is what the reader answers, so it
 * is the one the row shows; "N earlier" first reveals the other waiting
 * messages the preview carries, in place, and past those opens the
 * conversation at its first unread message.
 *
 * Blank until the previews settle — the source line already names the row,
 * and an unsettled read is not an empty one. A settled read that does not
 * name this row yet (it arrived a moment before the previews refetch that
 * will) quotes the row's one line.
 */
export function UnreadRowContent({
    chatId,
    conversationChatId,
    fallbackLine,
    onOpen,
    serverId,
}: {
    /** The Chat the waiting messages live in: the Channel or DM, or the Thread's own Chat. */
    chatId: string;
    /** The Channel or DM the messages belong to; a Thread names its parent. */
    conversationChatId: string;
    fallbackLine: string;
    /** Opens the conversation, which lands on its first unread message. */
    onOpen: () => void;
    serverId: string;
}) {
    const preview = useUnreadPreview(serverId, chatId);
    const [revealed, setRevealed] = useState(false);

    if (preview === undefined) {
        return null;
    }
    if (preview === null) {
        return <p className="truncate px-4 pb-3 text-muted text-sm">{fallbackLine}</p>;
    }
    const earlier = earlierUnread(preview, revealed);
    return (
        <div className="flex min-w-0 flex-col pb-1">
            {earlier ? (
                <div className="px-4">
                    {earlier.action === 'reveal' ? (
                        <Button onPress={() => setRevealed(true)} size="sm" variant="ghost">
                            {earlier.label}
                        </Button>
                    ) : (
                        <Button onPress={onOpen} size="sm" variant="ghost" {...opensPlace}>
                            {earlier.label}
                        </Button>
                    )}
                </div>
            ) : null}
            {revealed ? (
                <UnreadRowMessages
                    chatId={chatId}
                    conversationChatId={conversationChatId}
                    messages={preview.messages}
                    onOpenConversation={onOpen}
                    serverId={serverId}
                />
            ) : (
                <NewestMessage
                    chatId={chatId}
                    conversationChatId={conversationChatId}
                    onOpen={onOpen}
                    preview={preview}
                    serverId={serverId}
                />
            )}
        </div>
    );
}

/**
 * The newest waiting message alone, clamped to a few lines so every open row
 * is about the same height and the reader's eye moves row to row. The clamp
 * is a clipping box around the transcript's own rendering, never a restyle
 * of it, fading out where it cuts; "Show more" lifts it, and appears only
 * when the message is actually taller than the box.
 */
function NewestMessage({
    chatId,
    conversationChatId,
    onOpen,
    preview,
    serverId,
}: {
    chatId: string;
    conversationChatId: string;
    onOpen: () => void;
    preview: ChatUnreadPreview;
    serverId: string;
}) {
    const newest = preview.messages.slice(-1);
    const [expanded, setExpanded] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const overflows = useOverflows(boxRef, !expanded);
    const clamped = !expanded && overflows;

    return (
        <>
            <div
                className={
                    expanded
                        ? undefined
                        : `max-h-36 overflow-hidden ${clamped ? 'mask-b-from-70%' : ''}`
                }
                ref={boxRef}
            >
                <UnreadRowMessages
                    chatId={chatId}
                    conversationChatId={conversationChatId}
                    messages={newest}
                    onOpenConversation={onOpen}
                    serverId={serverId}
                />
            </div>
            {clamped ? (
                <div className="px-4">
                    <Button onPress={() => setExpanded(true)} size="sm" variant="ghost">
                        Show more
                    </Button>
                </div>
            ) : null}
        </>
    );
}

/** Whether the box clips its content, re-measured as either resizes (a late image, a pane drag). */
function useOverflows(ref: RefObject<HTMLElement | null>, active: boolean): boolean {
    const [overflows, setOverflows] = useState(false);
    useLayoutEffect(() => {
        const box = ref.current;
        if (!(box && active)) {
            setOverflows(false);
            return;
        }
        const measure = () => setOverflows(box.scrollHeight > box.clientHeight + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        for (const child of Array.from(box.children)) {
            observer.observe(child);
        }
        return () => observer.disconnect();
    }, [active, ref]);
    return overflows;
}

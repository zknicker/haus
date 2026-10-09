import { useChatRead } from '../../../hooks/servers/use-chat-read.ts';
import { useVisibleChatSequence, type VisibleChatSequence } from './use-visible-chat-sequence.ts';

/**
 * Marks the chat read through its highest visible sequence and reports the
 * receipt. A leaf of its own: `useChatRead` reads tab presence, which flips
 * whenever a desktop tab or kept chat view shows or hides, and the visible
 * sequence changes as the transcript scrolls; both re-render only this, never
 * the whole chat view.
 */
export function ChatReadState({
    chatId,
    enabled,
    serverId,
    visibleSequence,
}: {
    chatId: string | undefined;
    enabled: boolean;
    serverId: string | undefined;
    visibleSequence: VisibleChatSequence;
}) {
    const sequence = useVisibleChatSequence(visibleSequence);
    const read = useChatRead({
        chatId,
        enabled,
        sequence: chatId === undefined ? undefined : sequence,
        serverId,
    });
    const readSequence = read.data?.sequence;
    return (
        <span className="sr-only" data-testid="read-state">
            {readSequence ? `Read through ${readSequence}` : ''}
        </span>
    );
}

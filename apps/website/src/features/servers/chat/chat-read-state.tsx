import { useChatRead } from '../../../hooks/servers/use-chat-read.ts';

/**
 * Marks the chat read through its highest visible sequence and reports the
 * receipt. A leaf of its own: `useChatRead` reads tab presence, which flips
 * whenever a desktop tab or kept chat view shows or hides, and that flip must
 * re-render only this, not the whole chat view.
 */
export function ChatReadState({
    chatId,
    enabled,
    sequence,
    serverId,
}: {
    chatId: string | undefined;
    enabled: boolean;
    sequence: number | undefined;
    serverId: string | undefined;
}) {
    const read = useChatRead({ chatId, enabled, sequence, serverId });
    const readSequence = read.data?.sequence;
    return (
        <span className="sr-only" data-testid="read-state">
            {readSequence ? `Read through ${readSequence}` : ''}
        </span>
    );
}

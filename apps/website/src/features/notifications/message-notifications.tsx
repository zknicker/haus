import type { ChatReadEvent, MessageCreatedEvent } from '@haus/api';
import { useMessageNotifications } from '../../hooks/notifications/use-message-notifications.ts';
import { useChatReadStream } from '../../hooks/realtime/use-chat-read-stream.ts';
import { useMessageCreatedStream } from '../../hooks/realtime/use-message-created-stream.ts';

/**
 * The active Server's `chat.onMessageCreated` and `chat.onRead` streams, with
 * desktop and web notifications hearing their live events. The notifier rides
 * these single subscriptions; it opens none of its own. Key it by Server, so
 * switching Servers starts the notifier with nothing seen.
 */
export function MessageNotifications({ server }: { server: { id: string; slug: string } }) {
    const notifications = useMessageNotifications(server);
    return (
        <>
            <MessageCreatedStream onEvent={notifications.onMessageCreated} serverId={server.id} />
            <ChatReadStream onEvent={notifications.onChatRead} serverId={server.id} />
        </>
    );
}

function MessageCreatedStream({
    onEvent,
    serverId,
}: {
    onEvent: (event: MessageCreatedEvent) => void;
    serverId: string;
}) {
    useMessageCreatedStream(serverId, onEvent);
    return null;
}

function ChatReadStream({
    onEvent,
    serverId,
}: {
    onEvent: (event: ChatReadEvent) => void;
    serverId: string;
}) {
    useChatReadStream(serverId, onEvent);
    return null;
}

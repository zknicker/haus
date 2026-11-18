import type { ChatReadEvent, MessageCreatedEvent } from '@haus/api';

import { useMessageNotifications } from '../../hooks/notifications/use-message-notifications.ts';
import { useNotificationSurface } from '../../hooks/notifications/use-notification-surface.ts';
import { useChatReadStream } from '../../hooks/realtime/use-chat-read-stream.ts';
import { useMessageCreatedStream } from '../../hooks/realtime/use-message-created-stream.ts';

export function MessageNotifications({ server }: { server: { id: string; slug: string } }) {
    const surface = useNotificationSurface(server.id);
    const notifications = useMessageNotifications(server, surface);
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

import type { ChatReadEvent, MessageCreatedEvent } from '@haus/api';
import { useMessageNotifications } from '../../hooks/notifications/use-message-notifications.ts';
import {
    type NotificationSurface,
    useNotificationSurface,
} from '../../hooks/notifications/use-notification-surface.ts';
import { useTaskAssignmentNotifications } from '../../hooks/notifications/use-task-assignment-notifications.ts';
import { useChatReadStream } from '../../hooks/realtime/use-chat-read-stream.ts';
import { useMessageCreatedStream } from '../../hooks/realtime/use-message-created-stream.ts';
import { useTaskInboxStream } from '../../hooks/realtime/use-task-inbox-stream.ts';

/**
 * The active Server's `chat.onMessageCreated`, `chat.onRead`, and
 * `taskInbox.onChanged` streams, with desktop and web notifications hearing
 * their live events. The notifiers ride these single subscriptions; they open
 * none of their own. Key it by Server, so switching Servers starts the
 * notifiers with nothing seen.
 */
export function MessageNotifications({ server }: { server: { id: string; slug: string } }) {
    const surface = useNotificationSurface(server.id);
    const notifications = useMessageNotifications(server, surface);
    return (
        <>
            <MessageCreatedStream onEvent={notifications.onMessageCreated} serverId={server.id} />
            <ChatReadStream onEvent={notifications.onChatRead} serverId={server.id} />
            <TaskAssignmentNotifications server={server} surface={surface} />
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

/** A leaf, so the Task list's changes re-render nothing but itself. */
function TaskAssignmentNotifications({
    server,
    surface,
}: {
    server: { id: string; slug: string };
    surface: NotificationSurface;
}) {
    const notifier = useTaskAssignmentNotifications(server, surface);
    useTaskInboxStream(server.id, notifier.changed);
    return null;
}

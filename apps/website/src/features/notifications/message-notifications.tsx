import { useMessageNotifications } from '../../hooks/notifications/use-message-notifications.ts';

/**
 * Desktop and web notifications for one Server. It renders nothing; it lives
 * inside `ChatEventListeners` because it rides that Server's event stream.
 */
export function MessageNotifications({ server }: { server: { id: string; slug: string } }) {
    useMessageNotifications(server);
    return null;
}

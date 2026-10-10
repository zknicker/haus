import {
    type ChatReadEvent,
    type MessageCreatedEvent,
    type MessageNotificationReason,
    messageNotificationReason,
} from '@haus/api';

/** The slice of the platform `Notification` constructor the notifier uses. */
export interface NotificationApi {
    readonly permission: NotificationPermission;
    new (
        title: string,
        options: { body: string; tag: string }
    ): { onclick: ((event: Event) => void) | null; close(): void };
}

/** What one notification says and where pressing it goes. */
export interface MessageNotificationText {
    body: string;
    /** The App route that opens the message's conversation. */
    path: string;
    title: string;
}

export interface MessageNotifierOptions {
    /** Resolves the message's text and route, or null when it cannot be read. */
    describe: (
        event: MessageCreatedEvent,
        reason: MessageNotificationReason
    ) => Promise<MessageNotificationText | null>;
    /** True while the reader cannot see Haus: the window is hidden or unfocused. */
    isBackground: () => boolean;
    /** True while the Settings toggle is on and this tab leads for the Server. */
    isEnabled: () => boolean;
    notificationApi: NotificationApi | undefined;
    onOpen: (path: string) => void;
    /** The signed-in human, once the member list has said who that is. */
    viewerUserId: () => string | undefined;
}

/** Enough to absorb a duplicated or late delivery of recent messages. */
const rememberedMessages = 500;

/**
 * Turns live `chat.onMessageCreated` events into platform notifications under
 * the shared notification rule (ADR 0038) — the same
 * `messageNotificationReason` the Server applies to iPhone push.
 *
 * It hears live events only: streams never replay, and a restart's recovery
 * reads never reach it, so messages that arrived while the reader was away are
 * the Inbox's to show, never a burst of notifications. A message whose Chat has
 * since been read through its sequence (`chat.onRead`) never notifies, whether
 * the read arrived earlier or while its text was being fetched. Each message
 * notifies at most once, and only while Haus is in the background, so a
 * message is never read (or described) for nothing. The tag is the Chat, so a
 * newer message in the same conversation replaces the older notification.
 */
export function createMessageNotifier(options: MessageNotifierOptions) {
    const seen = new Set<string>();
    const readThrough = new Map<string, number>();
    const isRead = (event: MessageCreatedEvent) =>
        (readThrough.get(event.chatId) ?? 0) >= event.sequence;

    // A message's first sighting decides it: a duplicate cannot notify again.
    const notifyReason = (event: MessageCreatedEvent) => {
        if (seen.has(event.messageId)) {
            return null;
        }
        remember(seen, event.messageId);
        const viewerUserId = options.viewerUserId();
        if (isRead(event) || !viewerUserId || !canNotify(options)) {
            return null;
        }
        return messageNotificationReason(event, viewerUserId);
    };

    return {
        async messageCreated(event: MessageCreatedEvent) {
            const reason = notifyReason(event);
            if (!reason) {
                return;
            }
            const text = await options.describe(event, reason);
            if (text && !isRead(event)) {
                notify(options, event, text);
            }
        },
        chatRead(event: Pick<ChatReadEvent, 'chatId' | 'sequence'>) {
            readThrough.set(
                event.chatId,
                Math.max(readThrough.get(event.chatId) ?? 0, event.sequence)
            );
        },
    };
}

function remember(seen: Set<string>, messageId: string) {
    seen.add(messageId);
    if (seen.size > rememberedMessages) {
        seen.delete(seen.values().next().value as string);
    }
}

function canNotify(options: MessageNotifierOptions) {
    return (
        options.notificationApi !== undefined &&
        options.notificationApi.permission === 'granted' &&
        options.isEnabled() &&
        options.isBackground()
    );
}

function notify(
    options: MessageNotifierOptions,
    event: MessageCreatedEvent,
    text: MessageNotificationText
) {
    const Api = options.notificationApi;
    if (!Api) {
        return;
    }
    const notification = new Api(text.title, { body: text.body, tag: event.chatId });
    notification.onclick = (clicked) => {
        clicked.preventDefault();
        notification.close();
        options.onOpen(text.path);
    };
}

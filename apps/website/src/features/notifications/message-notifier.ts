import {
    type MessageNotificationReason,
    messageNotificationReason,
    type ServerDurableEvent,
} from '@haus/api';

type MessageCreatedEvent = Extract<ServerDurableEvent, { type: 'message.created' }>;
type ChatReadEvent = Extract<ServerDurableEvent, { type: 'chat.read' }>;

/** The stream's events the notifier reads: new messages, and reads that cover them. */
export type MessageNotifierEvent = ChatReadEvent | MessageCreatedEvent;

/** `live` from the subscription; `catch-up` replayed from the event log on reconnect. */
export type MessageNotifierDelivery = 'catch-up' | 'live';

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

/** Enough to absorb a reconnect replaying recent messages. */
const rememberedMessages = 500;

/**
 * Turns `message.created` events into platform notifications under the shared
 * notification rule (ADR 0038) — the same `messageNotificationReason` the
 * Server applies to iPhone push.
 *
 * Only live events notify. A cold stream starts at the event head, and a
 * reconnect's catch-up replay is history — messages that arrived while the
 * reader was away are the Inbox's to show, never a burst of notifications. A
 * message whose Chat has since been read through its sequence never notifies,
 * whether the read arrived earlier, later in the same pass, or while its text
 * was being fetched. Each message notifies at most once, and only while Haus is
 * in the background, so a message is never read (or described) for nothing.
 * The tag is the Chat, so a newer message in the same conversation replaces the
 * older notification.
 */
export function createMessageNotifier(options: MessageNotifierOptions) {
    const seen = new Set<string>();
    const readThrough = new Map<string, number>();
    const isRead = (event: MessageCreatedEvent) =>
        (readThrough.get(event.chatId) ?? 0) >= event.sequence;

    // A message's first sighting decides it: a replayed or already-read one is
    // remembered as seen, so a later live copy cannot notify either.
    const notifyReason = (event: MessageCreatedEvent, delivery: MessageNotifierDelivery) => {
        if (seen.has(event.messageId)) {
            return null;
        }
        remember(seen, event.messageId);
        const viewerUserId = options.viewerUserId();
        if (delivery !== 'live' || isRead(event) || !viewerUserId || !canNotify(options)) {
            return null;
        }
        return messageNotificationReason(event, viewerUserId);
    };

    return {
        async observe(events: readonly MessageNotifierEvent[], delivery: MessageNotifierDelivery) {
            for (const event of events) {
                if (event.type === 'chat.read') {
                    readThrough.set(
                        event.chatId,
                        Math.max(readThrough.get(event.chatId) ?? 0, event.sequence)
                    );
                }
            }
            for (const event of events) {
                const reason =
                    event.type === 'message.created' ? notifyReason(event, delivery) : null;
                if (!(reason && event.type === 'message.created')) {
                    continue;
                }
                const text = await options.describe(event, reason);
                if (text && !isRead(event)) {
                    notify(options, event, text);
                }
            }
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

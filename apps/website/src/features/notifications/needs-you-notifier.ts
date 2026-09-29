import type { NeedsYouRow } from '@haus/api';

/** The slice of the platform `Notification` constructor the notifier uses. */
export interface NotificationApi {
    readonly permission: NotificationPermission;
    new (
        title: string,
        options: { body: string; tag: string }
    ): { onclick: ((event: Event) => void) | null; close(): void };
}

export interface NeedsYouNotifierOptions {
    /** True while the reader cannot see Haus: the window is hidden or unfocused. */
    isBackground: () => boolean;
    /** True while the Settings toggle is on. */
    isEnabled: () => boolean;
    notificationApi: NotificationApi | undefined;
    onOpen: (row: NeedsYouRow) => void;
    /** The row's text, resolved against the current name directories. */
    textFor: (row: NeedsYouRow) => { body: string; title: string };
}

/**
 * Turns successive Needs you snapshots into platform notifications.
 *
 * The first snapshot only records what is already there: rows present at
 * load were waiting before the reader arrived and are the Inbox's to show.
 * After that, a row notifies when its newest addressing message is one the
 * notifier has not seen — a new row, or newer activity in a row it had — and
 * each message notifies at most once. A row that leaves (a reply, Done)
 * notifies nothing. The tag is the Chat, so a newer message in the same
 * conversation replaces the older notification rather than stacking.
 */
export function createNeedsYouNotifier(options: NeedsYouNotifierOptions) {
    let seen: Set<string> | null = null;

    return {
        observe(rows: readonly NeedsYouRow[]) {
            const messageIds = rows.map((row) => row.latest.messageId);
            if (seen === null) {
                seen = new Set(messageIds);
                return;
            }
            const arrivals = rows.filter((row) => !seen?.has(row.latest.messageId));
            for (const id of messageIds) {
                seen.add(id);
            }
            if (!canNotify(options)) {
                return;
            }
            for (const row of arrivals) {
                notify(options, row);
            }
        },
    };
}

function canNotify(options: NeedsYouNotifierOptions) {
    return (
        options.notificationApi !== undefined &&
        options.notificationApi.permission === 'granted' &&
        options.isEnabled() &&
        options.isBackground()
    );
}

function notify(options: NeedsYouNotifierOptions, row: NeedsYouRow) {
    const Api = options.notificationApi;
    if (!Api) {
        return;
    }
    const { body, title } = options.textFor(row);
    const notification = new Api(title, { body, tag: row.chatId });
    notification.onclick = (event) => {
        event.preventDefault();
        notification.close();
        options.onOpen(row);
    };
}

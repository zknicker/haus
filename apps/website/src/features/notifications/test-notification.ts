interface TestNotificationApi {
    readonly permission: NotificationPermission;
    new (title: string, options: { body: string; tag: string }): unknown;
}

export function sendTestNotification(
    api: TestNotificationApi | undefined = typeof Notification === 'undefined'
        ? undefined
        : Notification
) {
    if (!api) {
        return 'unsupported';
    }
    if (api.permission !== 'granted') {
        return 'blocked';
    }
    new api('Haus', { body: 'Notifications are on.', tag: testNotificationTag });
    return 'sent';
}

const testNotificationTag = 'haus-test-notification';

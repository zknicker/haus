import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { sendTestNotification } from '../../notifications/test-notification.ts';
import { NotificationsSection, TestNotificationRow } from './notifications-section.tsx';

describe('notifications settings', () => {
    test('marks the row Not supported where notifications cannot show', () => {
        const markup = renderToStaticMarkup(<NotificationsSection />);
        expect(markup).toContain('Notify me when I&#x27;m needed');
        expect(markup).toContain('Not supported');
        expect(markup).not.toContain('text-warning');
    });

    test('offers a test notification only while notifications are on', () => {
        expect(renderToStaticMarkup(<TestNotificationRow isOn={false} />)).toContain('disabled');
        expect(renderToStaticMarkup(<TestNotificationRow isOn />)).not.toContain('disabled');
    });

    test('a test notification reports a platform without notifications', () => {
        expect(sendTestNotification()).toBe('unsupported');
    });
});

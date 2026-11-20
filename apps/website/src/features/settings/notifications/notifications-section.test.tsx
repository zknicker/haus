import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { sendTestNotification } from '../../notifications/test-notification.ts';
import { NotificationsSection, TestNotificationRow } from './notifications-section.tsx';

describe('notifications settings', () => {
    test('says why the switch is off where notifications cannot show', () => {
        const markup = renderToStaticMarkup(<NotificationsSection />);
        expect(markup).toContain('Notify me when I&#x27;m needed');
        expect(markup).toContain('This browser cannot show notifications.');
    });

    test('offers a test notification only while notifications are on', () => {
        expect(renderToStaticMarkup(<TestNotificationRow isOn={false} />)).toContain('disabled');
        expect(renderToStaticMarkup(<TestNotificationRow isOn />)).not.toContain('disabled');
    });

    test('a test notification reports a platform without notifications', () => {
        expect(sendTestNotification()).toBe('unsupported');
    });
});

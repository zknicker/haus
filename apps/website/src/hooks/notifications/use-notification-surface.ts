import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { readMessageNotificationsPreference } from '../../features/notifications/message-notifications-preference.ts';
import type { NotificationApi } from '../../features/notifications/message-notifier.ts';
import {
    claimNotificationLeadership,
    type NotificationLeadership,
    platformLocks,
} from '../../features/notifications/notification-leader.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';

/** What every notifier of a Server shares: when it may notify, and how a click opens. */
export interface NotificationSurface {
    isBackground: () => boolean;
    isEnabled: () => boolean;
    notificationApi: NotificationApi | undefined;
    /** Brings the window forward and opens the path: Open on desktop, a push on the web. */
    onOpen: (path: string) => void;
}

/**
 * One Server's notification surface: the per-device switch, this tab's election
 * as the Server's notifier, and the click-through. Every tab observes, but only
 * the elected tab raises anything, and message and Task notifications share that
 * election so one tab speaks for the Server. The surface keeps one identity, so
 * a notifier built on it outlives renders.
 */
export function useNotificationSurface(serverId: string): NotificationSurface {
    const navigate = useNavigate();
    const tabs = useOptionalDesktopTabs();
    const latest = React.useRef({ navigate, tabs });
    latest.current = { navigate, tabs };

    const leadership = React.useRef<NotificationLeadership | null>(null);
    React.useEffect(() => {
        const claimed = claimNotificationLeadership(
            `haus:message-notifier:${serverId}`,
            platformLocks()
        );
        leadership.current = claimed;
        return () => {
            claimed.release();
            leadership.current = null;
        };
    }, [serverId]);

    const [surface] = React.useState<NotificationSurface>(() => ({
        isBackground: () => document.hidden || !document.hasFocus(),
        isEnabled: () =>
            readMessageNotificationsPreference() && leadership.current?.isLeader() === true,
        notificationApi: platformNotificationApi(),
        onOpen: (path) => {
            focusWindow();
            if (latest.current.tabs) {
                latest.current.tabs.open(null, { kind: 'app', path });
            } else {
                latest.current.navigate(path);
            }
        },
    }));
    return surface;
}

function focusWindow() {
    const bridge = getDesktopBridge();
    if (bridge?.focusWindow) {
        void bridge.focusWindow();
    } else {
        window.focus();
    }
}

function platformNotificationApi(): NotificationApi | undefined {
    return typeof Notification === 'undefined'
        ? undefined
        : (Notification as unknown as NotificationApi);
}

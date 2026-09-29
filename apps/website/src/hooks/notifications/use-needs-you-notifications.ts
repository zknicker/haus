import type { NeedsYouRow } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { readNeedsYouNotificationsPreference } from '../../features/notifications/needs-you-notifications-preference.ts';
import {
    createNeedsYouNotifier,
    type NotificationApi,
} from '../../features/notifications/needs-you-notifier.ts';
import {
    claimNotificationLeadership,
    type NotificationLeadership,
    platformLocks,
} from '../../features/notifications/notification-leader.ts';
import {
    needsYouConversationPath,
    needsYouNotificationText,
    toNeedsYouRowView,
} from '../../features/servers/inbox/needs-you-rows.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useAgents } from '../members/use-agents.ts';
import { useHumanDirectory } from '../servers/use-human-directory.ts';
import { useNeedsYou } from '../servers/use-needs-you.ts';

/**
 * Raises a platform notification for a new or newer Needs you row while Haus
 * is hidden or unfocused, in the browser and the Electron renderer alike.
 * Clicking one brings the window forward and opens the conversation.
 *
 * It rides the Inbox's own Needs you read, which the Chat event stream keeps
 * current, so it adds no request and no event of its own. Every tab observes,
 * but only the elected tab for this Server raises notifications.
 */
export function useNeedsYouNotifications(server: { id: string; slug: string } | undefined) {
    const navigate = useNavigate();
    const needsYou = useNeedsYou(server?.id);
    const agents = useAgents(server?.id);
    const humans = useHumanDirectory(server?.id);
    // The notifier outlives renders; it reads the newest names and route
    // through this ref rather than being rebuilt and losing what it has seen.
    const latest = React.useRef({
        agents: agents.data ?? [],
        humans,
        navigate,
        slug: server?.slug,
    });
    latest.current = { agents: agents.data ?? [], humans, navigate, slug: server?.slug };

    const serverId = server?.id;
    const leadership = React.useRef<NotificationLeadership | null>(null);
    React.useEffect(() => {
        if (!serverId) {
            return;
        }
        const claimed = claimNotificationLeadership(
            `haus:needs-you-notifier:${serverId}`,
            platformLocks()
        );
        leadership.current = claimed;
        return () => {
            claimed.release();
            leadership.current = null;
        };
    }, [serverId]);

    // One notifier per Server: switching Servers starts a fresh first load.
    const notifier = React.useMemo(
        () =>
            serverId
                ? createNeedsYouNotifier({
                      isBackground: () => document.hidden || !document.hasFocus(),
                      isEnabled: () =>
                          readNeedsYouNotificationsPreference() &&
                          leadership.current?.isLeader() === true,
                      notificationApi: platformNotificationApi(),
                      onOpen: (row) => openRow(row, latest.current),
                      textFor: (row) =>
                          needsYouNotificationText(toNeedsYouRowView(row, latest.current)),
                  })
                : null,
        [serverId]
    );

    React.useEffect(() => {
        if (notifier && needsYou.data) {
            notifier.observe(needsYou.data);
        }
    }, [needsYou.data, notifier]);
}

function openRow(
    row: NeedsYouRow,
    context: { navigate: ReturnType<typeof useNavigate>; slug: string | undefined }
) {
    const bridge = getDesktopBridge();
    if (bridge?.focusWindow) {
        void bridge.focusWindow();
    } else {
        window.focus();
    }
    if (context.slug) {
        context.navigate(needsYouConversationPath(context.slug, row));
    }
}

function platformNotificationApi(): NotificationApi | undefined {
    return typeof Notification === 'undefined'
        ? undefined
        : (Notification as unknown as NotificationApi);
}

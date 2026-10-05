import type { MessageNotificationReason, ServerDurableEvent } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    type MessageNotificationNames,
    messageNotificationText,
} from '../../features/notifications/message-notification-text.ts';
import { readMessageNotificationsPreference } from '../../features/notifications/message-notifications-preference.ts';
import {
    createMessageNotifier,
    type NotificationApi,
} from '../../features/notifications/message-notifier.ts';
import {
    claimNotificationLeadership,
    type NotificationLeadership,
    platformLocks,
} from '../../features/notifications/notification-leader.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { useAgents } from '../members/use-agents.ts';
import { useChatEvent } from '../servers/chat-events/use-chat-event-stream.tsx';
import { useChats } from '../servers/use-chats.ts';
import { useHumanDirectory } from '../servers/use-human-directory.ts';
import { useMembers } from '../servers/use-members.ts';

type MessageCreatedEvent = Extract<ServerDurableEvent, { type: 'message.created' }>;
type Utils = ReturnType<typeof hausTrpc.useUtils>;

/**
 * Raises a platform notification for a new message that notifies this human
 * (ADR 0038) while Haus is hidden or unfocused, in the browser and the
 * Electron renderer alike. Clicking one brings the window forward and opens
 * the conversation: on desktop it reveals a tab already on it, else the
 * focused pane's current tab navigates there (ADR 0039).
 *
 * It listens to the Chat event stream's `message.created` and `chat.read`, so
 * it must render inside `ChatEventListeners`. Only live passes notify; a
 * reconnect's catch-up replay and any message already read stay silent. The rule is the shared one iPhone push uses;
 * only a message that passes it while Haus is in the background is fetched
 * for its text. Every tab observes, but only the elected tab for this Server
 * raises notifications.
 */
export function useMessageNotifications(server: { id: string; slug: string }) {
    const navigate = useNavigate();
    const reveal = useOptionalDesktopTabs()?.reveal;
    const open = React.useCallback(
        (path: string) => {
            if (reveal) {
                reveal({ kind: 'app', path });
            } else {
                navigate(path);
            }
        },
        [navigate, reveal]
    );
    const utils = hausTrpc.useUtils();
    const agents = useAgents(server.id);
    const chats = useChats(server.id);
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    // The notifier outlives renders; it reads the newest names and route
    // through this ref rather than being rebuilt and forgetting what it saw.
    const latest = React.useRef({
        names: { agents: [], chats: [], humans } as MessageNotificationNames,
        open,
        slug: server.slug,
        utils,
        viewerUserId: members.data?.viewerUserId,
    });
    latest.current = {
        names: { agents: agents.data ?? [], chats: chats.data ?? [], humans },
        open,
        slug: server.slug,
        utils,
        viewerUserId: members.data?.viewerUserId,
    };

    const serverId = server.id;
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

    // One notifier per mount; `MessageNotifications` is keyed by Server, so
    // switching Servers starts with nothing seen.
    const [notifier] = React.useState(() =>
        createMessageNotifier({
            describe: (event, reason) => describeMessage(event, reason, latest.current),
            isBackground: () => document.hidden || !document.hasFocus(),
            isEnabled: () =>
                readMessageNotificationsPreference() && leadership.current?.isLeader() === true,
            notificationApi: platformNotificationApi(),
            onOpen: (path) => openPath(path, latest.current.open),
            viewerUserId: () => latest.current.viewerUserId,
        })
    );

    // Fire and forget: reading a message's text must never hold up the
    // stream's catch-up walk or the cache listeners dispatched beside this one.
    useChatEvent(['message.created', 'chat.read'], (events, eventServerId, delivery) => {
        if (eventServerId !== serverId) {
            return;
        }
        notifier.observe(events, delivery).catch((error: unknown) => {
            console.warn('[haus] message notification failed', error);
        });
    });
}

/** The message's own text and route, read only once it is going to notify. */
async function describeMessage(
    event: MessageCreatedEvent,
    reason: MessageNotificationReason,
    context: { names: MessageNotificationNames; slug: string; utils: Utils }
) {
    const { client } = context.utils;
    const page = await client.chat.messages.query({
        aroundMessageId: event.messageId,
        chatId: event.chatId,
        limit: 3,
        serverId: event.serverId,
    });
    const message = page.messages.find((candidate) => candidate.id === event.messageId);
    if (!message) {
        return null;
    }
    const anchorMessageId = event.parentChatId
        ? (await client.thread.get.query({ serverId: event.serverId, threadChatId: event.chatId }))
              .anchorMessageId
        : null;
    return messageNotificationText({
        anchorMessageId,
        conversationChatId: event.parentChatId ?? event.chatId,
        message,
        names: context.names,
        reason,
        slug: context.slug,
    });
}

function openPath(path: string, open: (path: string) => void) {
    const bridge = getDesktopBridge();
    if (bridge?.focusWindow) {
        void bridge.focusWindow();
    } else {
        window.focus();
    }
    open(path);
}

function platformNotificationApi(): NotificationApi | undefined {
    return typeof Notification === 'undefined'
        ? undefined
        : (Notification as unknown as NotificationApi);
}

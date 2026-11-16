import type { ChatReadEvent, MessageCreatedEvent, MessageNotificationReason } from '@haus/api';
import * as React from 'react';
import {
    type MessageNotificationNames,
    messageNotificationText,
} from '../../features/notifications/message-notification-text.ts';
import { createMessageNotifier } from '../../features/notifications/message-notifier.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useAgents } from '../members/use-agents.ts';
import { useChats } from '../servers/use-chats.ts';
import { useHumanDirectory } from '../servers/use-human-directory.ts';
import { useMembers } from '../servers/use-members.ts';
import type { NotificationSurface } from './use-notification-surface.ts';

type Utils = ReturnType<typeof hausTrpc.useUtils>;

/**
 * Raises a platform notification for a new message that notifies this human
 * (ADR 0038) while Haus is hidden or unfocused, in the browser and the
 * Electron renderer alike. Clicking one brings the window forward and opens
 * the conversation: on desktop it is Open, a tab in the right pane (selecting
 * a right-pane tab already on it), ADR 0039.
 *
 * It returns the `onEvent` callbacks the Server's single `chat.onMessageCreated`
 * and `chat.onRead` streams call with each live event; recovery reads never
 * reach them, and a message already read stays silent. The rule is the shared
 * one iPhone push uses; only a message that passes it while Haus is in the
 * background is fetched for its text. The surface decides when this tab may
 * notify and how a click opens.
 */
export function useMessageNotifications(
    server: { id: string; slug: string },
    surface: NotificationSurface
) {
    const utils = hausTrpc.useUtils();
    const agents = useAgents(server.id);
    const chats = useChats(server.id);
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    // The notifier outlives renders; it reads the newest names and route
    // through this ref rather than being rebuilt and forgetting what it saw.
    const latest = React.useRef({
        names: { agents: [], chats: [], humans } as MessageNotificationNames,
        slug: server.slug,
        utils,
        viewerUserId: members.data?.viewerUserId,
    });
    latest.current = {
        names: { agents: agents.data ?? [], chats: chats.data ?? [], humans },
        slug: server.slug,
        utils,
        viewerUserId: members.data?.viewerUserId,
    };

    const serverId = server.id;

    // One notifier per mount; `MessageNotifications` is keyed by Server, so
    // switching Servers starts with nothing seen.
    const [notifier] = React.useState(() =>
        createMessageNotifier({
            ...surface,
            describe: (event, reason) => describeMessage(event, reason, latest.current),
            viewerUserId: () => latest.current.viewerUserId,
        })
    );

    return React.useMemo(
        () => ({
            onChatRead: (event: ChatReadEvent) => {
                if (event.serverId === serverId) {
                    notifier.chatRead(event);
                }
            },
            // Fire and forget: reading a message's text must never hold up the
            // stream's own cache work.
            onMessageCreated: (event: MessageCreatedEvent) => {
                if (event.serverId !== serverId) {
                    return;
                }
                notifier.messageCreated(event).catch((error: unknown) => {
                    console.warn('[haus] message notification failed', error);
                });
            },
        }),
        [notifier, serverId]
    );
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

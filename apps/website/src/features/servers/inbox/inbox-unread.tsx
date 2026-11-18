import type { Chat } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { tabStayState } from '../../../hooks/desktop-tabs/tab-navigation.ts';
import {
    useFollowedTaskPreviews,
    useUnreadPreviewReader,
    useUnreadPreviewsSettled,
} from '../../../hooks/inbox/use-unread-previews.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import type { ChatMessageJumpTarget } from '../../../hooks/servers/use-chat-message-navigation.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMarkChatRead } from '../../../hooks/servers/use-mark-chat-read.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { requestMessageReveal } from '../../../hooks/servers/use-pending-message-reveal.ts';
import { chatNavigationName } from '../../shell/chat-navigation-name.ts';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute, taskRoute } from '../server-routes.ts';
import { InboxSectionPending } from './inbox-section.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import { UnreadChatRow } from './inbox-unread-row.tsx';
import { unreadRowReadInput } from './unread-row-model.ts';
import { selectUnreadRows, type UnreadRow } from './unread-rows.ts';
import { UnreadTaskChatRow } from './unread-task-chat-row.tsx';
import type { UnreadRowTriage } from './unread-triage-row.tsx';
import { useUnreadTriage } from './use-unread-triage.ts';
import { type UnreadTriageCommand, useUnreadTriageKeys } from './use-unread-triage-keys.ts';

/**
 * Every Chat and followed Task with something unread, newest first, as one
 * feed of open cards (ADR 0038, ADR 0050, ADR 0052): each shows what is
 * waiting and a composer, and exactly one is selected. The cards are the
 * existing unread state, which this page only reads: seeing a card never reads
 * it. Mark read (E) or a reply from a card reads it and selects the next;
 * opening the conversation reads it there. J and K move the selection.
 */
export function InboxUnread() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const chats = useChats(server.id);
    const agents = useAgents(server.id);
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    const markRead = useMarkChatRead();
    const listRef = React.useRef<HTMLDivElement>(null);
    const composerRef = React.useRef<ChatComposerHandle>(null);
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const previewsSettled = useUnreadPreviewsSettled(server.id);
    const taskPreviews = useFollowedTaskPreviews(server.id);
    const readPreview = useUnreadPreviewReader(server.id);
    // Blank until the previews answer too: every card renders from them, and
    // painting the cards first made each one grow a beat later.
    const unread = React.useMemo(
        () => (chats.data && previewsSettled ? selectUnreadRows(chats.data, taskPreviews) : null),
        [chats.data, previewsSettled, taskPreviews]
    );
    const triage = useUnreadTriage(server.id, unread, listRef);
    const viewerUserId = members.data?.viewerUserId ?? null;
    const viewerDisplayName = viewerUserId ? humans.name(viewerUserId) : null;

    const agentOf = (chat: Chat) =>
        chat.peerAgentId ? (agentById.get(chat.peerAgentId) ?? null) : null;
    // Opening a card goes there in this tab, as the sidebar would, and Back returns
    // to the Inbox (ADR 0046); Command-, Shift-, and middle-click still open a tab.
    // A Chat opens scrolled to the card's message, flashed: the newest waiting one
    // the card shows, unless the card names another ("N earlier" names its oldest).
    const openConversation = (row: UnreadRow, message?: ChatMessageJumpTarget) => {
        if (row.kind === 'task-chat') {
            navigate(taskRoute(server.slug, row.preview.task.key), { state: tabStayState() });
            return;
        }
        const target = message ?? readPreview(row.chat.id)?.messages.at(-1);
        if (target) {
            requestMessageReveal(row.chat.id, { id: target.id, sequence: target.sequence });
        }
        navigate(serverChatRoute(server.slug, row.chat.id), { state: tabStayState() });
    };
    const read = (row: UnreadRow, byKey = false) => {
        // Advance first, so the next card is selected while focus is still in the list.
        triage.leave(row, byKey);
        markRead.mutate(unreadRowReadInput(row, server.id));
    };
    const triageOf = (row: UnreadRow): UnreadRowTriage => {
        const isSelected = triage.selected?.id === row.id;
        return {
            composerRef,
            isSelected,
            isRinged: isSelected && triage.ringed,
            onMarkRead: () => read(row),
            onOpen: (message) => openConversation(row, message),
            onReplySent: () => read(row),
            onSelect: () => {
                if (!isSelected) {
                    triage.select(row);
                }
            },
            takesFocus: isSelected && triage.carryFocus,
        };
    };

    useUnreadTriageKeys(listRef, (command: UnreadTriageCommand) => {
        const row = triage.selected;
        if (!row) {
            return;
        }
        switch (command) {
            case 'next':
            case 'previous':
                triage.step(command === 'next' ? 1 : -1);
                return;
            case 'mark-read':
                read(row, true);
                return;
            case 'reply':
                composerRef.current?.focus();
                return;
            default:
                openConversation(row);
        }
    });

    return unread ? (
        <div ref={listRef}>
            <InboxRowList
                emptyLabel="All caught up."
                listId="inbox-unread"
                renderRow={(row) => {
                    switch (row.kind) {
                        case 'chat':
                            return (
                                <UnreadChatRow
                                    agent={agentOf(row.chat)}
                                    chat={row.chat}
                                    name={chatNavigationName(row.chat, agentOf(row.chat))}
                                    triage={triageOf(row)}
                                    viewerDisplayName={viewerDisplayName}
                                />
                            );
                        default:
                            return (
                                <UnreadTaskChatRow
                                    origin={chats.data?.find(
                                        (chat) => chat.id === row.preview.task.originChatId
                                    )}
                                    preview={row.preview}
                                    serverId={server.id}
                                    triage={triageOf(row)}
                                />
                            );
                    }
                }}
                rows={unread}
                variant="bare"
            />
        </div>
    ) : (
        <InboxSectionPending label="Loading unread chats" />
    );
}

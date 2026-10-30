import type { Chat } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMarkChatRead } from '../../../hooks/servers/use-mark-chat-read.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useThreadOpener } from '../../../hooks/threads/use-thread-opener.ts';
import { useUnreadThreads } from '../../../hooks/threads/use-unread-threads.ts';
import { chatNavigationName } from '../../shell/chat-navigation-name.ts';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute } from '../server-routes.ts';
import { InboxSectionPending } from './inbox-section.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import { UnreadChatRow, UnreadThreadRow } from './inbox-unread-row.tsx';
import { type UnreadRowRead, unreadRowReadInput } from './unread-row-model.ts';
import { selectUnreadRows, type UnreadRow } from './unread-rows.ts';
import type { UnreadRowTriage } from './unread-triage-row.tsx';
import { useUnreadTriage } from './use-unread-triage.ts';
import { type UnreadTriageCommand, useUnreadTriageKeys } from './use-unread-triage-keys.ts';

/**
 * Every Chat and Thread with something unread, newest first, as one triage
 * list (ADR 0038, ADR 0043, ADR 0050): one line per row, and exactly one row
 * open, showing its newest waiting message and the conversation's own
 * composer. The rows are the existing unread state, which this page only
 * reads: seeing a row never reads it. Mark read (E) or a reply from the open
 * row reads it and opens the next; opening the conversation reads it there,
 * a Thread at its first unread reply. J and K move the open row.
 */
export function InboxUnread() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const openThread = useThreadOpener(server.slug);
    const chats = useChats(server.id);
    const threads = useUnreadThreads(server.id);
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
    const unread = React.useMemo(
        () => (chats.data && threads.data ? selectUnreadRows(chats.data, threads.data) : null),
        [chats.data, threads.data]
    );
    const triage = useUnreadTriage(unread, listRef);
    const viewerUserId = members.data?.viewerUserId ?? null;
    const viewerDisplayName = viewerUserId ? humans.name(viewerUserId) : null;
    const authors = { agentById, humans };

    const agentOf = (chat: Chat) =>
        chat.peerAgentId ? (agentById.get(chat.peerAgentId) ?? null) : null;
    const openConversation = (row: UnreadRow) =>
        row.kind === 'chat'
            ? navigate(serverChatRoute(server.slug, row.chat.id))
            : openThread(row.thread.parentChatId, row.thread.anchorMessageId);
    const read = (row: UnreadRow, reason: UnreadRowRead) => {
        // Advance first, so the next row opens while focus is still in the list.
        triage.leave(row);
        markRead.mutate(unreadRowReadInput(row, server.id, reason));
    };
    const triageOf = (row: UnreadRow): UnreadRowTriage => ({
        composerRef,
        isOpen: triage.open?.id === row.id,
        onMarkRead: () => read(row, 'mark-read'),
        onOpen: () => openConversation(row),
        onReplySent: () => read(row, 'reply'),
        onSelect: () => triage.select(row),
        takesFocus: triage.carryFocus,
    });

    useUnreadTriageKeys(listRef, (command: UnreadTriageCommand) => {
        const row = triage.open;
        if (!row) {
            return;
        }
        switch (command) {
            case 'next':
            case 'previous':
                triage.step(command === 'next' ? 1 : -1);
                return;
            case 'mark-read':
                read(row, 'mark-read');
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
                renderRow={(row) =>
                    row.kind === 'chat' ? (
                        <UnreadChatRow
                            agent={agentOf(row.chat)}
                            authors={authors}
                            chat={row.chat}
                            name={chatNavigationName(row.chat, agentOf(row.chat))}
                            triage={triageOf(row)}
                            viewerDisplayName={viewerDisplayName}
                        />
                    ) : (
                        <UnreadThreadRow
                            agent={agentOf(row.parent)}
                            authors={authors}
                            name={chatNavigationName(row.parent, agentOf(row.parent))}
                            parent={row.parent}
                            thread={row.thread}
                            triage={triageOf(row)}
                            viewerDisplayName={viewerDisplayName}
                        />
                    )
                }
                rows={unread}
                variant="bare"
            />
        </div>
    ) : (
        <InboxSectionPending label="Loading unread chats" />
    );
}

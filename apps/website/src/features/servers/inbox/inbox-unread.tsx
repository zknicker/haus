import { type BoardColumn, type Chat, parseTaskKey, type TaskInboxItem } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { tabStayState } from '../../../hooks/desktop-tabs/tab-navigation.ts';
import {
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
import { useClearTaskInboxItem } from '../../../hooks/task-inbox/use-clear-task-inbox-item.ts';
import { useThreadRoute } from '../../../hooks/threads/use-thread-opener.ts';
import { useUnreadThreads } from '../../../hooks/threads/use-unread-threads.ts';
import { chatNavigationName } from '../../shell/chat-navigation-name.ts';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute, taskRoute } from '../server-routes.ts';
import { InboxSectionPending } from './inbox-section.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import { UnreadChatRow, UnreadThreadRow } from './inbox-unread-row.tsx';
import { type TaskContextPlace, withResolvedRow } from './task-inbox-model.ts';
import { TaskResolvedRow } from './task-resolved-row.tsx';
import { type UnreadRowRead, unreadRowReadInput } from './unread-row-model.ts';
import { selectUnreadRows, type UnreadRow } from './unread-rows.ts';
import { UnreadTaskRow } from './unread-task-row.tsx';
import type { UnreadRowTriage } from './unread-triage-row.tsx';
import { useTaskInboxFeed } from './use-task-inbox-feed.ts';
import { useTaskInboxResolve } from './use-task-inbox-resolve.ts';
import { useUnreadTriage } from './use-unread-triage.ts';
import { type UnreadTriageCommand, useUnreadTriageKeys } from './use-unread-triage-keys.ts';

/**
 * Every Chat and Thread with something unread and every Task assigned to the
 * reader, newest first, as one feed of open cards (ADR 0038, ADR 0043, ADR
 * 0050, ADR 0051): each shows what is waiting and a composer, and exactly one
 * is selected. The cards are the existing unread state, which this page only
 * reads: seeing a card never reads it. Mark read (E) or a reply from a
 * conversation's card reads it and selects the next; opening the conversation
 * reads it there, a Thread at its first unread reply. A Task's card clears by
 * Mark read, by opening the Task, or by resolving it, which leaves a slim row
 * with an Undo. J and K move the selection.
 */
export function InboxUnread() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const threadRoute = useThreadRoute(server.slug);
    const chats = useChats(server.id);
    const threads = useUnreadThreads(server.id);
    const agents = useAgents(server.id);
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    const markRead = useMarkChatRead();
    const clearTaskItem = useClearTaskInboxItem();
    const taskFeed = useTaskInboxFeed(server.id, chats.data);
    const taskResolve = useTaskInboxResolve(server.id);
    const listRef = React.useRef<HTMLDivElement>(null);
    const composerRef = React.useRef<ChatComposerHandle>(null);
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const previewsSettled = useUnreadPreviewsSettled(server.id);
    const readPreview = useUnreadPreviewReader(server.id);
    // Blank until the previews and Task items answer too: every card renders
    // from them, and painting the cards first made each one grow a beat later.
    const resolvedTaskId = taskResolve.resolved?.item.task.id;
    const unread = React.useMemo(
        () =>
            chats.data && threads.data && previewsSettled && taskFeed.settled
                ? selectUnreadRows(
                      chats.data,
                      threads.data,
                      taskFeed.items.filter((item) => item.task.id !== resolvedTaskId)
                  )
                : null,
        [
            chats.data,
            threads.data,
            previewsSettled,
            taskFeed.settled,
            taskFeed.items,
            resolvedTaskId,
        ]
    );
    const triage = useUnreadTriage(server.id, unread, listRef);
    const viewerUserId = members.data?.viewerUserId ?? null;
    const viewerDisplayName = viewerUserId ? humans.name(viewerUserId) : null;
    const authors = { agentById, humans };

    const agentOf = (chat: Chat) =>
        chat.peerAgentId ? (agentById.get(chat.peerAgentId) ?? null) : null;
    // Opening a card goes there in this tab, as the sidebar would, and Back returns
    // to the Inbox (ADR 0046); Command-, Shift-, and middle-click still open a tab.
    // A Chat opens scrolled to the card's message, flashed: the newest waiting one
    // the card shows, unless the card names another ("N earlier" names its oldest).
    const openConversation = (row: UnreadRow, message?: ChatMessageJumpTarget) => {
        if (row.kind === 'task') {
            openTask(row.item);
            return;
        }
        if (row.kind === 'thread') {
            navigate(threadRoute(row.thread.parentChatId, row.thread.anchorMessageId), {
                state: tabStayState(),
            });
            return;
        }
        const target = message ?? readPreview(row.chat.id)?.messages.at(-1);
        if (target) {
            requestMessageReveal(row.chat.id, { id: target.id, sequence: target.sequence });
        }
        navigate(serverChatRoute(server.slug, row.chat.id), { state: tabStayState() });
    };
    // The Task page clears the item as it shows, so Back finds the queue moved on.
    const openTask = ({ task }: TaskInboxItem) => {
        const address = parseTaskKey(task.key);
        if (address) {
            navigate(taskRoute(server.slug, address.boardKey, address.number), {
                state: tabStayState(),
            });
        }
    };
    const openTaskContext = (item: TaskInboxItem, place: null | TaskContextPlace) => {
        const message = item.contextMessage;
        if (!(message && place)) {
            return;
        }
        if (place.threadChatId) {
            navigate(threadRoute(place.parent.id, place.anchorMessageId), {
                state: tabStayState(),
            });
            return;
        }
        requestMessageReveal(place.parent.id, { id: message.id, sequence: message.sequence });
        navigate(serverChatRoute(server.slug, place.parent.id), { state: tabStayState() });
    };
    const read = (row: UnreadRow, reason: UnreadRowRead, byKey = false) => {
        // A reply answers the conversation; the Task stays the reader's to resolve.
        if (row.kind === 'task' && reason === 'reply') {
            return;
        }
        // Advance first, so the next card is selected while focus is still in the list.
        triage.leave(row, byKey);
        taskResolve.dismiss();
        if (row.kind === 'task') {
            clearTaskItem.mutate({ serverId: server.id, taskId: row.item.task.id });
        } else {
            markRead.mutate(unreadRowReadInput(row, server.id, reason));
        }
    };
    const triageOf = (row: UnreadRow): UnreadRowTriage => {
        const isSelected = triage.selected?.id === row.id;
        return {
            composerRef,
            isSelected,
            isRinged: isSelected && triage.ringed,
            onMarkRead: () => read(row, 'mark-read'),
            onOpen: (message) => openConversation(row, message),
            onReplySent: () => read(row, 'reply'),
            onSelect: () => {
                if (!isSelected) {
                    triage.select(row);
                }
            },
            takesFocus: isSelected && triage.carryFocus,
        };
    };

    const resolveTask = (row: Extract<UnreadRow, { kind: 'task' }>, column: BoardColumn) => {
        triage.leave(row, false);
        taskResolve.resolve(row.item, column, unread?.indexOf(row) ?? 0);
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
                read(row, 'mark-read', true);
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
                        case 'thread':
                            return (
                                <UnreadThreadRow
                                    agent={agentOf(row.parent)}
                                    authors={authors}
                                    name={chatNavigationName(row.parent, agentOf(row.parent))}
                                    parent={row.parent}
                                    thread={row.thread}
                                    triage={triageOf(row)}
                                    viewerDisplayName={viewerDisplayName}
                                />
                            );
                        case 'task': {
                            const place = taskFeed.placeOf(row.item);
                            return (
                                <UnreadTaskRow
                                    board={taskFeed.boardOf(row.item)}
                                    item={row.item}
                                    onOpenContext={() => openTaskContext(row.item, place)}
                                    onResolve={(column) => resolveTask(row, column)}
                                    place={place}
                                    serverId={server.id}
                                    triage={triageOf(row)}
                                />
                            );
                        }
                        default:
                            return (
                                <TaskResolvedRow
                                    isUndoing={taskResolve.undoing}
                                    onUndo={taskResolve.undo}
                                    resolved={row.resolved}
                                />
                            );
                    }
                }}
                rows={withResolvedRow(unread, taskResolve.resolved)}
                variant="bare"
            />
        </div>
    ) : (
        <InboxSectionPending label="Loading unread chats" />
    );
}

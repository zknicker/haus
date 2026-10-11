import type { Agent, Chat, UnreadThread } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { UnreadCountChip } from '../../../components/chats/unread-count-chip.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMarkChatRead } from '../../../hooks/servers/use-mark-chat-read.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useThreadOpener } from '../../../hooks/threads/use-thread-opener.ts';
import { useUnreadThreads } from '../../../hooks/threads/use-unread-threads.ts';
import { chatNavigationName } from '../../shell/chat-navigation-name.ts';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute } from '../server-routes.ts';
import { conversationPreviewLine, threadReplyPreviewLine } from './conversation-preview.ts';
import { InboxActionRow, InboxRowBody } from './inbox-row.tsx';
import { InboxSectionPending } from './inbox-section.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import { MarkReadAction, UnreadChatMark, UnreadRowTime } from './unread-row-parts.tsx';
import { selectUnreadRows } from './unread-rows.ts';

/**
 * Every Chat and Thread with something unread, newest first, each row quoting
 * the line that is waiting (ADR 0038, ADR 0042). Opening a Chat or Thread
 * while Haus is in view reads it — a Thread opens at its first unread reply —
 * and Mark read reads it without opening it. The unread state is the
 * existing read state, which this page only reads.
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
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const unread = React.useMemo(
        () => (chats.data && threads.data ? selectUnreadRows(chats.data, threads.data) : null),
        [chats.data, threads.data]
    );
    const viewerUserId = members.data?.viewerUserId ?? null;
    const viewerDisplayName = viewerUserId ? humans.name(viewerUserId) : null;
    const agentOf = (chat: Chat) =>
        chat.peerAgentId ? (agentById.get(chat.peerAgentId) ?? null) : null;

    return unread ? (
        <InboxRowList
            emptyLabel="All caught up."
            listId="inbox-unread"
            renderRow={(row) =>
                row.kind === 'chat' ? (
                    <UnreadChatRow
                        agent={agentOf(row.chat)}
                        chat={row.chat}
                        onMarkRead={() =>
                            markRead.mutate({
                                chatId: row.chat.id,
                                includeThreads: true,
                                sequence: row.chat.lastMessageSequence,
                                serverId: server.id,
                            })
                        }
                        onOpen={() => navigate(serverChatRoute(server.slug, row.chat.id))}
                        viewerDisplayName={viewerDisplayName}
                    />
                ) : (
                    <UnreadThreadRow
                        agent={agentOf(row.parent)}
                        onMarkRead={() =>
                            markRead.mutate({
                                chatId: row.thread.threadChatId,
                                sequence: row.thread.lastMessageSequence,
                                serverId: server.id,
                            })
                        }
                        onOpen={() =>
                            openThread(row.thread.parentChatId, row.thread.anchorMessageId)
                        }
                        parent={row.parent}
                        thread={row.thread}
                        viewerDisplayName={viewerDisplayName}
                    />
                )
            }
            rows={unread}
        />
    ) : (
        <InboxSectionPending label="Loading unread chats" />
    );
}

function UnreadChatRow({
    agent,
    chat,
    onMarkRead,
    onOpen,
    viewerDisplayName,
}: {
    agent: Agent | null;
    chat: Chat;
    onMarkRead: () => void;
    onOpen: () => void;
    viewerDisplayName: null | string;
}) {
    const name = chatNavigationName(chat, agent);
    const isDirect = chat.kind !== 'channel';
    const title = isDirect ? name : `#${name}`;
    const preview = conversationPreviewLine(chat.lastMessage, {
        peerDisplayName: isDirect ? name : null,
        viewerDisplayName,
    });

    return (
        <InboxActionRow
            action={<MarkReadAction onPress={onMarkRead} title={title} />}
            badge={<UnreadCountChip count={chat.unreadCount} />}
            label={name}
            meta={<UnreadRowTime value={chat.lastActivityAt} />}
            onOpen={onOpen}
        >
            <UnreadChatMark agent={agent} chat={chat} name={name} />
            {/* The preview is the waiting line, as one truncated quote. A Chat
                that holds no message yet says so instead. */}
            <InboxRowBody preview={preview ?? 'no activity yet'} title={title} />
        </InboxActionRow>
    );
}

/**
 * An unread Thread: its parent's mark and name, then the newest reply. It
 * opens the Thread itself, at the first reply the viewer has not read.
 */
function UnreadThreadRow({
    agent,
    onMarkRead,
    onOpen,
    parent,
    thread,
    viewerDisplayName,
}: {
    agent: Agent | null;
    onMarkRead: () => void;
    onOpen: () => void;
    parent: Chat;
    thread: UnreadThread;
    viewerDisplayName: null | string;
}) {
    const name = chatNavigationName(parent, agent);
    // A DM context is labeled "DM", never its peer (the DM copy rule); the
    // mark beside it shows whose DM it is.
    const title = parent.kind === 'channel' ? `#${name}` : 'DM';
    const label = `Thread in ${title}`;

    return (
        <InboxActionRow
            action={<MarkReadAction onPress={onMarkRead} title={label} />}
            badge={<UnreadCountChip count={thread.unreadCount} />}
            label={label}
            meta={<UnreadRowTime value={thread.lastActivityAt} />}
            onOpen={onOpen}
        >
            <UnreadChatMark agent={agent} chat={parent} name={name} />
            <InboxRowBody
                preview={threadReplyPreviewLine(thread.latestReply, viewerDisplayName)}
                title={title}
            />
        </InboxActionRow>
    );
}

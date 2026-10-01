import type { Agent, Chat } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { MailOpen01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { UnreadCountChip } from '../../../components/chats/unread-count-chip.tsx';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMarkChatRead } from '../../../hooks/servers/use-mark-chat-read.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { chatNavigationName } from '../../shell/chat-navigation-row.tsx';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute } from '../server-routes.ts';
import { conversationPreviewLine } from './conversation-preview.ts';
import { InboxActionRow, InboxGlyphMark, InboxIdentityMark, InboxRowBody } from './inbox-row.tsx';
import { InboxSection, InboxSectionPending } from './inbox-section.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import { selectUnreadChats } from './unread-chats.ts';

/**
 * Every Chat with something unread, newest first, each row quoting the line
 * that is waiting (ADR 0038). Opening the Chat while Haus is in view reads it;
 * Mark read reads it, with its Thread replies, without opening it. The unread
 * counts are the existing read state, which this page only reads.
 */
export function InboxUnread() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const chats = useChats(server.id);
    const agents = useAgents(server.id);
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    const markRead = useMarkChatRead();
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const unread = React.useMemo(() => selectUnreadChats(chats.data ?? []), [chats.data]);
    const viewerUserId = members.data?.viewerUserId ?? null;
    const viewerDisplayName = viewerUserId ? humans.name(viewerUserId) : null;

    return (
        <InboxSection title="Unread">
            {chats.data ? (
                <InboxRowList
                    emptyLabel="All caught up."
                    listId="inbox-unread"
                    renderRow={(chat) => (
                        <UnreadChatRow
                            agent={
                                chat.peerAgentId ? (agentById.get(chat.peerAgentId) ?? null) : null
                            }
                            chat={chat}
                            onMarkRead={() =>
                                markRead.mutate({
                                    chatId: chat.id,
                                    includeThreads: true,
                                    sequence: chat.lastMessageSequence,
                                    serverId: server.id,
                                })
                            }
                            onOpen={() => navigate(serverChatRoute(server.slug, chat.id))}
                            viewerDisplayName={viewerDisplayName}
                        />
                    )}
                    rows={unread}
                />
            ) : (
                <InboxSectionPending label="Loading unread chats" />
            )}
        </InboxSection>
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
            action={
                <Tooltip delay={0}>
                    <Button
                        aria-label={`Mark read: ${title}`}
                        isIconOnly
                        onPress={onMarkRead}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={MailOpen01Icon} size={16} />
                    </Button>
                    <Tooltip.Content>Mark read</Tooltip.Content>
                </Tooltip>
            }
            badge={<UnreadCountChip count={chat.unreadCount} />}
            label={name}
            meta={
                <span className="tabular-nums">
                    <RelativeTime fallback="" value={chat.lastActivityAt} />
                </span>
            }
            onOpen={onOpen}
        >
            {isDirect ? (
                <InboxIdentityMark agent={agent} name={name} />
            ) : (
                <InboxGlyphMark>
                    <ChannelIconBox color={chat.color} icon={chat.icon} size="inboxRow" />
                </InboxGlyphMark>
            )}
            {/* The preview is the waiting line, as one truncated quote. A Chat
                that holds no message yet says so instead. */}
            <InboxRowBody preview={preview ?? 'no activity yet'} title={title} />
        </InboxActionRow>
    );
}

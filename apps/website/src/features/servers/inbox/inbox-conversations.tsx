import type { Agent, Chat } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { UnreadCountChip } from '../../../components/chats/unread-count-chip.tsx';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { chatNavigationName } from '../../shell/chat-navigation-row.tsx';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute } from '../server-routes.ts';
import { conversationPreviewLine } from './conversation-preview.ts';
import {
    InboxGlyphMark,
    InboxIdentityMark,
    InboxRow,
    InboxRowBody,
    InboxRowMeta,
} from './inbox-row.tsx';
import { InboxSection, InboxSectionPending } from './inbox-section.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';

/**
 * Unread conversation, newest first, each row quoting the line that is waiting.
 * Followed Threads join it once the Server can list them; the unread counts
 * themselves are the existing read state, which this page only reads.
 */
export function InboxConversations() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const chats = useChats(server.id);
    const agents = useAgents(server.id);
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const unread = React.useMemo(() => selectUnreadChats(chats.data ?? []), [chats.data]);
    const viewerUserId = members.data?.viewerUserId ?? null;
    const viewerDisplayName = viewerUserId ? humans.name(viewerUserId) : null;

    return (
        <InboxSection title="Conversations">
            {chats.data ? (
                <InboxRowList
                    emptyLabel="All caught up."
                    listId="inbox-conversations"
                    renderRow={(chat) => (
                        <UnreadChatRow
                            agent={
                                chat.peerAgentId ? (agentById.get(chat.peerAgentId) ?? null) : null
                            }
                            chat={chat}
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
    onOpen,
    viewerDisplayName,
}: {
    agent: Agent | null;
    chat: Chat;
    onOpen: () => void;
    viewerDisplayName: null | string;
}) {
    const name = chatNavigationName(chat, agent);
    const isDirect = chat.kind !== 'channel';
    const preview = conversationPreviewLine(chat.lastMessage, {
        peerDisplayName: isDirect ? name : null,
        viewerDisplayName,
    });

    return (
        <InboxRow label={name} onOpen={onOpen}>
            {isDirect ? (
                <InboxIdentityMark agent={agent} name={name} />
            ) : (
                <InboxGlyphMark>
                    <ChannelIconBox color={chat.color} icon={chat.icon} size="inboxRow" />
                </InboxGlyphMark>
            )}
            {/* The preview is the waiting line, as one truncated quote. A Chat
                that holds no message yet says so instead. */}
            <InboxRowBody
                preview={preview ?? 'no activity yet'}
                title={chat.kind === 'channel' ? `#${name}` : name}
            />
            <InboxRowMeta>
                <span className="tabular-nums">
                    <RelativeTime fallback="" value={chat.lastActivityAt} />
                </span>
                <UnreadCountChip count={chat.unreadCount} />
            </InboxRowMeta>
        </InboxRow>
    );
}

/**
 * Unread conversation, most recently active first. Timestamps carry an offset
 * rather than a fixed zone, so they are compared as instants — a lexical
 * compare would order `-04:00` against `Z` by its text.
 */
function selectUnreadChats(chats: readonly Chat[]): Chat[] {
    return chats
        .filter((chat) => chat.unreadCount > 0)
        .sort((a, b) => lastActivityTime(b) - lastActivityTime(a));
}

function lastActivityTime(chat: Chat) {
    return chat.lastActivityAt ? Date.parse(chat.lastActivityAt) : 0;
}

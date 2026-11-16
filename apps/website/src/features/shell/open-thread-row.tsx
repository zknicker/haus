import { Sidebar } from '@heroui-pro/react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { useAgentMark } from '../../hooks/members/use-agents.ts';
import { type ChatNavigationEntry, useChatNavigationEntry } from '../../hooks/servers/use-chats.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { useOpenThreadEntry } from '../../hooks/threads/use-open-threads.ts';
import { threadPageRoute } from '../../hooks/threads/use-thread-opener.ts';
import { cn } from '../../lib/utils.ts';
import { LiveAgentAvatar } from '../members/agent-avatar.tsx';
import { OpenThreadWorkGlyph } from '../threads/open-thread-glyph.tsx';
import { openThreadAge } from '../threads/open-thread-status.ts';

/**
 * One open Thread at channel-row density: its mark, its title on one line,
 * and its unread count or the age of its newest Message. A Thread holding Cloud
 * Agent work leads with the cloud worker in its state's tone; any other leads
 * with its parent Chat's own mark, the one the Channels and Direct messages
 * rows wear. The status line lives on the Threads page; the stock row tooltip
 * wraps the link in a second tab stop, so the row carries none.
 */
export function OpenThreadRow({
    currentPath,
    serverId,
    slug,
    threadChatId,
}: {
    currentPath: string;
    serverId: string;
    slug: string;
    threadChatId: string;
}) {
    const thread = useOpenThreadEntry(serverId, threadChatId);
    const parent = useChatNavigationEntry(serverId, thread?.parentChatId ?? '');
    const href = thread ? threadPageRoute(slug, thread.parentChatId, thread.anchorMessageId) : '';
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, noPreload);
    if (!thread) {
        return null;
    }
    const unread = thread.state === 'unread';
    const hasWork = thread.jobCount > 0;
    const age = openThreadAge(thread);

    return (
        <Sidebar.MenuItem
            href={href}
            id={threadChatId}
            isCurrent={href === currentPath}
            ref={pressRef}
            textValue={thread.title}
        >
            <Sidebar.MenuIcon>
                {hasWork ? (
                    <OpenThreadWorkGlyph state={thread.state} />
                ) : parent ? (
                    <ParentMark parent={parent} serverId={serverId} />
                ) : null}
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                {/* The parent's filled mark takes the same two optical pixels
                    the Channel and DM rows give their labels (chat-navigation-row.tsx);
                    the cloud worker is a line glyph and needs none. */}
                <Sidebar.MenuLabel
                    className={cn(!hasWork && 'ms-[2px]', unread && 'font-medium text-foreground')}
                >
                    {thread.title}
                </Sidebar.MenuLabel>
                {/* One fixed trailing column, filled or not, so every title
                    truncates at the same edge. */}
                <span className="flex w-8 shrink-0 justify-end">
                    {unread ? (
                        <UnreadCountChip count={thread.unreadCount} />
                    ) : age ? (
                        <Sidebar.MenuChip>{age}</Sidebar.MenuChip>
                    ) : null}
                </span>
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

function ParentMark({ parent, serverId }: { parent: ChatNavigationEntry; serverId: string }) {
    if (parent.kind === 'dm' && parent.peerAgentId) {
        return <AgentDmMark agentId={parent.peerAgentId} serverId={serverId} />;
    }
    return <ChannelIconBox color={parent.color} icon={parent.icon} size="sidebar" />;
}

/** The Agent's avatar at the size its Direct messages row draws it. */
function AgentDmMark({ agentId, serverId }: { agentId: string; serverId: string }) {
    const agent = useAgentMark(serverId, agentId);
    return agent ? <LiveAgentAvatar agent={agent} serverId={serverId} size={24} /> : null;
}

function noPreload() {}

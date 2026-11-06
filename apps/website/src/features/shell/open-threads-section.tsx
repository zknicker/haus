import { Sidebar } from '@heroui-pro/react';
import { Link } from 'react-router-dom';
import { useChatNavigationEntry } from '../../hooks/servers/use-chats.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { useOpenThreadEntry, useOpenThreadLayout } from '../../hooks/threads/use-open-threads.ts';
import { useThreadRoute } from '../../hooks/threads/use-thread-opener.ts';
import { threadsRoute } from '../servers/server-routes.ts';
import { OpenThreadGlyph } from '../threads/open-thread-glyph.tsx';
import { openThreadStatusLine } from '../threads/open-thread-status.ts';
import { ChatGroup } from './chat-navigation-group.tsx';

/**
 * Threads still in motion for the viewer: a lens, not an attention tier, so it
 * carries no badge. It reads only its structure; each row reads its own entry.
 * Nothing renders until the read settles.
 */
export function OpenThreadsSection({ serverId, slug }: { serverId: string; slug: string }) {
    const layout = useOpenThreadLayout(serverId);
    if (!layout) {
        return null;
    }
    return (
        <ChatGroup
            label="Open threads"
            trailing={
                <Link className="pe-2 text-muted text-xs" to={threadsRoute(slug)}>
                    All threads{layout.hiddenCount > 0 ? ` +${layout.hiddenCount}` : ''}
                </Link>
            }
        >
            {layout.threadChatIds.length > 0 ? (
                <Sidebar.Menu aria-label="Open threads">
                    {layout.threadChatIds.map((threadChatId) => (
                        <OpenThreadRow
                            key={threadChatId}
                            serverId={serverId}
                            slug={slug}
                            threadChatId={threadChatId}
                        />
                    ))}
                </Sidebar.Menu>
            ) : null}
        </ChatGroup>
    );
}

function OpenThreadRow({
    serverId,
    slug,
    threadChatId,
}: {
    serverId: string;
    slug: string;
    threadChatId: string;
}) {
    const thread = useOpenThreadEntry(serverId, threadChatId);
    const parent = useChatNavigationEntry(serverId, thread?.parentChatId ?? '');
    const threadRoute = useThreadRoute(slug);
    const href = thread ? threadRoute(thread.parentChatId, thread.anchorMessageId) : '';
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, noPreload);
    if (!thread) {
        return null;
    }
    const context = parent ? (parent.kind === 'channel' ? `#${parent.name}` : 'DM') : null;

    return (
        <Sidebar.MenuItem href={href} id={threadChatId} ref={pressRef} textValue={thread.title}>
            <Sidebar.MenuIcon>
                <OpenThreadGlyph state={thread.state} />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <span className="flex min-w-0 flex-col">
                    <Sidebar.MenuLabel>{thread.title}</Sidebar.MenuLabel>
                    <span className="truncate text-muted text-xs">
                        {openThreadStatusLine(thread)}
                        {context ? ` · ${context}` : ''}
                    </span>
                </span>
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

function noPreload() {}

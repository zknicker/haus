import { Sidebar } from '@heroui-pro/react';
import { Link } from 'react-router-dom';
import { useOpenThreadLayout } from '../../hooks/threads/use-open-threads.ts';
import { threadsRoute } from '../servers/server-routes.ts';
import { useShowOpenThreads } from '../threads/show-open-threads.ts';
import { ChatGroup } from './chat-navigation-group.tsx';
import { OpenThreadRow } from './open-thread-row.tsx';

/**
 * The viewer's Threads in motion: Cloud Agent work, and conversations they
 * took part in. A lens, not an attention tier, so it carries no badge. It
 * reads only its structure; each row reads its own entry. Nothing renders
 * until the read settles.
 */
export function OpenThreadsSection(props: { currentPath: string; serverId: string; slug: string }) {
    return useShowOpenThreads() ? <OpenThreadsList {...props} /> : null;
}

function OpenThreadsList({
    currentPath,
    serverId,
    slug,
}: {
    currentPath: string;
    serverId: string;
    slug: string;
}) {
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
                            currentPath={currentPath}
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

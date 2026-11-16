import { Button } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { ArrowRight02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { useOpenThreadLayout } from '../../hooks/threads/use-open-threads.ts';
import { threadsRoute } from '../servers/server-routes.ts';
import { useShowOpenThreads } from '../threads/show-open-threads.ts';
import { ChatGroup } from './chat-navigation-group.tsx';
import { OpenThreadRow } from './open-thread-row.tsx';
import { OpenThreadsMoreRow } from './open-threads-more-row.tsx';
import { sidebarActionIconSize } from './section-header.tsx';

/**
 * The viewer's Threads in motion: Cloud Agent work, and conversations they
 * took part in. A lens, not an attention tier, so it carries no badge. It
 * reads only its structure; each row reads its own entry. Nothing renders
 * until the read settles, and nothing at all while no Thread is open.
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
    if (!layout || layout.threadChatIds.length === 0) {
        return null;
    }
    return (
        <ChatGroup action={<AllThreadsAction slug={slug} />} label="Threads">
            <Sidebar.Menu aria-label="Threads">
                {layout.threadChatIds.map((threadChatId) => (
                    <OpenThreadRow
                        currentPath={currentPath}
                        key={threadChatId}
                        serverId={serverId}
                        slug={slug}
                        threadChatId={threadChatId}
                    />
                ))}
                {layout.hiddenCount > 0 ? (
                    <OpenThreadsMoreRow hiddenCount={layout.hiddenCount} slug={slug} />
                ) : null}
            </Sidebar.Menu>
        </ChatGroup>
    );
}

/** The header's hover action: Go to the Threads page, like a sidebar row. */
function AllThreadsAction({ slug }: { slug: string }) {
    const navigate = useSidebarNavigate();
    return (
        <Button
            aria-label="All threads"
            isIconOnly
            onPress={() => navigate(threadsRoute(slug))}
            size="sm"
            variant="ghost"
        >
            <Icon aria-hidden="true" icon={ArrowRight02Icon} size={sidebarActionIconSize} />
        </Button>
    );
}

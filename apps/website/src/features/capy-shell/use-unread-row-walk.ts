import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { CapySidebarSection } from './sidebar-layout.ts';
import { nextUnreadHref, walkRows } from './unread-walk.ts';

export function useUnreadRowWalk({
    sections,
    serverId,
    slug,
}: {
    sections: readonly CapySidebarSection[] | null;
    serverId: string;
    slug: string;
}) {
    const utils = hausTrpc.useUtils();
    const navigate = useSidebarNavigate();
    const { pathname } = useLocation();
    const latest = React.useRef({ pathname, sections });
    React.useLayoutEffect(() => {
        latest.current = { pathname, sections };
    });

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const direction = walkDirection(event);
            if (!direction || event.defaultPrevented || isInDialog(event.target)) {
                return;
            }
            const rows = walkRows({
                chats: utils.chat.list.getData({ serverId }) ?? [],
                previews: utils.chat.unreadPreviews.getData({ serverId })?.previews ?? [],
                sections: latest.current.sections ?? [],
                slug,
            });
            const href = nextUnreadHref(rows, latest.current.pathname, direction);
            if (href) {
                event.preventDefault();
                navigate(href);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [navigate, serverId, slug, utils]);
}

function walkDirection(event: KeyboardEvent) {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
        return null;
    }
    if (event.key === 'ArrowDown') {
        return 'next' as const;
    }
    return event.key === 'ArrowUp' ? ('previous' as const) : null;
}

function isInDialog(target: EventTarget | null) {
    return target instanceof Element && target.closest('[role="dialog"]') !== null;
}

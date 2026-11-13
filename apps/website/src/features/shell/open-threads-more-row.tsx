import { Sidebar } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { threadsRoute } from '../servers/server-routes.ts';

/**
 * The Threads section's closing row when it folds rows away: a quiet count
 * that goes to the Threads page, muted the way HeroUI's own "More" row is.
 */
export function OpenThreadsMoreRow({ hiddenCount, slug }: { hiddenCount: number; slug: string }) {
    const href = threadsRoute(slug);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, noPreload);
    const label = `${hiddenCount} more`;

    return (
        <Sidebar.MenuItem href={href} id="open-threads-more" ref={pressRef} textValue={label}>
            <Sidebar.MenuIcon>
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel className="text-muted">{label}</Sidebar.MenuLabel>
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

function noPreload() {}

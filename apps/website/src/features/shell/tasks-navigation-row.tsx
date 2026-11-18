import { Sidebar } from '@heroui-pro/react';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { tasksRoute } from '../servers/server-routes.ts';
import { RouteTabIcon } from './route-tab-presentation.tsx';

/** The sidebar's one Tasks row: it opens the flat Tasks page (ADR 0052 decision 10). */
export function TasksNavigationRow({
    isCurrent,
    onPreload,
    slug,
}: {
    isCurrent: boolean;
    onPreload: () => void;
    slug: string;
}) {
    const href = tasksRoute(slug);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, onPreload);

    return (
        <Sidebar.MenuItem
            href={href}
            id="tasks"
            isCurrent={isCurrent}
            onHoverStart={onPreload}
            ref={pressRef}
            textValue="Tasks"
        >
            <Sidebar.MenuIcon>
                <RouteTabIcon size={16} tab="tasks" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel>Tasks</Sidebar.MenuLabel>
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

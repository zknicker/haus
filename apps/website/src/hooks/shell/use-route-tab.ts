import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { appRoutes } from '../../lib/app-routes.ts';

export const routeTabs = [
    { id: 'search', label: 'Search', path: appRoutes.search },
    { id: 'chat', label: 'Chat', path: appRoutes.chats },
    { id: 'activity', label: 'Activity', path: appRoutes.activity },
    { id: 'inbox', label: 'Inbox', path: appRoutes.inbox },
    { id: 'tasks', label: 'Tasks', path: appRoutes.tasks },
    { id: 'artifacts', label: 'Files', path: '/artifacts' },
    { id: 'members', label: 'Members', path: appRoutes.settingsMembers },
] as const;

type RouteTab = (typeof routeTabs)[number]['id'];

const routeTabIds = new Set<RouteTab>(routeTabs.map((tab) => tab.id));

function isRouteTab(value: string | null): value is RouteTab {
    return value !== null && routeTabIds.has(value as RouteTab);
}

export function getRouteTab(pathname: string): RouteTab | null {
    const segments = pathname.split('/').filter(Boolean);
    const primaryTab = segments[0] === 'dashboard' ? (segments[1] ?? null) : (segments[0] ?? null);

    if (primaryTab === 'chats') {
        return 'chat';
    }

    if (isRouteTab(primaryTab)) {
        return primaryTab;
    }

    return null;
}

export function useRouteTab() {
    const location = useLocation();
    const navigate = useNavigate();
    const activeTab = getRouteTab(location.pathname);

    return React.useMemo(
        () => ({
            activeTab,
            tabs: routeTabs,
            setActiveTab(nextTab: RouteTab) {
                const nextRoute = routeTabs.find((tab) => tab.id === nextTab)?.path;
                navigate(nextRoute ?? appRoutes.activity);
            },
        }),
        [activeTab, navigate]
    );
}

export type { RouteTab };

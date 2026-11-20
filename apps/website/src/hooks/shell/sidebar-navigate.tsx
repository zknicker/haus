import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteHistoryMode } from './same-route-push.ts';

export type SidebarNavigate = (
    href: string,
    options?: { flushSync?: boolean; replace?: boolean }
) => void;

const SidebarNavigateContext = React.createContext<SidebarNavigate | null>(null);

/**
 * One navigate for the sidebar's rows and menus that never changes. Router
 * hooks re-render their caller on every location change, and a desktop tab
 * switch moves the location, so every row read through `useNavigate`
 * re-rendered on each switch. The provider reads the router once; rows read
 * this context. A web push never duplicates the current route (`useRouteHistoryMode`).
 */
export function SidebarNavigateProvider({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const historyMode = useRouteHistoryMode();
    const latest = React.useRef({ historyMode, navigate });
    React.useLayoutEffect(() => {
        latest.current = { historyMode, navigate };
    });
    const stable = React.useCallback<SidebarNavigate>((href, options) => {
        const mode = latest.current.historyMode(href, options?.replace);
        if (mode !== 'skip') {
            latest.current.navigate(href, { ...options, replace: mode === 'replace' });
        }
    }, []);
    return <SidebarNavigateContext value={stable}>{children}</SidebarNavigateContext>;
}

export function useSidebarNavigate(): SidebarNavigate {
    const navigate = React.use(SidebarNavigateContext);
    if (!navigate) {
        throw new Error('Sidebar rows render inside SidebarNavigateProvider.');
    }
    return navigate;
}

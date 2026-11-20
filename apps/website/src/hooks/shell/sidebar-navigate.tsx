import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { skipsSameRoutePush } from './same-route-push.ts';

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
 * this context. A web push to the current route is skipped (`skipsSameRoutePush`).
 */
export function SidebarNavigateProvider({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const desktop = useOptionalDesktopTabs() !== null;
    const latest = React.useRef({ desktop, location, navigate });
    React.useLayoutEffect(() => {
        latest.current = { desktop, location, navigate };
    });
    const stable = React.useCallback<SidebarNavigate>((href, options) => {
        const current = latest.current;
        if (skipsSameRoutePush({ ...current, href, replace: options?.replace })) {
            return;
        }
        current.navigate(href, options);
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

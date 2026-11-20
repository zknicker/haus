import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { skipsSameRoutePush } from './same-route-push.ts';

/**
 * The router's `navigate` with one identity for the caller's lifetime, for
 * handing to a context many components read (HeroUI's router and sidebar
 * providers). A desktop shell's navigate changes with the focused tab, and an
 * inline wrapper changes every render; either re-renders every link below.
 * A web push to the current route is skipped (`skipsSameRoutePush`).
 */
export function useStableNavigate(): (href: string) => void {
    const navigate = useNavigate();
    const location = useLocation();
    const desktop = useOptionalDesktopTabs() !== null;
    const latest = useRef({ desktop, location, navigate });
    latest.current = { desktop, location, navigate };
    return useCallback((href: string) => {
        const current = latest.current;
        if (skipsSameRoutePush({ ...current, href })) {
            return;
        }
        current.navigate(href);
    }, []);
}

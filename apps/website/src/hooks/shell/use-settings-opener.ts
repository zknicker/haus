import * as React from 'react';
import { serverSettingsRoute } from '../../features/servers/server-routes.ts';
import {
    type DesktopTabCommands,
    useOptionalDesktopTabs,
} from '../desktop-tabs/desktop-tabs-context.ts';
import { currentOpenGesture, type OpenGesture } from '../desktop-tabs/tab-open-gesture.ts';

/**
 * The sidebar's Settings button. Desktop: the window's one Settings tab (ADR 0039), or for
 * ⌘-, middle-, or Shift-click a new tab after the left pane's selected tab like any row.
 * Web: a push to Settings. Stable for the caller's lifetime.
 */
export function useSettingsOpener(slug: string, navigate: (path: string) => void) {
    const tabs = useOptionalDesktopTabs();
    const latest = React.useRef({ navigate, slug, tabs });
    latest.current = { navigate, slug, tabs };
    return React.useCallback(() => {
        const current = latest.current;
        const path = serverSettingsRoute(current.slug);
        if (current.tabs) {
            openSettingsTab(current.tabs, path, currentOpenGesture());
        } else {
            current.navigate(path);
        }
    }, []);
}

export function openSettingsTab(
    tabs: Pick<DesktopTabCommands, 'openSettings' | 'openTab'>,
    path: string,
    gesture: OpenGesture
) {
    const location = { kind: 'app', path } as const;
    if (gesture === 'auto') {
        tabs.openSettings(location);
    } else {
        tabs.openTab(null, location, { background: gesture === 'backgroundTab' });
    }
}

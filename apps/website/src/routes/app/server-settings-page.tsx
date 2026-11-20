import { Outlet, useLocation, useOutletContext } from 'react-router-dom';
import type { ServerContextValue } from '../../features/servers/server-context.ts';
import { SettingsContentFrame } from '../../features/settings/layout/page.tsx';
import { SettingsBreadcrumb } from '../../features/settings/layout/settings-breadcrumb.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { resolveSettingsSection } from './server-route-state.ts';

export function ServerSettingsPage() {
    const context = useOutletContext<ServerContextValue>();
    useWindowTitle('Settings');
    const location = useLocation();
    // Skills is the full-bleed library browser, and a device page manages its
    // own scrolling under its band menu.
    const isFullContentRoute =
        location.pathname.endsWith('/settings/skills') ||
        /\/settings\/computers\/[^/]+$/u.test(location.pathname);

    return (
        <>
            {/* The frame owns the trail for every settings route, so a section
                never has to remember to say where it is. */}
            <SettingsBreadcrumb
                pathname={location.pathname}
                section={resolveSettingsSection(location.pathname, context.server.slug)}
                serverId={context.server.id}
                slug={context.server.slug}
            />
            <SettingsContentFrame isFullContentRoute={isFullContentRoute}>
                <Outlet context={context} />
            </SettingsContentFrame>
        </>
    );
}

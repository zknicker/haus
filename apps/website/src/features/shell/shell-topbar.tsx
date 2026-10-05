import * as React from 'react';
import { createPortal } from 'react-dom';
import { useOptionalDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useTabPresence } from '../../hooks/desktop-tabs/tab-presence.ts';
import { cn } from '../../lib/utils.ts';
import { useTabIdentity } from './use-tab-identity.ts';
import { WorkspaceBandTabLabel } from './workspace-band-tab-label.ts';

interface TopbarSlot {
    container: HTMLElement | null;
    setContainer: (element: HTMLElement | null) => void;
}

const TopbarContext = React.createContext<TopbarSlot | null>(null);

/**
 * Owns one topbar's slots; wrap the layout that renders ShellTopbar. The web
 * has one around the Server layout; on desktop each tab frame has its own.
 */
export function TopbarProvider({ children }: { children: React.ReactNode }) {
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    const slot = React.useMemo<TopbarSlot>(() => ({ container, setContainer }), [container]);
    return <TopbarContext value={slot}>{children}</TopbarContext>;
}

/**
 * A page column's top band. Pages fill it through PageTopbar. On the web it
 * tops the main column and keeps its height while a page registers nothing,
 * so chrome never jumps between routes. On desktop each tab frame renders one
 * under the window band's tab rows (DesktopTabBand); the tab already names the
 * page, so a band its page leaves empty collapses and the page starts at the
 * tab's top.
 */
export function ShellTopbar() {
    const slot = React.use(TopbarContext);
    const inTab = useTabPresence().tabId !== null;
    return (
        <header
            className={cn(
                'app-shell-band flex h-[var(--app-shell-band-height)] shrink-0 items-center px-3',
                // Read off the slot's DOM, so a portal landing in it shows the
                // band in the same frame, with no registration effect to lag.
                inTab && '[&:not(:has(>[data-topbar-slot]>*))]:hidden'
            )}
            data-window-drag-region={inTab ? undefined : ''}
        >
            <div
                className="flex min-w-0 flex-1 items-center"
                data-topbar-slot=""
                ref={slot?.setContainer}
            />
        </header>
    );
}

/**
 * Portals its children into the page's topbar band. Render one per routed
 * page; children compose SectionHeader (or any band content) as usual. Inside
 * a desktop tab, band content can drop the title its tab already shows
 * (`useWorkspaceBandTabLabel`).
 */
export function PageTopbar({ children }: { children: React.ReactNode }) {
    const slot = React.use(TopbarContext);
    const tabs = useOptionalDesktopTabs();
    const { tabId } = useTabPresence();
    if (!slot?.container) {
        return null;
    }
    const tab = tabId ? tabs?.tab(tabId) : null;
    return createPortal(
        tab ? <TabTitleScope location={currentLocation(tab)}>{children}</TabTitleScope> : children,
        slot.container
    );
}

function TabTitleScope({
    children,
    location,
}: {
    children: React.ReactNode;
    location: TabLocation;
}) {
    const { label } = useTabIdentity(location);
    return <WorkspaceBandTabLabel value={label || null}>{children}</WorkspaceBandTabLabel>;
}

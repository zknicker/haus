import * as React from 'react';
import { createPortal } from 'react-dom';
import {
    useOptionalDesktopTabs,
    useOptionalDesktopTabsSelector,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useTabId } from '../../hooks/desktop-tabs/tab-presence.ts';
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
    const inTab = useTabId() !== null;
    return (
        <header
            className={cn(
                'app-shell-band flex h-[var(--app-shell-band-height)] shrink-0 items-center px-3',
                // Read off the slot's DOM, so a portal landing in it shows the
                // band in the same frame, with no registration effect to lag.
                // An inactive kept page's (hidden) scope does not count as content.
                inTab &&
                    '[&:not(:has(>[data-topbar-slot]>:not([data-topbar-scope]),>[data-topbar-slot]>[data-topbar-scope]:not([hidden])>*))]:hidden'
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
 * Gives one kept page its own region of the band, shown only while `active`. A page kept
 * mounted inside a hidden `<Activity>` still portals its band here, and its nodes stay in
 * the slot (defeating the empty-band collapse) while the hidden tree's own hide lands in
 * deferred offscreen work, frames late. So the hide is decided here, outside that
 * boundary, in the same commit that reveals the next page.
 */
export function KeptTopbarScope({
    active,
    children,
}: {
    active: boolean;
    children: React.ReactNode;
}) {
    const slot = React.use(TopbarContext);
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    const scoped = React.useMemo<TopbarSlot>(() => ({ container, setContainer }), [container]);
    return (
        <>
            {slot?.container
                ? createPortal(
                      <div
                          className="contents"
                          data-topbar-scope=""
                          hidden={!active}
                          ref={setContainer}
                      />,
                      slot.container
                  )
                : null}
            <TopbarContext value={slot ? scoped : null}>{children}</TopbarContext>
        </>
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
    const tabId = useTabId();
    // Only this tab's location: another tab's change never re-renders the band.
    const location = useOptionalDesktopTabsSelector(useOptionalDesktopTabs(), (state) => {
        const tab = tabId ? state.tabs[tabId] : undefined;
        return tab ? currentLocation(tab) : null;
    });
    if (!slot?.container) {
        return null;
    }
    return createPortal(
        location ? <TabTitleScope location={location}>{children}</TabTitleScope> : children,
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

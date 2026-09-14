import { Sidebar } from '@heroui-pro/react';
import * as React from 'react';
import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import {
    appSidebarWidthLimits,
    useAppSidebarWidth,
} from '../../hooks/shell/use-app-sidebar-width.ts';
import { SidebarTitlebarStrip } from './sidebar-titlebar-strip.tsx';

/**
 * HeroUI's compact-sidebar spacing, taken from the design system's own scale
 * rather than a frozen literal, so a global density retune reaches it. Scoped to
 * the navigation rows rather than the whole Sidebar: HeroUI's Button rule sizes
 * its own glyphs as `size-4`, a spacing multiple, so scoping the element would
 * silently shrink every icon button in the header band and footer along with
 * the rows. Density moves whitespace, not iconography.
 */
const sidebarDensity = 'var(--spacing-compact)';

export type ShellSidebarPageId = 'members' | 'server' | 'settings' | 'tasks';

/**
 * The surface the sidebar draws on. The two differ in chrome, not in product:
 * the macOS desktop already has a native titlebar with the traffic lights in
 * it, and the web has nothing up there at all.
 */
export type SidebarSurface = 'macos-desktop' | 'web';

const SidebarSurfaceContext = React.createContext<SidebarSurface>('web');

/**
 * The surface `ShellSidebar` resolved, for the navigation below it. Anything
 * that forks on platform reads this; nothing reads the root class twice.
 */
export function useSidebarSurface(): SidebarSurface {
    return React.useContext(SidebarSurfaceContext);
}

interface ShellSidebarPageProps {
    ariaLabel: string;
    children: React.ReactNode;
    value: ShellSidebarPageId;
}

/** Shell-owned contextual sidebar. Route changes replace the left page instantly. */
export function ShellSidebar({
    activePage,
    children,
    footer,
    settingsAction,
    slug,
}: {
    activePage: ShellSidebarPageId;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /**
     * The sidebar's one piece of chrome. Where it lands is the shell's
     * business, not the action's: the titlebar strip's trailing end today, with
     * the footer's trailing end still wired as the other slot.
     */
    settingsAction?: React.ReactNode;
    /** The Server the strip's mark links home to, the way the Inbox row does. */
    slug: string;
}) {
    // The sidebar resizes like every pane: drag its trailing edge. The width
    // lives in a shared store because the token must be set above HeroUI's
    // offcanvas wrapper (see the AppLayout host), while the rail lives here.
    const sidebarWidth = useAppSidebarWidth();
    const surface = resolveSidebarSurface();
    const settingsSlot = resolveSettingsActionSlot(surface);
    let activePageContent: ShellSidebarPageProps | undefined;
    React.Children.forEach(children, (child) => {
        if (child === null) {
            return;
        }
        if (!React.isValidElement<ShellSidebarPageProps>(child)) {
            throw new Error('ShellSidebar children must be ShellSidebarPage descriptors.');
        }
        if (child.props.value === activePage) {
            activePageContent = child.props;
        }
    });

    if (!activePageContent) {
        throw new Error(`ShellSidebar is missing its active ${activePage} page.`);
    }

    return (
        <SidebarSurfaceContext.Provider value={surface}>
            <Sidebar aria-label={activePageContent.ariaLabel} className="relative">
                <ResizablePaneRail
                    aria-label="Resize sidebar"
                    maxWidth={appSidebarWidthLimits.max}
                    minWidth={appSidebarWidthLimits.min}
                    onResizeEnd={() => sidebarWidth.setResizing(false)}
                    onResizeStart={() => sidebarWidth.setResizing(true)}
                    onWidthChange={sidebarWidth.setWidth}
                    onWidthCommit={sidebarWidth.persistWidth}
                    side="right"
                    title="Resize sidebar"
                    width={sidebarWidth.width}
                />
                {/* Every surface reserves the strip; only the web puts the Haus
                    mark in it. On the macOS desktop the traffic lights already
                    lead that line, so the mark stays down on the Inbox row and
                    the strip carries the gear alone. */}
                <SidebarTitlebarStrip
                    leadsWithMark={surface === 'web'}
                    settingsAction={settingsSlot === 'titlebar' ? settingsAction : null}
                    slug={slug}
                />
                {/* `contents` carries the scale to every navigation row without adding a box. */}
                <div
                    className="contents"
                    style={{ '--spacing': sidebarDensity } as React.CSSProperties}
                >
                    {activePageContent.children}
                </div>
                {footer || settingsSlot === 'footer' ? (
                    <Sidebar.Footer>
                        {/* One line: live Agent activity reads from the leading
                            edge, and Settings sits at the trailing one whenever
                            the gear takes this slot instead of the titlebar
                            strip. `items-end` keeps it on the strip's last row,
                            and on its own line at the sidebar's bottom-right
                            when the strip has nothing to say. */}
                        <div className="flex w-full items-end gap-2">
                            <div className="min-w-0 flex-1">{footer}</div>
                            {settingsSlot === 'footer' ? settingsAction : null}
                        </div>
                    </Sidebar.Footer>
                ) : null}
            </Sidebar>
        </SidebarSurfaceContext.Provider>
    );
}

/**
 * Which surface this is, read once per render and handed down.
 *
 * `main.tsx` stamps `macos-electron` on the root before the app mounts and
 * never toggles it afterwards, so one read is the whole answer — no listener,
 * no state. `shell.css` forks on the same class, so the two sides of a
 * platform difference always agree. Outside a document (SSR, markup tests) the
 * web is the honest default: the desktop is the surface that has to announce
 * itself.
 */
function resolveSidebarSurface(): SidebarSurface {
    if (typeof document === 'undefined') {
        return 'web';
    }
    return document.documentElement.classList.contains('macos-electron') ? 'macos-desktop' : 'web';
}

/**
 * Where the Settings gear goes.
 *
 * Every surface reserves the titlebar strip (`shell.css`) — the traffic lights
 * are why macOS has one, the air above the lead row is why the web took the
 * same one — and both have room for the gear at its trailing end. So both
 * surfaces resolve to the strip today, and the gear is rendered where it is
 * drawn so the tab order follows the eye.
 *
 * It still takes the surface rather than answering flat, because this is the
 * question that would fork first: the footer slot stays wired rather than
 * deleted, and the footer is where the gear goes back to if one surface's strip
 * stops earning it.
 */
function resolveSettingsActionSlot(surface: SidebarSurface): 'footer' | 'titlebar' {
    switch (surface) {
        case 'macos-desktop':
            return 'titlebar';
        case 'web':
            return 'titlebar';
    }
}

/** Declarative page marker consumed by ShellSidebar. */
export function ShellSidebarPage({ children }: ShellSidebarPageProps) {
    return children;
}

/**
 * Frame inside one contextual sidebar page: the page's groups, in the
 * sidebar's scrollable content.
 *
 * No page carries a header band. A sidebar page leads with a navigation row —
 * Inbox in chat navigation, Back on the settings pages — and `shell.css` puts
 * that first row in the shared shell band, so its midline meets the content
 * topbar's across the divider without a band element to approximate it.
 */
export function ShellSidebarPageContent({ children }: { children: React.ReactNode }) {
    return <Sidebar.Content>{children}</Sidebar.Content>;
}

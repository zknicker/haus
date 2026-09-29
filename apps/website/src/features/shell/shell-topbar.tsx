import { Button } from '@heroui/react';
import { BubbleChatIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspaceTabs } from './browser-workspace-tabs.tsx';

interface TopbarSlot {
    container: HTMLElement | null;
    setContainer: (element: HTMLElement | null) => void;
}

const TopbarContext = React.createContext<TopbarSlot | null>(null);

/** Owns the shell topbar slot; wrap the layout that renders ShellTopbar. */
export function TopbarProvider({ children }: { children: React.ReactNode }) {
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    const slot = React.useMemo<TopbarSlot>(() => ({ container, setContainer }), [container]);
    return <TopbarContext value={slot}>{children}</TopbarContext>;
}

/**
 * The shell's one topbar band above the routed content. Pages fill it
 * through PageTopbar; the band (and its height) render even while a page
 * registers nothing, so chrome never jumps between routes.
 */
export function ShellTopbar() {
    const slot = React.use(TopbarContext);
    const workspace = useBrowserWorkspace();
    const desktop = Boolean(getDesktopBridge()?.browserCommand);
    const browserActive =
        workspace?.state.activeId !== null && workspace?.state.activeId !== undefined;
    return (
        <header
            className={
                desktop
                    ? 'workspace-titlebar app-shell-band'
                    : 'app-shell-band flex h-[var(--app-shell-band-height)] shrink-0 items-center px-3'
            }
            data-window-drag-region=""
        >
            <div className="workspace-tab-strip flex min-w-0 flex-1 items-center gap-2">
                <div
                    className={
                        desktop
                            ? 'workspace-tab workspace-primary-tab'
                            : 'flex min-w-0 flex-1 items-center'
                    }
                    data-active={!browserActive}
                >
                    {desktop ? (
                        <Button
                            aria-pressed={!browserActive}
                            onPress={() => workspace?.command({ kind: 'select', id: null })}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={BubbleChatIcon} size={16} />
                            <span className="max-w-48 truncate">{workspace?.routeLabel}</span>
                        </Button>
                    ) : null}
                    {!desktop && workspace && !workspace.chatRoute && !browserActive ? (
                        <span className="text-sm">{workspace.routeLabel}</span>
                    ) : null}
                    <div
                        className={
                            desktop
                                ? 'flex shrink-0 items-center'
                                : 'flex min-w-0 flex-1 items-center'
                        }
                        ref={slot?.setContainer}
                    />
                </div>
                {desktop ? <BrowserWorkspaceTabs /> : null}
            </div>
        </header>
    );
}

/**
 * Portals its children into the shell topbar band. Render one per routed
 * page; children compose SectionHeader (or any band content) as usual.
 */
export function PageTopbar({ children }: { children: React.ReactNode }) {
    const slot = React.use(TopbarContext);

    if (!slot?.container) {
        return null;
    }

    return createPortal(children, slot.container);
}

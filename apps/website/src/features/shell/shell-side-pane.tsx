import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils.ts';

interface SidePaneSlot {
    container: HTMLElement | null;
    setContainer: (element: HTMLElement | null) => void;
    setTakeover: (takeover: boolean) => void;
    takeover: boolean;
}

const SidePaneContext = React.createContext<SidePaneSlot | null>(null);

/** Owns the app-level side-pane slot beside the primary content column. */
export function SidePaneProvider({ children }: { children: React.ReactNode }) {
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    const [takeover, setTakeover] = React.useState(false);
    const slot = React.useMemo<SidePaneSlot>(
        () => ({ container, setContainer, setTakeover, takeover }),
        [container, takeover]
    );

    return <SidePaneContext value={slot}>{children}</SidePaneContext>;
}

/** The app frame that gives primary content and side panes sibling columns. */
export function ShellFrame({ children }: { children: React.ReactNode }) {
    const slot = React.use(SidePaneContext);

    return (
        <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
            <div
                className={cn(
                    'min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
                    slot?.takeover ? 'hidden' : 'flex'
                )}
            >
                {children}
            </div>
            <div
                className={cn(
                    'flex h-full min-h-0',
                    slot?.takeover ? 'min-w-0 flex-1' : 'shrink-0'
                )}
                data-slot="shell-side-pane"
                ref={slot?.setContainer}
            />
        </div>
    );
}

/** Portals a page-owned pane into the app-level side-pane column. */
export function ShellSidePane({
    children,
    takeover = false,
}: {
    children: React.ReactNode;
    takeover?: boolean;
}) {
    const slot = React.use(SidePaneContext);
    const setTakeover = slot?.setTakeover;

    React.useLayoutEffect(() => {
        setTakeover?.(takeover);
        return () => setTakeover?.(false);
    }, [setTakeover, takeover]);

    return slot?.container ? createPortal(children, slot.container) : null;
}

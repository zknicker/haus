import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useDesktopTabs } from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { PaneSide } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';
import { parseTabDragMessage } from '../../../lib/desktop-tab-drag.ts';
import { inboxRoute } from '../../servers/server-routes.ts';
import { createTabDragEngine, type TabDragEngine } from './tab-drag-engine.ts';
import { handleTabDragMessage } from './tab-drag-messages.ts';
import { projectRow } from './tab-drag-projection.ts';
import { useTabDragView, useTabDragViewStore } from './tab-drag-view.ts';
import { createTabKeyboardMove } from './tab-keyboard-move.ts';
import { useRowFlip } from './use-row-flip.ts';
import { useTabStripReport } from './use-tab-strip-report.ts';

interface TabRowsDragValue {
    engine: TabDragEngine;
    keyboard: ReturnType<typeof createTabKeyboardMove>;
}

const TabRowsDragContext = React.createContext<TabRowsDragValue | null>(null);

/**
 * The window band's one tab drag (ADR 0039), Chrome-style: a press applies
 * Chrome's selection rules at once, then the pressed tab's selection (one
 * tab, or a multi-selection gathered side by side) follows the pointer along
 * its row while its neighbors slide aside; it crosses into the other pane's
 * row the same way. Pulled well off the band it tears off into a window of
 * its own that follows the cursor, and over another same-Server window's band
 * it joins that window's row. Web views stay covered by their stills for the whole
 * drag (`coverBrowserViews`), or their native views would swallow it.
 */
export function TabRowsDrag({
    band,
    children,
}: {
    band: React.RefObject<HTMLElement | null>;
    children: React.ReactNode;
}) {
    const layer = React.useRef<HTMLDivElement | null>(null);
    const tabs = useDesktopTabs();
    const { slug = '' } = useParams();
    const view = useTabDragViewStore();
    const latest = React.useRef(tabs);
    latest.current = tabs;
    const [value] = React.useState<TabRowsDragValue>(() => ({
        engine: createTabDragEngine({
            band: () => band.current,
            bridge: getDesktopBridge,
            layer: () => layer.current,
            route: inboxRoute(slug),
            serverId: tabs.serverId,
            tabs: () => latest.current,
            view,
        }),
        keyboard: createTabKeyboardMove(() => latest.current),
    }));
    const report = useTabStripReport(band, tabs.serverId);
    React.useEffect(() => {
        const { engine } = value;
        const unsubscribe = getDesktopBridge()?.onTabDrag?.((raw) => {
            const message = parseTabDragMessage(raw);
            if (message) {
                handleTabDragMessage(
                    engine,
                    { band: () => band.current, tabs: () => latest.current },
                    message,
                    report
                );
            }
        });
        return () => {
            unsubscribe?.();
            engine.teardown();
            // The body previews from this view; a band gone mid-drag must not strand it.
            view.set(null);
        };
    }, [band, report, value, view]);
    return (
        <TabRowsDragContext value={value}>
            {children}
            {/* Filled imperatively with look-only copies of the dragged tabs (`tab-drag-layer.ts`). */}
            <div aria-hidden="true" className="workspace-tab-drag-layer" ref={layer} />
        </TabRowsDragContext>
    );
}

const noTabs: readonly string[] = [];

/**
 * A row's tabs as drawn this frame: the dragged tabs at their slot. Also slides
 * the row's tabs into place and repaints the dragged tab once React has
 * committed, since its offset depends on the new layout.
 */
export function useDraggedRow(
    list: React.RefObject<HTMLElement | null>,
    row: PaneSide
): { draggingIds: readonly string[]; tabIds: readonly string[] } {
    const { engine } = useTabRowsDrag();
    const tabs = useDesktopTabs();
    const view = useTabDragView();
    const tabIds = React.useMemo(
        () =>
            projectRow(
                tabs.state,
                row,
                view ? { slot: view.slot, tabIds: view.draggingIds } : null
            ),
        [row, tabs.state, view]
    );
    const draggingIds = React.useMemo(
        () => (view ? view.draggingIds.filter((id) => tabIds.includes(id)) : noTabs),
        [tabIds, view]
    );
    useRowFlip(list, tabIds, draggingIds, {
        arrivingWidth: engine.paintedWidth,
        paint: engine.paint,
    });
    React.useLayoutEffect(() => {
        if (draggingIds.length > 0) {
            engine.paint();
        }
    });
    return { draggingIds, tabIds };
}

/** A tab's pointer and keyboard handlers for the drag. */
export function useTabDragHandlers(tabId: string) {
    const { engine, keyboard } = useTabRowsDrag();
    return {
        onKeyDown: (event: React.KeyboardEvent) => keyboard(tabId, event),
        onPointerDown: (event: React.PointerEvent) => engine.press(tabId, event),
    };
}

function useTabRowsDrag(): TabRowsDragValue {
    const value = React.use(TabRowsDragContext);
    if (!value) {
        throw new Error('Tab rows need TabRowsDrag.');
    }
    return value;
}

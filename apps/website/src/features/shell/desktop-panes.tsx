import { Resizable } from '@heroui-pro/react/resizable';
import * as React from 'react';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import {
    beginDesktopPointerDrag,
    setDesktopPaneDivider,
    setPrimaryPaneShare,
    usePrimaryPaneShare,
} from './desktop-pane-drag.ts';
import { DesktopTabLayer, type RenderTabFrame, usePaneFocus } from './desktop-tab-layer.tsx';
import { usePaneRects } from './use-pane-rects.ts';

/** The ADR 0039 pane minimum: the retired side pane's 420px. */
const paneMinSize = '420px';

/**
 * The desktop window body (ADR 0039): one pane, or two side by side with a
 * resizable divider. Panes are geometry and focus only. Every mounted tab
 * frame renders in one layer above them (`DesktopTabLayer`), keyed by tab and
 * never reparented, positioned over its pane's measured rect
 * (`usePaneRects`). Moving a tab between panes or a drag preview only changes which rect a frame sits over, so no tab remounts.
 *
 * Pressing or focusing inside a pane makes it the focused pane, which the
 * sidebar, ⌘T, and ⌘W act on; frames carry the same handlers for their pane.
 */
export function DesktopPanes({ renderTab }: { renderTab: RenderTabFrame }) {
    const tabs = useDesktopTabs();
    const share = usePrimaryPaneShare();
    const split = tabs.state.secondary !== null;
    const stage = React.useRef<HTMLDivElement | null>(null);
    React.useLayoutEffect(() => {
        if (!split) {
            return;
        }
        setDesktopPaneDivider(
            stage.current?.querySelector<HTMLElement>('.desktop-pane-divider') ?? null
        );
        return () => setDesktopPaneDivider(null);
    }, [split]);
    usePaneRects(stage, split);
    return (
        <div className="desktop-panes" ref={stage}>
            <Resizable
                className="desktop-pane-group"
                onLayoutChange={(layout) => {
                    const primary = layout.primary;
                    if (split && primary !== undefined) {
                        setPrimaryPaneShare(primary);
                    }
                }}
                onPointerDownCapture={(event) => {
                    if ((event.target as Element).closest('[data-slot="resizable-handle"]')) {
                        beginDesktopPointerDrag();
                    }
                }}
            >
                <Resizable.Panel
                    defaultSize={split ? share : 100}
                    id="primary"
                    minSize={split ? paneMinSize : undefined}
                >
                    <Pane pane="primary" />
                </Resizable.Panel>
                {split ? (
                    <>
                        <Resizable.Handle
                            aria-label="Resize panes"
                            className="desktop-pane-divider"
                        />
                        <Resizable.Panel
                            defaultSize={100 - share}
                            id="secondary"
                            minSize={paneMinSize}
                        >
                            <Pane pane="secondary" />
                        </Resizable.Panel>
                    </>
                ) : null}
            </Resizable>
            <DesktopTabLayer renderTab={renderTab} />
        </div>
    );
}

/** A pane's rect: the frames above it are positioned from its measured box. */
function Pane({ pane }: { pane: PaneSide }) {
    const tabs = useDesktopTabs();
    const focus = usePaneFocus(pane);
    return (
        <div
            className="desktop-pane"
            data-focused={tabs.state.focusedPane === pane || undefined}
            data-pane={pane}
            onFocusCapture={focus}
            onPointerDownCapture={focus}
        />
    );
}

import { isMacPlatform } from '../../../hooks/browser/browser-shortcut-keys.ts';
import type { DesktopTabsApi } from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { paneOfTab } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { desktopTabsReducer } from '../../../hooks/desktop-tabs/desktop-tabs-reducer.ts';
import {
    isTabSelected,
    paneSelection,
    type SelectionGesture,
} from '../../../hooks/desktop-tabs/desktop-tabs-selection.ts';
import { measureBand } from './tab-band-dom.ts';
import { draggedBoxes, type Point } from './tab-drag-geometry.ts';

/**
 * A press on a tab, Chrome's `Tab::OnMousePressed`: Shift-Command adds the
 * range from the anchor, Shift selects it, Command toggles the tab, and a
 * plain press on an unselected tab selects it alone. A plain press on a tab
 * already in a multi-selection changes nothing yet, so the whole selection can
 * drag; if it ends as a click (`collapseOnClick`), the tab is selected alone.
 * Returns the tabs a drag from here would carry (the pane's selection after
 * the press), or null when the press deselected the tab: Chrome does not drag
 * a tab Command-click just deselected.
 */
export function pressTab(
    tabs: DesktopTabsApi,
    tabId: string,
    modifiers: Pick<PointerEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>
): { collapseOnClick: boolean; tabIds: readonly string[] } | null {
    const pane = paneOfTab(tabs.state, tabId);
    if (!pane) {
        return null;
    }
    const gesture = selectionGesture(modifiers);
    let next = tabs.state;
    let collapseOnClick = false;
    if (gesture) {
        tabs.extendSelection(tabId, gesture);
        next = desktopTabsReducer(next, { gesture, kind: 'extendSelection', tabId });
    } else if (isTabSelected(next, tabId) && paneSelection(next, pane).length > 1) {
        collapseOnClick = true;
        tabs.focusPane(pane);
    } else {
        tabs.select(tabId);
        next = desktopTabsReducer(next, { kind: 'select', tabId });
    }
    const tabIds = paneSelection(next, pane);
    return tabIds.includes(tabId) ? { collapseOnClick, tabIds } : null;
}

/**
 * The pointer's offset from the dragged block's top left: inside the pressed
 * tab, plus the dragged tabs drawn before it, so the block gathers around the
 * pressed tab under the pointer.
 */
export function blockGrab(
    band: HTMLElement,
    element: Element,
    tabIds: readonly string[],
    tabId: string,
    point: Point
): Point {
    const rect = element.getBoundingClientRect();
    const layout = measureBand(band);
    const gap = layout.rows.find((row) => row.tabs.some((tab) => tab.id === tabId))?.gap ?? 0;
    const before = draggedBoxes(layout, tabIds.slice(0, Math.max(0, tabIds.indexOf(tabId))));
    const lead = before.reduce((sum, box) => sum + box.width + gap, 0);
    return { x: point.x - rect.left + lead, y: point.y - rect.top };
}

function selectionGesture(
    modifiers: Pick<PointerEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>
): SelectionGesture | null {
    // macOS Control-click is a secondary click; Command is the selection modifier there.
    const command = isMacPlatform() ? modifiers.metaKey : modifiers.ctrlKey;
    if (modifiers.shiftKey) {
        return command ? 'addRange' : 'range';
    }
    return command ? 'toggle' : null;
}

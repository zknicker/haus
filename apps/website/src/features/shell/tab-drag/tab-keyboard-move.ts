import type { DesktopTabsApi } from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { paneOfTab } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { isTabSelected } from '../../../hooks/desktop-tabs/desktop-tabs-selection.ts';
import type { Slot } from './tab-drag-geometry.ts';
import { slotOfTab, slotTarget } from './tab-drag-projection.ts';

/**
 * Keyboard reordering on a focused tab: Space picks it up, Left and Right
 * move it along its row (the row slides as it would for the pointer), Space
 * or Enter puts it down, Escape puts it back where it was.
 */
export function createTabKeyboardMove(tabs: () => DesktopTabsApi) {
    let grabbed: { origin: Slot; tabId: string } | null = null;
    const moveTo = (tabId: string, slot: Slot) => {
        const api = tabs();
        const target = slotTarget(api.state, [tabId], slot);
        if (target) {
            api.move([tabId], target);
        }
    };
    return (tabId: string, event: TabKey) => {
        const state = tabs().state;
        if (grabbed?.tabId !== tabId && extendsSelection(tabs(), tabId, event)) {
            return;
        }
        if (grabbed?.tabId !== tabId) {
            const origin = event.key === ' ' ? slotOfTab(state, tabId) : null;
            grabbed = origin ? { origin, tabId } : null;
            return;
        }
        const slot = slotOfTab(state, tabId);
        switch (event.key) {
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault();
                if (slot) {
                    moveTo(tabId, {
                        ...slot,
                        index: slot.index + (event.key === 'ArrowLeft' ? -1 : 1),
                    });
                }
                return;
            case 'Escape':
                event.preventDefault();
                moveTo(tabId, grabbed.origin);
                grabbed = null;
                return;
            case ' ':
            case 'Enter':
            case 'Tab':
                grabbed = null;
                return;
            default:
                return;
        }
    };
}

type TabKey = Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'preventDefault' | 'shiftKey'
>;

/**
 * Chrome's `Tab::OnKeyPressed`: Shift-Left and Shift-Right on a focused tab
 * select it if it is not, extend the selection to its neighbor, and move
 * focus there.
 */
function extendsSelection(api: DesktopTabsApi, tabId: string, event: TabKey): boolean {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!(step && event.shiftKey) || event.altKey || event.ctrlKey || event.metaKey) {
        return false;
    }
    event.preventDefault();
    const pane = paneOfTab(api.state, tabId);
    const row = pane ? (api.state[pane]?.tabIds ?? []) : [];
    const neighbor = row[row.indexOf(tabId) + step];
    if (!neighbor) {
        return true;
    }
    if (!isTabSelected(api.state, tabId)) {
        api.select(tabId);
    }
    api.extendSelection(neighbor, 'range');
    document
        .querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(neighbor)}"] > button`)
        ?.focus();
    return true;
}

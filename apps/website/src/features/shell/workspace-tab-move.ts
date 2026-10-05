import type { DesktopTabsState, PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { paneOfTab } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';

/**
 * The tab menu's pane move (ADR 0039) for the tabs it acts on (one, or a
 * multi-selection of one row): right-pane tabs move to the end of the left
 * pane; left-pane tabs move to the end of the right pane, opening it when the
 * window shows one pane. Every tab of a one-pane window has nowhere to go.
 */
export function tabPaneMove(
    state: DesktopTabsState,
    tabIds: readonly string[]
): { label: string; to: { index: number; pane: PaneSide } } | null {
    const pane = tabIds[0] ? paneOfTab(state, tabIds[0]) : null;
    const many = tabIds.length > 1;
    if (pane === 'secondary') {
        return {
            label: many ? 'Move tabs to left pane' : 'Move to left pane',
            to: { index: state.primary?.tabIds.length ?? 0, pane: 'primary' },
        };
    }
    const all = (state.primary?.tabIds.length ?? 0) <= tabIds.length;
    if (pane !== 'primary' || (all && !state.secondary)) {
        return null;
    }
    return {
        label: many ? 'Move tabs to right pane' : 'Move to right pane',
        to: { index: state.secondary?.tabIds.length ?? 0, pane: 'secondary' },
    };
}

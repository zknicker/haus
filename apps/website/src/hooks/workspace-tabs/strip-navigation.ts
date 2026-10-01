import { type WorkspaceTabRef, workspaceTabId } from './workspace-tabs-model.ts';

/**
 * The tab `offset` steps from the selected one in strip order, wrapping
 * (Control-Tab). With the selection outside the strip (the routed page beside
 * the side pane), next is the first tab and previous the last.
 */
export function relativeTab(
    tabs: readonly WorkspaceTabRef[],
    active: WorkspaceTabRef,
    offset: 1 | -1
): WorkspaceTabRef | null {
    if (tabs.length === 0) {
        return null;
    }
    const current = tabs.findIndex((ref) => workspaceTabId(ref) === workspaceTabId(active));
    if (current < 0) {
        return (offset === 1 ? tabs[0] : tabs.at(-1)) ?? null;
    }
    return tabs[(current + offset + tabs.length) % tabs.length] ?? null;
}

/** The strip's `position`th tab (Command-1 … Command-8); 9 is always the last tab. */
export function numberedTab(
    tabs: readonly WorkspaceTabRef[],
    position: number
): WorkspaceTabRef | null {
    return (position === 9 ? tabs.at(-1) : tabs[position - 1]) ?? null;
}

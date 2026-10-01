import * as React from 'react';
import type { WorkspaceSelection, WorkspaceTabsState } from './workspace-tabs-model.ts';
import type { WorkspaceTabsAction } from './workspace-tabs-reducer.ts';

export interface WorkspaceLayoutCommands {
    /** Expands the side pane's tabs into one strip, or collapses the strip back into split mode. */
    toggleMode: () => void;
    /**
     * Hides or shows the side pane; in expanded mode it collapses back to split
     * mode with the pane showing. A pane shown with nothing selected shows its
     * last tab (useWorkspaceTabs).
     */
    toggleSidePane: () => void;
}

/** The band's layout controls (ADR 0038, after Codex). */
export function useWorkspaceLayout({
    dispatch,
    latest,
}: {
    dispatch: React.Dispatch<WorkspaceTabsAction>;
    latest: React.RefObject<{ selection: WorkspaceSelection; state: WorkspaceTabsState }>;
}): WorkspaceLayoutCommands {
    const toggleSidePane = React.useCallback(() => {
        const { selection, state } = latest.current;
        if (state.mode === 'expanded') {
            dispatch({ kind: 'collapse' });
            return;
        }
        dispatch({ kind: 'sidePane', visible: !selection.sidePaneShown });
    }, [dispatch, latest]);
    const toggleMode = React.useCallback(() => {
        const { selection, state } = latest.current;
        if (state.mode === 'split') {
            dispatch({ kind: 'expand', showClosable: selection.shownClosable !== null });
            return;
        }
        dispatch({ kind: 'collapse' });
    }, [dispatch, latest]);
    return React.useMemo(() => ({ toggleMode, toggleSidePane }), [toggleMode, toggleSidePane]);
}

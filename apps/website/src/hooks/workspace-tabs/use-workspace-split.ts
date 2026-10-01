import * as React from 'react';
import { insertTabAt } from './closed-tabs.ts';
import {
    type AppTabRef,
    foldSplitIntoMain,
    sameTab,
    selectionAfterClose,
    tabGroup,
    type WorkspaceTabGroup,
    type WorkspaceTabRef,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';
import type { WorkspaceTabsAction } from './workspace-tabs-reducer.ts';

export interface WorkspaceSplitCommands {
    /** Moves an App-local tab to the other group, at `index` in that strip (end by default). */
    moveTab: (ref: AppTabRef, to: WorkspaceTabGroup, index?: number) => void;
    reorderSplitTabs: (order: AppTabRef[]) => void;
    /**
     * Opens the split, moving the selected App-local main tab across, or closes
     * it, folding its tabs into the main strip after the selected tab.
     */
    toggleSplit: () => void;
}

interface SplitInput {
    dispatch: React.Dispatch<WorkspaceTabsAction>;
    latest: React.RefObject<{
        activeTab: WorkspaceTabRef;
        state: WorkspaceTabsState;
        tabs: WorkspaceTabRef[];
    }>;
    releaseBrowser: () => void;
    selectTab: (ref: WorkspaceTabRef) => void;
}

/** The split's commands. A tab leaving the main strip hands main selection to its neighbor. */
export function useWorkspaceSplit({
    dispatch,
    latest,
    releaseBrowser,
    selectTab,
}: SplitInput): WorkspaceSplitCommands {
    // Leaves the main strip's selection on a neighbor while focus stays on the split.
    const leaveMain = React.useCallback(
        (ref: AppTabRef) => {
            const { tabs } = latest.current;
            selectTab(selectionAfterClose(tabs, ref));
            dispatch({ kind: 'focus', group: 'split' });
        },
        [dispatch, latest, selectTab]
    );
    const moveTab = React.useCallback(
        (ref: AppTabRef, to: WorkspaceTabGroup, index?: number) => {
            const { activeTab, state, tabs } = latest.current;
            const from = tabGroup(state, ref);
            if (from === null || from === to) {
                return;
            }
            if (to === 'split') {
                dispatch({ kind: 'moveToSplit', index, ref });
                if (sameTab(activeTab, ref)) {
                    leaveMain(ref);
                }
                return;
            }
            dispatch({
                kind: 'moveToMain',
                order: insertTabAt(tabs, ref, index ?? tabs.length),
                ref,
            });
            releaseBrowser();
        },
        [dispatch, latest, leaveMain, releaseBrowser]
    );
    const reorderSplitTabs = React.useCallback(
        (order: AppTabRef[]) => dispatch({ kind: 'reorderSplit', order }),
        [dispatch]
    );
    const toggleSplit = React.useCallback(() => {
        const { activeTab, state, tabs } = latest.current;
        if (state.split.open) {
            dispatch({
                kind: 'closeSplit',
                order: foldSplitIntoMain(tabs, activeTab, state.split.order),
            });
            return;
        }
        const moving = state.mainActive;
        dispatch({ kind: 'openSplit' });
        if (moving) {
            leaveMain(moving);
        }
    }, [dispatch, latest, leaveMain]);
    return React.useMemo(
        () => ({ moveTab, reorderSplitTabs, toggleSplit }),
        [moveTab, reorderSplitTabs, toggleSplit]
    );
}

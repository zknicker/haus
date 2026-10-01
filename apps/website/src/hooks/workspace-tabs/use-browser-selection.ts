import * as React from 'react';
import {
    type BrowserCommand,
    type BrowserWorkspaceState,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';
import type { WorkspaceTabsAction } from './workspace-tabs-reducer.ts';

/**
 * Keeps Electron's browser selection and the tab state in step. A browser tab
 * Electron selects (a link, a popup, a new tab) is the selected closable tab
 * and shows — except the picks Electron reports while it is still releasing
 * its page for an App-local tab (closing the selected page reports its own
 * pick first).
 */
export function useBrowserSelection({
    activeId,
    dispatch,
    latest,
    run,
}: {
    /** Electron's selected browser tab. */
    activeId: string | null;
    dispatch: React.Dispatch<WorkspaceTabsAction>;
    latest: React.RefObject<{ browser: BrowserWorkspaceState }>;
    run: (input: BrowserCommand) => Promise<unknown>;
}) {
    const releasing = React.useRef(false);
    React.useEffect(() => {
        if (!activeId) {
            releasing.current = false;
        } else if (!releasing.current) {
            dispatch({ kind: 'selectBrowser' });
        }
    }, [activeId, dispatch]);
    /** Deselects Electron's page so an App-local tab can be the selected closable tab. */
    const releaseBrowser = React.useCallback(() => {
        if (latest.current.browser.activeId) {
            releasing.current = true;
            void run({ kind: 'select', id: null });
        }
    }, [latest, run]);
    /** Selects and shows a browser tab, even one Electron already has selected behind a hidden pane. */
    const selectBrowser = React.useCallback(
        (id: string) => {
            releasing.current = false;
            if (latest.current.browser.activeId === id) {
                dispatch({ kind: 'selectBrowser' });
            } else {
                void run({ kind: 'select', id });
            }
        },
        [dispatch, latest, run]
    );
    // Opening a page Electron already has selected changes no selection, so it reveals here.
    const command = React.useCallback(
        (input: BrowserCommand) => {
            const before = latest.current.browser.activeId;
            void run(input).then((value) => {
                const opened = input.kind === 'open' || input.kind === 'new';
                if (opened && before && parseBrowserWorkspace(value)?.activeId === before) {
                    dispatch({ kind: 'selectBrowser' });
                }
            });
        },
        [dispatch, latest, run]
    );
    return { command, releaseBrowser, selectBrowser };
}

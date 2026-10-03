import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type BrowserCommand,
    type BrowserWorkspaceState,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';
import { createBrowserRelease } from './browser-release.ts';
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
    const [release] = React.useState(createBrowserRelease);
    React.useEffect(() => {
        if (release.accept(activeId)) {
            dispatch({ kind: 'selectBrowser' });
        }
    }, [activeId, dispatch, release]);
    // Electron asks to reveal its selected page: a link re-opened the page
    // already selected (no selection change to notice).
    React.useEffect(
        () =>
            getDesktopBridge()?.onBrowserReveal?.(() => {
                release.cancel();
                if (latest.current.browser.activeId) {
                    dispatch({ kind: 'selectBrowser' });
                }
            }),
        [dispatch, latest, release]
    );
    /** Deselects Electron's page so an App-local tab can be the selected closable tab. */
    const releaseBrowser = React.useCallback(() => {
        if (latest.current.browser.activeId) {
            release.begin();
            void run({ kind: 'select', id: null }).then((value) =>
                release.settle(parseBrowserWorkspace(value)?.activeId)
            );
        }
    }, [latest, release, run]);
    /** Selects and shows a browser tab, even one Electron already has selected behind a hidden pane. */
    const selectBrowser = React.useCallback(
        (id: string) => {
            release.cancel();
            if (latest.current.browser.activeId === id) {
                dispatch({ kind: 'selectBrowser' });
            } else {
                void run({ kind: 'select', id });
            }
        },
        [dispatch, latest, release, run]
    );
    return { releaseBrowser, selectBrowser };
}

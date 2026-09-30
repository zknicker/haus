import { toast } from '@heroui/react';
import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type BrowserCommand,
    type BrowserWorkspaceState,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';
import { type ClosedTab, closedTabEntry, insertTabAt, rememberClosedTab } from './closed-tabs.ts';
import {
    type ArtifactTab,
    type ClosableTabRef,
    parseWorkspaceTabs,
    primaryTabRef,
    resolveWorkspaceTabs,
    selectionAfterClose,
    serializeWorkspaceTabs,
    type WorkspaceArtifactTarget,
    type WorkspaceTabRef,
    workspaceTabId,
    workspaceTabsReducer,
} from './workspace-tabs-model.ts';

export interface WorkspaceTabs {
    activeTab: WorkspaceTabRef;
    artifacts: ArtifactTab[];
    closeTab: (ref: ClosableTabRef) => void;
    openArtifact: (target: WorkspaceArtifactTarget, title?: string) => void;
    /** Reopens the most recently closed tab this session at its old position (⌘⇧T). */
    reopenClosedTab: () => void;
    reorderTabs: (tabs: WorkspaceTabRef[]) => void;
    selectTab: (ref: WorkspaceTabRef) => void;
    /** Every tab, the primary tab included, in strip order. */
    tabs: WorkspaceTabRef[];
}

/**
 * The desktop tab strip. Electron owns browser tabs and which one is selected;
 * this hook owns App-local artifact tabs and the one strip order across every
 * kind, the primary tab included (both persisted per Server). An artifact tab is
 * selected only while Electron has no browser tab selected, so native pages
 * stay hidden behind it.
 */
export function useWorkspaceTabs({
    browser,
    command,
    serverId,
    source,
}: {
    browser: BrowserWorkspaceState;
    command: (input: BrowserCommand) => void;
    serverId: string;
    source: string | null;
}): WorkspaceTabs {
    const storageKey = `haus.workspaceTabs.${serverId}`;
    const [state, dispatch] = React.useReducer(workspaceTabsReducer, storageKey, readStoredTabs);
    const tabs = React.useMemo(
        () =>
            resolveWorkspaceTabs(
                state.order,
                browser.tabs.map((tab) => tab.id),
                state.artifacts.map((tab) => tab.key)
            ),
        [browser.tabs, state.artifacts, state.order]
    );
    const activeTab = React.useMemo<WorkspaceTabRef>(() => {
        if (browser.activeId) {
            return { kind: 'browser', id: browser.activeId };
        }
        return state.activeArtifactKey
            ? { kind: 'artifact', key: state.activeArtifactKey }
            : primaryTabRef;
    }, [browser.activeId, state.activeArtifactKey]);

    const serialized = serializeWorkspaceTabs(state);
    React.useEffect(() => {
        try {
            localStorage.setItem(storageKey, serialized);
        } catch {
            // Storage can be unavailable; artifact tabs then last for this window only.
        }
    }, [serialized, storageKey]);

    // Callbacks read the latest strip through a ref so consumers get stable identities.
    const latest = React.useRef({
        activeTab,
        artifacts: state.artifacts,
        browser,
        source,
        tabs,
    });
    latest.current = { activeTab, artifacts: state.artifacts, browser, source, tabs };
    // Session-lifetime and in memory: closed tabs are not worth persisting.
    const closed = React.useRef<ClosedTab[]>([]);

    // A browser tab selected from anywhere (a link, Electron) replaces the artifact —
    // except the browser selections Electron reports while it is still releasing its
    // page for an artifact (closing the selected page reports its own pick first).
    const releasingBrowser = React.useRef(false);
    React.useEffect(() => {
        if (!browser.activeId) {
            releasingBrowser.current = false;
        } else if (!releasingBrowser.current) {
            dispatch({ kind: 'select', key: null });
        }
    }, [browser.activeId]);
    const releaseBrowser = React.useCallback(() => {
        if (latest.current.browser.activeId) {
            releasingBrowser.current = true;
            command({ kind: 'select', id: null });
        }
    }, [command]);

    const selectTab = React.useCallback(
        (ref: WorkspaceTabRef) => {
            if (ref.kind === 'artifact') {
                dispatch({ kind: 'select', key: ref.key });
                releaseBrowser();
                return;
            }
            releasingBrowser.current = false;
            dispatch({ kind: 'select', key: null });
            command({ kind: 'select', id: ref.kind === 'browser' ? ref.id : null });
        },
        [command, releaseBrowser]
    );
    const closeTab = React.useCallback(
        (ref: ClosableTabRef) => {
            const current = latest.current;
            const entry = closedTabEntry(
                ref,
                current.tabs,
                current.browser.tabs,
                current.artifacts
            );
            if (entry) {
                closed.current = rememberClosedTab(closed.current, entry);
            }
            const wasActive = workspaceTabId(current.activeTab) === workspaceTabId(ref);
            if (ref.kind === 'browser') {
                command({ kind: 'close', id: ref.id });
            } else {
                dispatch({ kind: 'close', key: ref.key });
            }
            if (wasActive) {
                selectTab(selectionAfterClose(current.tabs, ref));
            }
        },
        [command, selectTab]
    );
    const openArtifact = React.useCallback(
        (target: WorkspaceArtifactTarget, title?: string) => {
            dispatch({
                kind: 'open',
                source: latest.current.source,
                target,
                title: title ?? null,
            });
            releaseBrowser();
        },
        [releaseBrowser]
    );
    const reorderTabs = React.useCallback(
        (next: WorkspaceTabRef[]) => {
            dispatch({ kind: 'reorder', order: next });
            command({
                kind: 'reorder',
                ids: next.flatMap((ref) => (ref.kind === 'browser' ? [ref.id] : [])),
            });
        },
        [command]
    );
    const reopenClosedTab = React.useCallback(() => {
        const entry = closed.current.at(-1);
        if (!entry) {
            return;
        }
        closed.current = closed.current.slice(0, -1);
        if (entry.kind === 'artifact') {
            const { key, source: from, target, title } = entry.tab;
            dispatch({ kind: 'open', source: from, target, title });
            releaseBrowser();
            reorderTabs(insertTabAt(latest.current.tabs, { kind: 'artifact', key }, entry.index));
            return;
        }
        const known = new Set(latest.current.browser.tabs.map((tab) => tab.id));
        void getDesktopBridge()
            ?.browserCommand?.({ kind: 'open', url: entry.url })
            .then((value) => {
                const id = parseBrowserWorkspace(value)?.activeId;
                // An already-open page is selected where it is; only a new tab moves.
                if (id && !known.has(id)) {
                    reorderTabs(
                        insertTabAt(latest.current.tabs, { kind: 'browser', id }, entry.index)
                    );
                }
            })
            .catch((error: Error) =>
                toast.danger('Could not reopen the tab', { description: error.message })
            );
    }, [releaseBrowser, reorderTabs]);

    return React.useMemo(
        () => ({
            activeTab,
            artifacts: state.artifacts,
            closeTab,
            openArtifact,
            reopenClosedTab,
            reorderTabs,
            selectTab,
            tabs,
        }),
        [
            activeTab,
            state.artifacts,
            closeTab,
            openArtifact,
            reopenClosedTab,
            reorderTabs,
            selectTab,
            tabs,
        ]
    );
}

function readStoredTabs(storageKey: string) {
    try {
        return parseWorkspaceTabs(localStorage.getItem(storageKey));
    } catch {
        return parseWorkspaceTabs(null);
    }
}

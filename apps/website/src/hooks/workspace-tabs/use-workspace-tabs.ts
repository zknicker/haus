import * as React from 'react';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import type { BrowserCommand, BrowserWorkspaceState } from '../../lib/desktop-browser.ts';
import { type ClosedTab, closedTabEntry, rememberClosedTab } from './closed-tabs.ts';
import { useBrowserSelection } from './use-browser-selection.ts';
import { useReopenClosedTab } from './use-reopen-closed-tab.ts';
import { useWorkspaceLayout, type WorkspaceLayoutCommands } from './use-workspace-layout.ts';
import { useWorkspaceTabOpeners, type WorkspaceTabOpeners } from './use-workspace-tab-openers.ts';
import {
    type AgentTab,
    type AppTabRef,
    type ArtifactTab,
    appTabRefs,
    type ClosableTabRef,
    closeActiveTarget,
    explicitSelection,
    resolveClosableTabs,
    sameTab,
    selectionAfterClose,
    syncBrowserOrder,
    type ThreadTab,
    type ThreadTabRef,
    visibleStrip,
    type WorkspaceMode,
    type WorkspaceSelection,
    type WorkspaceTabRef,
    workspaceSelection,
} from './workspace-tabs-model.ts';
import { workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import {
    serializeWorkspaceTabs,
    workspaceModeStorageKey,
    writeWorkspaceTabs,
} from './workspace-tabs-storage.ts';
import { readWindowTabs, writeWindowStores } from './workspace-tabs-window-storage.ts';

export interface WorkspaceTabs
    extends WorkspaceLayoutCommands,
        WorkspaceTabOpeners,
        WorkspaceSelection {
    agents: AgentTab[];
    artifacts: ArtifactTab[];
    /**
     * Command-W: closes the closable tab on screen (the side pane's, or the
     * covering expanded tab), wherever focus is. With closable tabs open but
     * none on screen it does nothing and still answers true, so the window
     * stays; false only when no closable tab is open.
     */
    closeActiveTab: () => boolean;
    /** `remember: false` skips Reopen Closed Tab, for automatic closes (a deleted Agent). */
    closeTab: (ref: ClosableTabRef, options?: { remember?: boolean }) => void;
    /** Browser commands; opening a page reveals it even when it was already selected. */
    command: (input: BrowserCommand) => void;
    mode: WorkspaceMode;
    /** Pins the preview tab; anything else is already pinned. */
    pinTab: (ref: AppTabRef) => void;
    preview: ThreadTabRef | null;
    /** Reopens the most recently closed tab this session at its old position (⌘⇧T). */
    reopenClosedTab: () => void;
    reorderTabs: (tabs: ClosableTabRef[]) => void;
    /** Selects any tab; a closable one shows (revealing the side pane), the primary one in expanded mode. */
    selectTab: (ref: WorkspaceTabRef) => void;
    setAgentSection: (agentId: string, section: AgentSection) => void;
    /** The strip the user sees, for strip shortcuts: expanded leads with the primary tab. */
    stripTabs: WorkspaceTabRef[];
    /** Every closable tab, browser and App-local, in strip order. */
    tabs: ClosableTabRef[];
    threads: ThreadTab[];
}

/**
 * The desktop workspace tabs (ADR 0038). Electron owns browser tabs and which
 * one is selected; this hook owns App-local tabs, the closable strip order
 * (persisted per Server and window), the window mode (persisted per device),
 * and the side pane. An App-local tab is the selected closable tab only while Electron has
 * no browser tab selected. A selected browser page that is not shown stays
 * selected in Electron with no bounds, so its native view hides.
 */
export function useWorkspaceTabs({
    browser,
    command: run,
    serverId,
    source,
}: {
    browser: BrowserWorkspaceState;
    command: (input: BrowserCommand) => Promise<unknown>;
    serverId: string;
    source: string | null;
}): WorkspaceTabs {
    const [state, dispatch] = React.useReducer(workspaceTabsReducer, serverId, readWindowTabs);
    // Adjusting state during render: a browser tab takes its slot before any
    // frame shows it, so a tab opened after it lands after it.
    const browserIds = browser.tabs.map((tab) => tab.id);
    if (syncBrowserOrder(state.order, browserIds) !== state.order) {
        dispatch({ kind: 'syncBrowser', ids: browserIds });
    }
    const tabs = React.useMemo(
        () =>
            resolveClosableTabs(
                state.order,
                browser.tabs.map((tab) => tab.id),
                appTabRefs(state)
            ),
        [browser.tabs, state]
    );
    const selection = React.useMemo(
        () => workspaceSelection(state, browser.activeId, tabs),
        [browser.activeId, state, tabs]
    );
    const stripTabs = React.useMemo(() => visibleStrip(state.mode, tabs), [state.mode, tabs]);

    const serialized = serializeWorkspaceTabs(state);
    React.useEffect(() => {
        writeWindowStores((stores) => writeWorkspaceTabs(stores, serverId, serialized));
    }, [serialized, serverId]);
    React.useEffect(() => {
        writeWindowStores((stores) => stores.local.setItem(workspaceModeStorageKey, state.mode));
    }, [state.mode]);

    // Callbacks read the latest state through a ref so consumers get stable identities.
    const latest = React.useRef({ browser, selection, source, state, stripTabs, tabs });
    latest.current = { browser, selection, source, state, stripTabs, tabs };
    // Session-lifetime and in memory: closed tabs are not worth persisting.
    const closed = React.useRef<ClosedTab[]>([]);

    const { releaseBrowser, selectBrowser } = useBrowserSelection({
        activeId: browser.activeId,
        dispatch,
        latest,
        run,
    });

    const selectTab = React.useCallback(
        (ref: WorkspaceTabRef) => {
            if (ref.kind === 'primary') {
                dispatch({ kind: 'selectPrimary' });
            } else if (ref.kind === 'browser') {
                selectBrowser(ref.id);
            } else {
                dispatch({ kind: 'select', ref });
                releaseBrowser();
            }
        },
        [releaseBrowser, selectBrowser]
    );
    const closeTab = React.useCallback(
        (ref: ClosableTabRef, { remember = true }: { remember?: boolean } = {}) => {
            const current = latest.current;
            const entry =
                remember &&
                closedTabEntry(
                    ref,
                    current.tabs,
                    current.browser.tabs,
                    current.state.artifacts,
                    current.state.agents
                );
            if (entry) {
                closed.current = rememberClosedTab(closed.current, entry);
            }
            if (ref.kind === 'browser') {
                void run({ kind: 'close', id: ref.id });
            } else {
                dispatch({ kind: 'close', ref });
            }
            if (sameTab(current.selection.shownClosable, ref)) {
                const next = selectionAfterClose(current.stripTabs, ref);
                if (next) {
                    selectTab(next);
                }
            } else if (sameTab(current.selection.selectedClosable, ref)) {
                // A hidden selected page closed: Electron's own pick must not show.
                releaseBrowser();
            }
        },
        [releaseBrowser, run, selectTab]
    );
    const closeActiveTab = React.useCallback(() => {
        const { selection: current, tabs: closable } = latest.current;
        const { close, handled } = closeActiveTarget(current, closable);
        if (close) {
            closeTab(close);
        }
        return handled;
    }, [closeTab]);
    const command = React.useCallback((input: BrowserCommand) => void run(input), [run]);

    // A shown pane renders its last tab when its selection is gone (a page
    // closed by Electron, a tab closed while hidden); this commits that pick.
    const showsClosable = state.mode === 'split' ? selection.sidePaneShown : !state.primarySelected;
    const unselected = showsClosable && !explicitSelection(state, browser.activeId, tabs);
    React.useEffect(() => {
        if (unselected) {
            selectTab(latest.current.tabs.at(-1) ?? { kind: 'primary' });
        }
    }, [selectTab, unselected]);

    const { open, openAgent, openArtifact, openFiles, openThread } = useWorkspaceTabOpeners({
        dispatch,
        latest,
        releaseBrowser,
    });
    const layout = useWorkspaceLayout({ dispatch, latest });
    const pinTab = React.useCallback((ref: AppTabRef) => dispatch({ kind: 'pin', ref }), []);
    const setAgentSection = React.useCallback((agentId: string, section: AgentSection) => {
        dispatch({ kind: 'section', agentId, section });
    }, []);
    const reorderTabs = React.useCallback(
        (next: ClosableTabRef[]) => {
            dispatch({ kind: 'reorder', order: next });
            void run({
                kind: 'reorder',
                ids: next.flatMap((ref) => (ref.kind === 'browser' ? [ref.id] : [])),
            });
        },
        [run]
    );
    const reopenClosedTab = useReopenClosedTab({ closed, latest, open, reorderTabs });

    return React.useMemo(
        () => ({
            ...layout,
            ...selection,
            agents: state.agents,
            artifacts: state.artifacts,
            closeActiveTab,
            closeTab,
            command,
            mode: state.mode,
            openAgent,
            openArtifact,
            openFiles,
            openThread,
            pinTab,
            preview: state.preview,
            reopenClosedTab,
            reorderTabs,
            selectTab,
            setAgentSection,
            stripTabs,
            tabs,
            threads: state.threads,
        }),
        [
            layout,
            selection,
            state.agents,
            state.artifacts,
            state.mode,
            state.preview,
            state.threads,
            closeActiveTab,
            closeTab,
            command,
            openAgent,
            openArtifact,
            openFiles,
            openThread,
            pinTab,
            reopenClosedTab,
            reorderTabs,
            selectTab,
            setAgentSection,
            stripTabs,
            tabs,
        ]
    );
}

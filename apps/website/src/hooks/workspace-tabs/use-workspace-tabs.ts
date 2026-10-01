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
    resolveClosableTabs,
    sameTab,
    selectionAfterClose,
    type ThreadTab,
    type ThreadTabRef,
    visibleStrip,
    type WorkspaceFocus,
    type WorkspaceMode,
    type WorkspaceSelection,
    type WorkspaceTabRef,
    workspaceSelection,
} from './workspace-tabs-model.ts';
import { workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import {
    parseWorkspaceMode,
    parseWorkspaceTabs,
    serializeWorkspaceTabs,
    workspaceModeStorageKey,
} from './workspace-tabs-storage.ts';

export interface WorkspaceTabs
    extends WorkspaceLayoutCommands,
        WorkspaceTabOpeners,
        WorkspaceSelection {
    agents: AgentTab[];
    artifacts: ArtifactTab[];
    /** Closes the shown closable tab Command-W points at; false when there is none. */
    closeFocusedTab: () => boolean;
    /** `remember: false` skips Reopen Closed Tab, for automatic closes (a deleted Agent). */
    closeTab: (ref: ClosableTabRef, options?: { remember?: boolean }) => void;
    /** Browser commands; opening a page reveals it even when it was already selected. */
    command: (input: BrowserCommand) => void;
    focusPane: (focus: WorkspaceFocus) => void;
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
 * (persisted per Server), the window mode (persisted per device), and the side
 * pane. An App-local tab is the selected closable tab only while Electron has
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
    const storageKey = `haus.workspaceTabs.${serverId}`;
    const [state, dispatch] = React.useReducer(workspaceTabsReducer, storageKey, readStoredTabs);
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
        writeStorage(storageKey, serialized);
    }, [serialized, storageKey]);
    React.useEffect(() => {
        writeStorage(workspaceModeStorageKey, state.mode);
    }, [state.mode]);

    // Callbacks read the latest state through a ref so consumers get stable identities.
    const latest = React.useRef({ browser, selection, source, state, stripTabs, tabs });
    latest.current = { browser, selection, source, state, stripTabs, tabs };
    // Session-lifetime and in memory: closed tabs are not worth persisting.
    const closed = React.useRef<ClosedTab[]>([]);

    const { command, releaseBrowser, selectBrowser } = useBrowserSelection({
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
    const closeFocusedTab = React.useCallback(() => {
        const { selection: current, state: now } = latest.current;
        const target = now.mode === 'split' && now.focus !== 'side' ? null : current.shownClosable;
        if (!target) {
            return false;
        }
        closeTab(target);
        return true;
    }, [closeTab]);

    // A shown pane never sits empty: when its selection is gone (a page closed
    // by Electron, a tab closed while hidden), it shows its last tab.
    const { selectedClosable, sidePaneShown } = selection;
    const showsClosable = state.mode === 'split' ? sidePaneShown : !state.primarySelected;
    React.useEffect(() => {
        if (!showsClosable || selectedClosable) {
            return;
        }
        selectTab(latest.current.tabs.at(-1) ?? { kind: 'primary' });
    }, [selectTab, selectedClosable, showsClosable]);

    const { open, openAgent, openArtifact, openThread } = useWorkspaceTabOpeners({
        dispatch,
        latest,
        releaseBrowser,
    });
    const layout = useWorkspaceLayout({ dispatch, latest });
    const pinTab = React.useCallback((ref: AppTabRef) => dispatch({ kind: 'pin', ref }), []);
    const setAgentSection = React.useCallback((agentId: string, section: AgentSection) => {
        dispatch({ kind: 'section', agentId, section });
    }, []);
    const focusPane = React.useCallback((focus: WorkspaceFocus) => {
        dispatch({ kind: 'focus', focus });
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
            closeFocusedTab,
            closeTab,
            command,
            focusPane,
            mode: state.mode,
            openAgent,
            openArtifact,
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
            closeFocusedTab,
            closeTab,
            command,
            focusPane,
            openAgent,
            openArtifact,
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

function readStoredTabs(storageKey: string) {
    try {
        return parseWorkspaceTabs(
            localStorage.getItem(storageKey),
            parseWorkspaceMode(localStorage.getItem(workspaceModeStorageKey))
        );
    } catch {
        return parseWorkspaceTabs(null);
    }
}

function writeStorage(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage can be unavailable; tabs and the mode then last for this window only.
    }
}

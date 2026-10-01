import * as React from 'react';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import type { BrowserCommand, BrowserWorkspaceState } from '../../lib/desktop-browser.ts';
import { type ClosedTab, closedTabEntry, rememberClosedTab } from './closed-tabs.ts';
import { useReopenClosedTab } from './use-reopen-closed-tab.ts';
import { useWorkspaceSplit, type WorkspaceSplitCommands } from './use-workspace-split.ts';
import { useWorkspaceTabOpeners, type WorkspaceTabOpeners } from './use-workspace-tab-openers.ts';
import {
    type AgentTab,
    type AppTabRef,
    type ArtifactTab,
    type ClosableTabRef,
    mainAppTabs,
    primaryTabRef,
    resolveWorkspaceTabs,
    selectionAfterClose,
    type ThreadTab,
    tabGroup,
    type WorkspaceSplit,
    type WorkspaceTabGroup,
    type WorkspaceTabRef,
    workspaceTabId,
} from './workspace-tabs-model.ts';
import { workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import { parseWorkspaceTabs, serializeWorkspaceTabs } from './workspace-tabs-storage.ts';

export interface WorkspaceTabs extends WorkspaceSplitCommands, WorkspaceTabOpeners {
    /** The main strip's selected tab. */
    activeTab: WorkspaceTabRef;
    agents: AgentTab[];
    artifacts: ArtifactTab[];
    /** Closes the focused group's selected closable tab (⌘W); false when there is none. */
    closeFocusedTab: () => boolean;
    /** `remember: false` skips Reopen Closed Tab, for automatic closes (a deleted Agent). */
    closeTab: (ref: ClosableTabRef, options?: { remember?: boolean }) => void;
    focusedGroup: WorkspaceTabGroup;
    focusGroup: (group: WorkspaceTabGroup) => void;
    /** Pins the split's preview tab; anything else is already pinned. */
    pinTab: (ref: AppTabRef) => void;
    /** Reopens the most recently closed tab this session at its old position (⌘⇧T). */
    reopenClosedTab: () => void;
    reorderTabs: (tabs: WorkspaceTabRef[]) => void;
    /** Selects any tab in whichever group holds it. */
    selectTab: (ref: WorkspaceTabRef) => void;
    setAgentSection: (agentId: string, section: AgentSection) => void;
    split: WorkspaceSplit;
    /** Every main strip tab, the primary tab included, in strip order. */
    tabs: WorkspaceTabRef[];
    threads: ThreadTab[];
}

/**
 * The desktop tab groups. Electron owns browser tabs and which one is
 * selected; this hook owns App-local artifact and Agent tabs, the main strip
 * order across every kind (persisted per Server), and the window's split. A
 * main App-local tab is selected only while Electron has no browser tab
 * selected, so native pages stay hidden behind it.
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
                mainAppTabs(state)
            ),
        [browser.tabs, state]
    );
    const activeTab = React.useMemo<WorkspaceTabRef>(() => {
        if (browser.activeId) {
            return { kind: 'browser', id: browser.activeId };
        }
        return state.mainActive ?? primaryTabRef;
    }, [browser.activeId, state.mainActive]);

    const serialized = serializeWorkspaceTabs(state);
    React.useEffect(() => {
        try {
            localStorage.setItem(storageKey, serialized);
        } catch {
            // Storage can be unavailable; App-local tabs then last for this window only.
        }
    }, [serialized, storageKey]);

    // Callbacks read the latest state through a ref so consumers get stable identities.
    const latest = React.useRef({ activeTab, browser, source, state, tabs });
    latest.current = { activeTab, browser, source, state, tabs };
    // Session-lifetime and in memory: closed tabs are not worth persisting.
    const closed = React.useRef<ClosedTab[]>([]);

    // A browser tab selected from anywhere (a link, Electron) replaces the main
    // App-local tab — except the browser selections Electron reports while it is
    // still releasing its page for one (closing the selected page reports its own pick first).
    // Focus stays put: this also echoes a split move that handed main to a browser neighbor.
    const releasingBrowser = React.useRef(false);
    React.useEffect(() => {
        if (!browser.activeId) {
            releasingBrowser.current = false;
        } else if (!releasingBrowser.current) {
            dispatch({ kind: 'releaseMain' });
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
            if (ref.kind !== 'primary' && ref.kind !== 'browser') {
                dispatch({ kind: 'select', ref });
                if (tabGroup(latest.current.state, ref) === 'main') {
                    releaseBrowser();
                }
                return;
            }
            releasingBrowser.current = false;
            dispatch({ kind: 'select', ref: null });
            command({ kind: 'select', id: ref.kind === 'browser' ? ref.id : null });
        },
        [command, releaseBrowser]
    );
    const closeTab = React.useCallback(
        (ref: ClosableTabRef, { remember = true }: { remember?: boolean } = {}) => {
            const current = latest.current;
            const entry =
                remember &&
                closedTabEntry(
                    ref,
                    [...current.tabs, ...current.state.split.order],
                    current.browser.tabs,
                    current.state.artifacts,
                    current.state.agents
                );
            if (entry) {
                closed.current = rememberClosedTab(closed.current, entry);
            }
            const wasActive = workspaceTabId(current.activeTab) === workspaceTabId(ref);
            if (ref.kind === 'browser') {
                command({ kind: 'close', id: ref.id });
            } else {
                dispatch({ kind: 'close', ref });
            }
            if (wasActive) {
                selectTab(selectionAfterClose(current.tabs, ref));
            }
        },
        [command, selectTab]
    );
    const closeFocusedTab = React.useCallback(() => {
        const { activeTab: main, state: current } = latest.current;
        const target = current.focus === 'split' ? current.split.active : main;
        if (!target || target.kind === 'primary') {
            return false;
        }
        closeTab(target);
        return true;
    }, [closeTab]);
    const { open, openAgent, openArtifact, openThread } = useWorkspaceTabOpeners({
        dispatch,
        latest,
        releaseBrowser,
    });
    const pinTab = React.useCallback((ref: AppTabRef) => dispatch({ kind: 'pin', ref }), []);
    const setAgentSection = React.useCallback((agentId: string, section: AgentSection) => {
        dispatch({ kind: 'section', agentId, section });
    }, []);
    const focusGroup = React.useCallback((group: WorkspaceTabGroup) => {
        dispatch({ kind: 'focus', group });
    }, []);
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
    const splitCommands = useWorkspaceSplit({ dispatch, latest, releaseBrowser, selectTab });
    const reopenClosedTab = useReopenClosedTab({ closed, latest, open, reorderTabs });

    return React.useMemo(
        () => ({
            ...splitCommands,
            activeTab,
            agents: state.agents,
            artifacts: state.artifacts,
            closeFocusedTab,
            closeTab,
            focusedGroup: state.focus,
            focusGroup,
            openAgent,
            openArtifact,
            openThread,
            pinTab,
            reopenClosedTab,
            reorderTabs,
            selectTab,
            setAgentSection,
            split: state.split,
            tabs,
            threads: state.threads,
        }),
        [
            splitCommands,
            activeTab,
            state.agents,
            state.artifacts,
            state.focus,
            state.split,
            closeFocusedTab,
            closeTab,
            focusGroup,
            openAgent,
            openArtifact,
            openThread,
            pinTab,
            reopenClosedTab,
            reorderTabs,
            selectTab,
            setAgentSection,
            tabs,
            state.threads,
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

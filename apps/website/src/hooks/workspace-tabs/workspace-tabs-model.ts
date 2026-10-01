import {
    getArtifactPanelTargetLabel,
    type HausResourceTarget,
} from '../../features/chats/haus-resource-link.ts';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';

/** A Thread tab, by its parent chat and the Thread's anchor (root) message. */
export interface ThreadTabRef {
    anchorMessageId: string;
    chatId: string;
    kind: 'thread';
}

/** An App-local workspace tab: an artifact (by its stable target key), an Agent profile, or a Thread. */
export type AppTabRef =
    | { kind: 'agent'; agentId: string }
    | { kind: 'artifact'; key: string }
    | ThreadTabRef;

/** A closable desktop workspace tab. Browser tabs are Electron-owned and referenced by id. */
export type ClosableTabRef = AppTabRef | { kind: 'browser'; id: string };

/** Every desktop workspace tab. The one primary tab is the routed page and never closes. */
export type WorkspaceTabRef = { kind: 'primary' } | ClosableTabRef;

/**
 * The window's tab layout (ADR 0038, after Codex). `split`: the routed page
 * fills the left column and every closable tab lives in a side pane with its
 * own strip. `expanded`: one strip, the primary tab first, and the selected
 * tab takes the whole content width.
 */
export type WorkspaceMode = 'split' | 'expanded';

/** Where Command-W points in split mode: the routed page, or the side pane's selected tab. */
export type WorkspaceFocus = 'primary' | 'side';

export const primaryTabRef: WorkspaceTabRef = { kind: 'primary' };

/** An artifact opened in a tab always names the Agent whose workspace holds it. */
export type WorkspaceArtifactTarget = HausResourceTarget & { agentId: string };

export interface ArtifactTab {
    key: string;
    /** The chat the artifact was opened from, for the tab tooltip. */
    source: string | null;
    target: WorkspaceArtifactTarget;
    /** The artifact's authored title; the file name stands in when absent. */
    title: string | null;
}

/** An Agent profile tab; drill-down stays inside the tab as its current section. */
export interface AgentTab {
    agentId: string;
    section: AgentSection;
}

/** A Thread tab carries nothing beyond its identity. */
export type ThreadTab = Omit<ThreadTabRef, 'kind'>;

export interface WorkspaceTabsState {
    /**
     * The selected App-local closable tab. Electron owns browser selection, so
     * this is null while Electron has a browser tab selected (which then is the
     * selected closable tab) or while nothing closable is selected.
     */
    active: AppTabRef | null;
    agents: AgentTab[];
    artifacts: ArtifactTab[];
    focus: WorkspaceFocus;
    mode: WorkspaceMode;
    /** Closable tabs in strip order; browser refs may be stale and are resolved against live tabs. */
    order: ClosableTabRef[];
    /** The one preview Thread tab, which the next opened Thread replaces in place. */
    preview: ThreadTabRef | null;
    /** Expanded mode: the primary tab is selected, the selected closable tab waiting behind it. */
    primarySelected: boolean;
    /** Split mode: the side pane shows. Hiding it keeps its tabs and selection. */
    sidePaneVisible: boolean;
    threads: ThreadTab[];
}

export const emptyWorkspaceTabs: WorkspaceTabsState = {
    active: null,
    agents: [],
    artifacts: [],
    focus: 'primary',
    mode: 'split',
    order: [],
    preview: null,
    primarySelected: true,
    sidePaneVisible: true,
    threads: [],
};

/** Every App-local tab record, as refs. */
export function appTabRefs(
    state: Pick<WorkspaceTabsState, 'agents' | 'artifacts' | 'threads'>
): AppTabRef[] {
    return [
        ...state.artifacts.map((tab): AppTabRef => ({ kind: 'artifact', key: tab.key })),
        ...state.agents.map((tab): AppTabRef => ({ kind: 'agent', agentId: tab.agentId })),
        ...state.threads.map((tab): AppTabRef => ({ kind: 'thread', ...tab })),
    ];
}

export function hasAppTab(state: WorkspaceTabsState, ref: AppTabRef): boolean {
    return appTabRefs(state).some((item) => sameTab(item, ref));
}

/**
 * The closable tabs in strip order: persisted refs that still exist, then live
 * browser tabs and App-local tabs the order has not placed yet (new ones append).
 */
export function resolveClosableTabs(
    order: readonly ClosableTabRef[],
    browserIds: readonly string[],
    appTabs: readonly AppTabRef[]
): ClosableTabRef[] {
    const browserRefs = browserIds.map((id): ClosableTabRef => ({ kind: 'browser', id }));
    const live = new Set([...browserRefs, ...appTabs].map(workspaceTabId));
    const placed = new Set<string>();
    return [...order, ...browserRefs, ...appTabs].filter((ref) => {
        const id = workspaceTabId(ref);
        if (!live.has(id) || placed.has(id)) {
            return false;
        }
        placed.add(id);
        return true;
    });
}

/**
 * What the window shows, from the state and Electron's selected browser tab.
 * `selectedClosable` is the closable tab selected in its strip, shown or not;
 * `shownClosable` is the closable tab whose page is on screen (the side pane's
 * in split mode, the covering tab in expanded mode); `selectedTab` is the tab
 * a strip highlights.
 */
export function workspaceSelection(
    state: WorkspaceTabsState,
    browserActiveId: string | null,
    closable: readonly ClosableTabRef[]
) {
    const selectedClosable: ClosableTabRef | null = browserActiveId
        ? { kind: 'browser', id: browserActiveId }
        : state.active && closable.some((ref) => sameTab(ref, state.active))
          ? state.active
          : null;
    const shown =
        state.mode === 'split'
            ? state.sidePaneVisible && closable.length > 0
            : !state.primarySelected;
    const shownClosable = shown ? selectedClosable : null;
    const selectedTab: WorkspaceTabRef =
        state.mode === 'split'
            ? (selectedClosable ?? primaryTabRef)
            : (shownClosable ?? primaryTabRef);
    return {
        selectedClosable,
        selectedTab,
        shownClosable,
        sidePaneShown: state.mode === 'split' && state.sidePaneVisible && closable.length > 0,
    };
}

export type WorkspaceSelection = ReturnType<typeof workspaceSelection>;

/** The strip the user sees, for strip shortcuts: expanded leads with the primary tab. */
export function visibleStrip(
    mode: WorkspaceMode,
    closable: readonly ClosableTabRef[]
): WorkspaceTabRef[] {
    return mode === 'expanded' ? [primaryTabRef, ...closable] : [...closable];
}

/**
 * Closing the selected tab selects the last remaining tab in its strip; null
 * when none remains (the expanded strip then falls back to the primary tab).
 */
export function selectionAfterClose(
    tabs: readonly WorkspaceTabRef[],
    closing: ClosableTabRef
): WorkspaceTabRef | null {
    return tabs.filter((ref) => !sameTab(ref, closing)).at(-1) ?? null;
}

/** A unique id per tab across kinds; also the tab's drag-and-drop id. */
export function workspaceTabId(ref: WorkspaceTabRef): string {
    switch (ref.kind) {
        case 'primary':
            return 'primary';
        case 'browser':
            return `browser:${ref.id}`;
        case 'artifact':
            return `artifact:${ref.key}`;
        case 'agent':
            return `agent:${ref.agentId}`;
        case 'thread':
            return `thread:${ref.chatId}:${ref.anchorMessageId}`;
    }
}

export function sameTab(a: WorkspaceTabRef | null, b: WorkspaceTabRef | null): boolean {
    return a !== null && b !== null && workspaceTabId(a) === workspaceTabId(b);
}

export function isAppTab(ref: WorkspaceTabRef): ref is AppTabRef {
    return ref.kind !== 'primary' && ref.kind !== 'browser';
}

/** Desktop workspace tabs take artifacts bound to an Agent; everything else keeps the panel. */
export function opensInWorkspaceTab(
    target: HausResourceTarget,
    workspaceTabs: boolean
): target is WorkspaceArtifactTarget {
    return workspaceTabs && 'agentId' in target && typeof target.agentId === 'string';
}

export function artifactTabLabel(tab: ArtifactTab): string {
    return tab.title ?? getArtifactPanelTargetLabel(tab.target);
}

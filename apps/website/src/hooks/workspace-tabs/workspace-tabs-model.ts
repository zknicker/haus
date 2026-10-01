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

/**
 * An App-local workspace tab: an artifact (by its stable target key), an
 * Agent profile (by Agent id), or a Thread. Only these can sit in the split.
 */
export type AppTabRef =
    | { kind: 'agent'; agentId: string }
    | { kind: 'artifact'; key: string }
    | ThreadTabRef;

/** A closable desktop workspace tab. Browser tabs are Electron-owned and referenced by id. */
export type ClosableTabRef = AppTabRef | { kind: 'browser'; id: string };

/**
 * Every desktop workspace tab. Exactly one primary tab (the routed page) is
 * always present in the main strip, can sit anywhere there, and never closes.
 */
export type WorkspaceTabRef = { kind: 'primary' } | ClosableTabRef;

/** The window's two tab groups: the main strip, and the split docked on the right. */
export type WorkspaceTabGroup = 'main' | 'split';

/** `main` forces the main strip (Cmd-click); `auto` follows the tab's placement class. */
export type TabPlacement = 'auto' | 'main';

/**
 * Where a new tab of a kind lands (ADR 0038). A page (Agent profile,
 * artifact) opens in the split only while it is open; a companion (Thread)
 * always opens in the split, opening it, as the split's preview tab.
 */
export type PlacementClass = 'companion' | 'page';

export function placementClass(ref: AppTabRef): PlacementClass {
    return ref.kind === 'thread' ? 'companion' : 'page';
}

/** Cmd/Ctrl-click always lands in the main strip. */
export function placementFromModifiers(event: {
    ctrlKey: boolean;
    metaKey: boolean;
}): TabPlacement {
    return event.metaKey || event.ctrlKey ? 'main' : 'auto';
}

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

export interface WorkspaceSplit {
    /** The split's selected tab; null only while it holds no tabs. */
    active: AppTabRef | null;
    /** True once toggled on, even before a tab lands in it; new tabs then open there. */
    open: boolean;
    order: AppTabRef[];
    /**
     * The split's one preview tab: an unpinned companion that the next opened
     * companion replaces in place. Replying, double-clicking, or moving it pins it.
     */
    preview: ThreadTabRef | null;
}

export interface WorkspaceTabsState {
    agents: AgentTab[];
    artifacts: ArtifactTab[];
    /** The group Command-W acts on: the one last selected, opened into, or clicked. */
    focus: WorkspaceTabGroup;
    /** The selected App-local main tab; null while the primary or a browser tab is selected. */
    mainActive: AppTabRef | null;
    /** Main strip order; browser refs may be stale and are resolved against live tabs. */
    order: WorkspaceTabRef[];
    split: WorkspaceSplit;
    threads: ThreadTab[];
}

export const closedSplit: WorkspaceSplit = { active: null, open: false, order: [], preview: null };

export const emptyWorkspaceTabs: WorkspaceTabsState = {
    agents: [],
    artifacts: [],
    focus: 'main',
    mainActive: null,
    order: [],
    split: closedSplit,
    threads: [],
};

/** Every App-local tab, whichever group holds it. */
export function appTabRefs(
    state: Pick<WorkspaceTabsState, 'agents' | 'artifacts' | 'threads'>
): AppTabRef[] {
    return [
        ...state.artifacts.map((tab): AppTabRef => ({ kind: 'artifact', key: tab.key })),
        ...state.agents.map((tab): AppTabRef => ({ kind: 'agent', agentId: tab.agentId })),
        ...state.threads.map((tab): AppTabRef => ({ kind: 'thread', ...tab })),
    ];
}

/** The group holding an open App-local tab, or null when it is not open. */
export function tabGroup(state: WorkspaceTabsState, ref: AppTabRef): WorkspaceTabGroup | null {
    const id = workspaceTabId(ref);
    if (state.split.order.some((item) => workspaceTabId(item) === id)) {
        return 'split';
    }
    return appTabRefs(state).some((item) => workspaceTabId(item) === id) ? 'main' : null;
}

/**
 * The routing rule (ADR 0038): an open tab stays where it is; `main` forces
 * the main strip; a new companion opens in the split; a new page opens in the
 * split while the split is open, else in the main strip.
 */
export function openGroup(
    state: WorkspaceTabsState,
    ref: AppTabRef,
    placement: TabPlacement
): WorkspaceTabGroup {
    const open = tabGroup(state, ref);
    if (open) {
        return open;
    }
    if (placement === 'main') {
        return 'main';
    }
    return placementClass(ref) === 'companion' || state.split.open ? 'split' : 'main';
}

/** App-local tabs that belong to the main strip. */
export function mainAppTabs(state: WorkspaceTabsState): AppTabRef[] {
    const split = new Set(state.split.order.map(workspaceTabId));
    return appTabRefs(state).filter((ref) => !split.has(workspaceTabId(ref)));
}

/**
 * The main strip's tabs in order: persisted refs that still exist, then live
 * browser tabs and App-local tabs the order has not placed yet (new ones
 * append). The primary tab keeps its place, or leads when the order lacks it.
 */
export function resolveWorkspaceTabs(
    order: readonly WorkspaceTabRef[],
    browserIds: readonly string[],
    appTabs: readonly AppTabRef[]
): WorkspaceTabRef[] {
    const browserRefs = browserIds.map((id): WorkspaceTabRef => ({ kind: 'browser', id }));
    const live = new Set([primaryTabRef, ...browserRefs, ...appTabs].map(workspaceTabId));
    const placed = new Set<string>();
    const resolved: WorkspaceTabRef[] = [];
    const place = (ref: WorkspaceTabRef) => {
        const id = workspaceTabId(ref);
        if (live.has(id) && !placed.has(id)) {
            placed.add(id);
            resolved.push(ref);
        }
    };
    if (!order.some((ref) => ref.kind === 'primary')) {
        place(primaryTabRef);
    }
    for (const ref of [...order, ...browserRefs, ...appTabs]) {
        place(ref);
    }
    return resolved;
}

/**
 * Closing the selected tab selects the last remaining tab in its strip, which
 * is the primary tab when it sits last or stands alone.
 */
export function selectionAfterClose(
    tabs: readonly WorkspaceTabRef[],
    closing: ClosableTabRef
): WorkspaceTabRef {
    const id = workspaceTabId(closing);
    return tabs.filter((ref) => workspaceTabId(ref) !== id).at(-1) ?? primaryTabRef;
}

/** Folds split tabs into the main strip right after its selected tab. */
export function foldSplitIntoMain(
    mainTabs: readonly WorkspaceTabRef[],
    active: WorkspaceTabRef,
    splitTabs: readonly AppTabRef[]
): WorkspaceTabRef[] {
    const index = mainTabs.findIndex((ref) => workspaceTabId(ref) === workspaceTabId(active));
    const at = index < 0 ? mainTabs.length : index + 1;
    return [...mainTabs.slice(0, at), ...splitTabs, ...mainTabs.slice(at)];
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

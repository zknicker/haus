import { chatPaneTargetSchema } from '@haus/api';
import {
    getArtifactPanelTargetKey,
    getArtifactPanelTargetLabel,
    type HausResourceTarget,
} from '../../features/chats/haus-resource-link.ts';

/**
 * A closable desktop workspace tab. Browser tabs are Electron-owned and
 * referenced by id; artifact tabs are App-local and referenced by their stable
 * target key.
 */
export type ClosableTabRef = { kind: 'artifact'; key: string } | { kind: 'browser'; id: string };

/**
 * Every desktop workspace tab, in one strip order. Exactly one primary tab
 * (the routed page) is always present, can sit anywhere, and never closes.
 */
export type WorkspaceTabRef = { kind: 'primary' } | ClosableTabRef;

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

export interface WorkspaceTabsState {
    activeArtifactKey: string | null;
    artifacts: ArtifactTab[];
    /** Persisted strip order; browser refs may be stale and are resolved against live tabs. */
    order: WorkspaceTabRef[];
}

export type WorkspaceTabsAction =
    | { kind: 'close'; key: string }
    | { kind: 'open'; source: string | null; target: WorkspaceArtifactTarget; title: string | null }
    | { kind: 'reorder'; order: WorkspaceTabRef[] }
    | { kind: 'select'; key: string | null };

export const emptyWorkspaceTabs: WorkspaceTabsState = {
    activeArtifactKey: null,
    artifacts: [],
    order: [],
};

export function workspaceTabsReducer(
    state: WorkspaceTabsState,
    action: WorkspaceTabsAction
): WorkspaceTabsState {
    switch (action.kind) {
        case 'open': {
            const key = getArtifactPanelTargetKey(action.target);
            if (state.artifacts.some((tab) => tab.key === key)) {
                return { ...state, activeArtifactKey: key };
            }
            const tab: ArtifactTab = {
                key,
                source: action.source,
                target: action.target,
                title: action.title,
            };
            return {
                activeArtifactKey: key,
                artifacts: [...state.artifacts, tab],
                order: [...state.order, { kind: 'artifact', key }],
            };
        }
        case 'select':
            if (action.key !== null && !state.artifacts.some((tab) => tab.key === action.key)) {
                return state;
            }
            return state.activeArtifactKey === action.key
                ? state
                : { ...state, activeArtifactKey: action.key };
        case 'close':
            return {
                activeArtifactKey:
                    state.activeArtifactKey === action.key ? null : state.activeArtifactKey,
                artifacts: state.artifacts.filter((tab) => tab.key !== action.key),
                order: state.order.filter(
                    (ref) => !(ref.kind === 'artifact' && ref.key === action.key)
                ),
            };
        case 'reorder':
            return { ...state, order: action.order };
    }
}

/**
 * The strip's tabs in order: persisted refs that still exist, then live
 * browser tabs and artifacts the order has not placed yet (new ones append).
 * The primary tab keeps its place, or leads when the order lacks it.
 */
export function resolveWorkspaceTabs(
    order: readonly WorkspaceTabRef[],
    browserIds: readonly string[],
    artifactKeys: readonly string[]
): WorkspaceTabRef[] {
    const live = new Set([
        workspaceTabId(primaryTabRef),
        ...browserIds.map((id) => workspaceTabId({ kind: 'browser', id })),
        ...artifactKeys.map((key) => workspaceTabId({ kind: 'artifact', key })),
    ]);
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
    for (const ref of order) {
        place(ref);
    }
    for (const id of browserIds) {
        place({ kind: 'browser', id });
    }
    for (const key of artifactKeys) {
        place({ kind: 'artifact', key });
    }
    return resolved;
}

/**
 * Closing the selected tab selects the last remaining tab in the strip, which
 * is the primary tab when it sits last or stands alone.
 */
export function selectionAfterClose(
    tabs: readonly WorkspaceTabRef[],
    closing: ClosableTabRef
): WorkspaceTabRef {
    const id = workspaceTabId(closing);
    return tabs.filter((ref) => workspaceTabId(ref) !== id).at(-1) ?? primaryTabRef;
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
    }
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

export function serializeWorkspaceTabs(state: WorkspaceTabsState): string {
    return JSON.stringify({
        artifacts: state.artifacts,
        // Browser tabs are not restored, so only the primary and artifact places persist.
        order: state.order.filter((ref) => ref.kind !== 'browser'),
    });
}

/** Restores persisted artifact tabs, dropping anything malformed. Selection is not restored. */
export function parseWorkspaceTabs(raw: string | null): WorkspaceTabsState {
    if (!raw) {
        return emptyWorkspaceTabs;
    }
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return emptyWorkspaceTabs;
    }
    if (!(value && typeof value === 'object' && 'artifacts' in value && 'order' in value)) {
        return emptyWorkspaceTabs;
    }
    const keys = new Set<string>();
    const artifacts = (Array.isArray(value.artifacts) ? value.artifacts : []).flatMap(
        (entry: unknown) => {
            const tab = parseArtifactTab(entry);
            if (!tab || keys.has(tab.key)) {
                return [];
            }
            keys.add(tab.key);
            return [tab];
        }
    );
    const order = Array.isArray(value.order) ? parseOrder(value.order, keys) : [];
    return { activeArtifactKey: null, artifacts, order };
}

/** Keeps known artifact refs and the first primary ref; the resolver places a missing primary. */
function parseOrder(entries: unknown[], keys: ReadonlySet<string>): WorkspaceTabRef[] {
    let primary = false;
    return entries.flatMap((entry): WorkspaceTabRef[] => {
        if (!(entry && typeof entry === 'object' && 'kind' in entry)) {
            return [];
        }
        if (entry.kind === 'primary' && !primary) {
            primary = true;
            return [primaryTabRef];
        }
        return entry.kind === 'artifact' &&
            'key' in entry &&
            typeof entry.key === 'string' &&
            keys.has(entry.key)
            ? [{ kind: 'artifact', key: entry.key }]
            : [];
    });
}

function parseArtifactTab(entry: unknown): ArtifactTab | null {
    if (!(entry && typeof entry === 'object' && 'target' in entry)) {
        return null;
    }
    const target = entry.target;
    const parsed = chatPaneTargetSchema.safeParse(target);
    if (
        !(
            parsed.success &&
            target &&
            typeof target === 'object' &&
            'agentId' in target &&
            typeof target.agentId === 'string' &&
            target.agentId.length > 0
        )
    ) {
        return null;
    }
    const bound: WorkspaceArtifactTarget = { ...parsed.data, agentId: target.agentId };
    return {
        key: getArtifactPanelTargetKey(bound),
        source: 'source' in entry && typeof entry.source === 'string' ? entry.source : null,
        target: bound,
        title: 'title' in entry && typeof entry.title === 'string' ? entry.title : null,
    };
}

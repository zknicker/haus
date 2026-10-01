import { getArtifactPanelTargetKey } from '../../features/chats/haus-resource-link.ts';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import {
    type AppTabRef,
    closedSplit,
    openGroup,
    sameTab,
    type TabPlacement,
    tabGroup,
    type WorkspaceArtifactTarget,
    type WorkspaceSplit,
    type WorkspaceTabGroup,
    type WorkspaceTabRef,
    type WorkspaceTabsState,
    workspaceTabId,
} from './workspace-tabs-model.ts';

/** What opening an App-local tab carries; an open tab is selected instead of duplicated. */
export type AppTabInput =
    | { kind: 'agent'; agentId: string; section?: AgentSection }
    | {
          kind: 'artifact';
          source: string | null;
          target: WorkspaceArtifactTarget;
          title: string | null;
      };

export type WorkspaceTabsAction =
    | { kind: 'close'; ref: AppTabRef }
    /** Closes the split, its tabs placed in the main strip at `order`. */
    | { kind: 'closeSplit'; order: WorkspaceTabRef[] }
    | { kind: 'focus'; group: WorkspaceTabGroup }
    | { kind: 'moveToMain'; order: WorkspaceTabRef[]; ref: AppTabRef }
    | { kind: 'moveToSplit'; index?: number; ref: AppTabRef }
    | { kind: 'open'; placement: TabPlacement; tab: AppTabInput }
    /** Opens the split, moving the selected App-local main tab across. */
    | { kind: 'openSplit' }
    | { kind: 'reorder'; order: WorkspaceTabRef[] }
    /** Electron selected a browser tab: drops the main App-local selection, leaving focus alone. */
    | { kind: 'releaseMain' }
    | { kind: 'reorderSplit'; order: AppTabRef[] }
    | { kind: 'section'; agentId: string; section: AgentSection }
    /** Selects an open tab in its own group; null selects the main strip's primary or browser tab. */
    | { kind: 'select'; ref: AppTabRef | null };

export function workspaceTabsReducer(
    state: WorkspaceTabsState,
    action: WorkspaceTabsAction
): WorkspaceTabsState {
    switch (action.kind) {
        case 'open':
            return open(state, action.tab, action.placement);
        case 'select':
            return select(state, action.ref);
        case 'close':
            return close(state, action.ref);
        case 'releaseMain':
            return state.mainActive === null ? state : { ...state, mainActive: null };
        case 'focus':
            return state.focus === action.group ? state : { ...state, focus: action.group };
        case 'section':
            return {
                ...state,
                agents: state.agents.map((tab) =>
                    tab.agentId === action.agentId ? { ...tab, section: action.section } : tab
                ),
            };
        case 'reorder':
            return { ...state, order: action.order };
        case 'reorderSplit':
            return { ...state, split: { ...state.split, order: action.order } };
        case 'moveToSplit':
            return moveToSplit(state, action.ref, action.index);
        case 'moveToMain':
            return moveToMain(state, action.ref, action.order);
        case 'openSplit':
            if (state.split.open) {
                return state;
            }
            return state.mainActive
                ? moveToSplit(state, state.mainActive)
                : { ...state, split: { ...closedSplit, open: true } };
        case 'closeSplit':
            return { ...state, focus: 'main', order: action.order, split: closedSplit };
    }
}

function open(
    state: WorkspaceTabsState,
    input: AppTabInput,
    placement: TabPlacement
): WorkspaceTabsState {
    const ref = inputRef(input);
    const group = openGroup(state, ref, placement);
    let next = state;
    if (input.kind === 'agent' && input.section) {
        next = workspaceTabsReducer(next, {
            kind: 'section',
            agentId: input.agentId,
            section: input.section,
        });
    }
    if (tabGroup(state, ref) === null) {
        next =
            input.kind === 'agent'
                ? {
                      ...next,
                      agents: [
                          ...next.agents,
                          { agentId: input.agentId, section: input.section ?? 'home' },
                      ],
                  }
                : {
                      ...next,
                      artifacts: [
                          ...next.artifacts,
                          {
                              key: getArtifactPanelTargetKey(input.target),
                              source: input.source,
                              target: input.target,
                              title: input.title,
                          },
                      ],
                  };
        next =
            group === 'split'
                ? { ...next, split: { ...next.split, order: [...next.split.order, ref] } }
                : { ...next, order: [...next.order, ref] };
    }
    return select(next, ref);
}

function select(state: WorkspaceTabsState, ref: AppTabRef | null): WorkspaceTabsState {
    if (ref === null) {
        return state.mainActive === null && state.focus === 'main'
            ? state
            : { ...state, focus: 'main', mainActive: null };
    }
    const group = tabGroup(state, ref);
    if (group === 'split') {
        return sameTab(state.split.active, ref) && state.focus === 'split'
            ? state
            : { ...state, focus: 'split', split: { ...state.split, active: ref } };
    }
    if (group === 'main') {
        return sameTab(state.mainActive, ref) && state.focus === 'main'
            ? state
            : { ...state, focus: 'main', mainActive: ref };
    }
    return state;
}

function close(state: WorkspaceTabsState, ref: AppTabRef): WorkspaceTabsState {
    const id = workspaceTabId(ref);
    const keep = (item: WorkspaceTabRef) => workspaceTabId(item) !== id;
    const split = withoutSplitTab(state.split, ref);
    return {
        agents: state.agents.filter((tab) => keep({ kind: 'agent', agentId: tab.agentId })),
        artifacts: state.artifacts.filter((tab) => keep({ kind: 'artifact', key: tab.key })),
        focus: split.open ? state.focus : 'main',
        mainActive: sameTab(state.mainActive, ref) ? null : state.mainActive,
        order: state.order.filter(keep),
        split,
    };
}

function moveToSplit(state: WorkspaceTabsState, ref: AppTabRef, index?: number) {
    if (tabGroup(state, ref) === null) {
        return state;
    }
    const id = workspaceTabId(ref);
    const rest = state.split.order.filter((item) => workspaceTabId(item) !== id);
    const at = Math.max(0, Math.min(index ?? rest.length, rest.length));
    return {
        ...state,
        focus: 'split' as const,
        mainActive: sameTab(state.mainActive, ref) ? null : state.mainActive,
        order: state.order.filter((item) => workspaceTabId(item) !== id),
        split: { active: ref, open: true, order: [...rest.slice(0, at), ref, ...rest.slice(at)] },
    };
}

function moveToMain(state: WorkspaceTabsState, ref: AppTabRef, order: WorkspaceTabRef[]) {
    if (tabGroup(state, ref) === null) {
        return state;
    }
    return {
        ...state,
        focus: 'main' as const,
        mainActive: ref,
        order,
        split: withoutSplitTab(state.split, ref),
    };
}

/**
 * Removes a tab from the split. The split's selection falls to its last
 * remaining tab, and the split closes once its last tab leaves.
 */
function withoutSplitTab(split: WorkspaceSplit, ref: AppTabRef): WorkspaceSplit {
    const id = workspaceTabId(ref);
    if (!split.order.some((item) => workspaceTabId(item) === id)) {
        return split;
    }
    const order = split.order.filter((item) => workspaceTabId(item) !== id);
    if (order.length === 0) {
        return closedSplit;
    }
    return {
        active: sameTab(split.active, ref) ? (order.at(-1) ?? null) : split.active,
        open: true,
        order,
    };
}

function inputRef(input: AppTabInput): AppTabRef {
    return input.kind === 'agent'
        ? { kind: 'agent', agentId: input.agentId }
        : { kind: 'artifact', key: getArtifactPanelTargetKey(input.target) };
}

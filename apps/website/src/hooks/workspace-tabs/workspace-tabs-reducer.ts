import { getArtifactPanelTargetKey } from '../../features/chats/haus-resource-link.ts';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import {
    type AppTabRef,
    type ClosableTabRef,
    hasAppTab,
    sameTab,
    type ThreadTabRef,
    type WorkspaceArtifactTarget,
    type WorkspaceFocus,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';

/** What opening an App-local tab carries; an open tab is selected instead of duplicated. */
export type AppTabInput =
    | { kind: 'agent'; agentId: string; section?: AgentSection }
    | {
          kind: 'artifact';
          source: string | null;
          target: WorkspaceArtifactTarget;
          title: string | null;
      }
    | { kind: 'thread'; anchorMessageId: string; chatId: string; pinned?: boolean };

export type WorkspaceTabsAction =
    | { kind: 'close'; ref: AppTabRef }
    /** Back to split mode, the side pane showing the selected closable tab. */
    | { kind: 'collapse' }
    /**
     * To expanded mode, selecting the closable tab when `showClosable` (the
     * side pane was showing it), else the primary tab.
     */
    | { kind: 'expand'; showClosable: boolean }
    | { kind: 'focus'; focus: WorkspaceFocus }
    | { kind: 'open'; tab: AppTabInput }
    /** Keeps the preview tab: the next Thread opens beside it instead of replacing it. */
    | { kind: 'pin'; ref: AppTabRef }
    | { kind: 'reorder'; order: ClosableTabRef[] }
    | { kind: 'section'; agentId: string; section: AgentSection }
    /** Selects and shows an open App-local tab. */
    | { kind: 'select'; ref: AppTabRef }
    /** Electron selected a browser tab: it is the selected closable tab now, and shows. */
    | { kind: 'selectBrowser' }
    /** Selects the routed page: the primary tab in expanded mode, Command-W focus in split mode. */
    | { kind: 'selectPrimary' }
    | { kind: 'sidePane'; visible: boolean };

export function workspaceTabsReducer(
    state: WorkspaceTabsState,
    action: WorkspaceTabsAction
): WorkspaceTabsState {
    switch (action.kind) {
        case 'open':
            return open(state, action.tab);
        case 'select':
            return hasAppTab(state, action.ref) ? show({ ...state, active: action.ref }) : state;
        case 'selectBrowser':
            return show({ ...state, active: null });
        case 'selectPrimary':
            return { ...state, focus: 'primary', primarySelected: true };
        case 'close':
            return close(state, action.ref);
        case 'pin':
            return sameTab(state.preview, action.ref) ? { ...state, preview: null } : state;
        case 'focus':
            return state.focus === action.focus ? state : { ...state, focus: action.focus };
        case 'section':
            return {
                ...state,
                agents: state.agents.map((tab) =>
                    tab.agentId === action.agentId ? { ...tab, section: action.section } : tab
                ),
            };
        case 'reorder':
            return { ...state, order: action.order };
        case 'sidePane':
            return {
                ...state,
                focus: action.visible ? 'side' : 'primary',
                sidePaneVisible: action.visible,
            };
        case 'expand':
            return { ...state, mode: 'expanded', primarySelected: !action.showClosable };
        case 'collapse':
            return { ...state, mode: 'split', sidePaneVisible: true };
    }
}

/** Shows the selected closable tab: the side pane reveals, or the expanded strip selects it. */
function show(state: WorkspaceTabsState): WorkspaceTabsState {
    return { ...state, focus: 'side', primarySelected: false, sidePaneVisible: true };
}

function open(state: WorkspaceTabsState, input: AppTabInput): WorkspaceTabsState {
    const ref = inputRef(input);
    let next = state;
    if (input.kind === 'agent' && input.section) {
        next = workspaceTabsReducer(next, {
            kind: 'section',
            agentId: input.agentId,
            section: input.section,
        });
    }
    if (!hasAppTab(state, ref)) {
        next = withTabRecord(next, input);
        next =
            ref.kind === 'thread' && !(input.kind === 'thread' && input.pinned)
                ? asPreview(next, ref)
                : { ...next, order: [...next.order, ref] };
    }
    return show({ ...next, active: ref });
}

/**
 * Lands a new Thread as the preview tab, taking the current preview's place
 * in the strip (and dropping its record) when there is one.
 */
function asPreview(state: WorkspaceTabsState, ref: ThreadTabRef): WorkspaceTabsState {
    const replaced = state.preview;
    const at = replaced ? state.order.findIndex((item) => sameTab(item, replaced)) : -1;
    const order =
        at < 0
            ? [...state.order, ref]
            : [...state.order.slice(0, at), ref, ...state.order.slice(at + 1)];
    return {
        ...state,
        order,
        preview: ref,
        threads: replaced
            ? state.threads.filter((tab) => !sameTab({ kind: 'thread', ...tab }, replaced))
            : state.threads,
    };
}

function withTabRecord(state: WorkspaceTabsState, input: AppTabInput): WorkspaceTabsState {
    switch (input.kind) {
        case 'agent':
            return {
                ...state,
                agents: [
                    ...state.agents,
                    { agentId: input.agentId, section: input.section ?? 'home' },
                ],
            };
        case 'artifact':
            return {
                ...state,
                artifacts: [
                    ...state.artifacts,
                    {
                        key: getArtifactPanelTargetKey(input.target),
                        source: input.source,
                        target: input.target,
                        title: input.title,
                    },
                ],
            };
        case 'thread':
            return {
                ...state,
                threads: [
                    ...state.threads,
                    { anchorMessageId: input.anchorMessageId, chatId: input.chatId },
                ],
            };
    }
}

function close(state: WorkspaceTabsState, ref: AppTabRef): WorkspaceTabsState {
    const keep = (item: AppTabRef) => !sameTab(item, ref);
    return {
        ...state,
        active: sameTab(state.active, ref) ? null : state.active,
        agents: state.agents.filter((tab) => keep({ kind: 'agent', agentId: tab.agentId })),
        artifacts: state.artifacts.filter((tab) => keep({ kind: 'artifact', key: tab.key })),
        order: state.order.filter((item) => !sameTab(item, ref)),
        preview: sameTab(state.preview, ref) ? null : state.preview,
        threads: state.threads.filter((tab) => keep({ kind: 'thread', ...tab })),
    };
}

function inputRef(input: AppTabInput): AppTabRef {
    switch (input.kind) {
        case 'agent':
            return { kind: 'agent', agentId: input.agentId };
        case 'artifact':
            return { kind: 'artifact', key: getArtifactPanelTargetKey(input.target) };
        case 'thread':
            return { kind: 'thread', anchorMessageId: input.anchorMessageId, chatId: input.chatId };
    }
}

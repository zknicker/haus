import { chatPaneTargetSchema } from '@haus/api';
import { getArtifactPanelTargetKey } from '../../features/chats/haus-resource-link.ts';
import { isAgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import {
    type AgentTab,
    type AppTabRef,
    type ArtifactTab,
    emptyWorkspaceTabs,
    sameTab,
    type ThreadTab,
    type WorkspaceArtifactTarget,
    type WorkspaceMode,
    type WorkspaceTabsState,
    workspaceTabId,
} from './workspace-tabs-model.ts';

/** The window layout is a per-device choice, like the window layout setting. */
export const workspaceModeStorageKey = 'haus.workspaceMode';

export function parseWorkspaceMode(raw: string | null): WorkspaceMode {
    return raw === 'expanded' ? 'expanded' : 'split';
}

/**
 * Persists App-local tabs per Server: artifacts, Agent profiles, pinned
 * Threads, and their strip order. Browser tabs, the preview tab, and
 * selection are not restored.
 */
export function serializeWorkspaceTabs(state: WorkspaceTabsState): string {
    const { preview } = state;
    return JSON.stringify({
        agents: state.agents,
        artifacts: state.artifacts,
        order: state.order.filter((ref) => ref.kind !== 'browser' && !sameTab(ref, preview)),
        threads: state.threads.filter((tab) => !sameTab({ kind: 'thread', ...tab }, preview)),
    });
}

/**
 * Restores persisted tabs, dropping anything malformed, into `mode` with
 * nothing selected: the side pane starts hidden, its count badge showing what
 * came back. Every shape saved so far parses — before Agent or Thread tabs
 * existed (no `agents` or `threads`), and with a `primary` entry in `order`
 * from when the primary tab could move: it is a real contract in users'
 * localStorage.
 */
export function parseWorkspaceTabs(
    raw: string | null,
    mode: WorkspaceMode = 'split'
): WorkspaceTabsState {
    const empty = { ...emptyWorkspaceTabs, mode, sidePaneVisible: false };
    if (!raw) {
        return empty;
    }
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return empty;
    }
    if (!(value && typeof value === 'object' && 'artifacts' in value && 'order' in value)) {
        return empty;
    }
    const artifacts = unique(
        (Array.isArray(value.artifacts) ? value.artifacts : []).map(parseArtifactTab),
        (tab) => tab.key
    );
    const agents = unique(
        ('agents' in value && Array.isArray(value.agents) ? value.agents : []).map(parseAgentTab),
        (tab) => tab.agentId
    );
    const threads = unique(
        ('threads' in value && Array.isArray(value.threads) ? value.threads : []).map(
            parseThreadTab
        ),
        (tab) => workspaceTabId({ kind: 'thread', ...tab })
    );
    const live = new Set([
        ...artifacts.map((tab) => workspaceTabId({ kind: 'artifact', key: tab.key })),
        ...agents.map((tab) => workspaceTabId({ kind: 'agent', agentId: tab.agentId })),
        ...threads.map((tab) => workspaceTabId({ kind: 'thread', ...tab })),
    ]);
    const order = Array.isArray(value.order) ? parseOrder(value.order, live) : [];
    return { ...empty, agents, artifacts, order, threads };
}

/** Keeps known App-local refs; a legacy `primary` entry and unknown kinds drop. */
function parseOrder(entries: unknown[], live: ReadonlySet<string>): AppTabRef[] {
    return entries.flatMap((entry): AppTabRef[] => {
        if (!(entry && typeof entry === 'object' && 'kind' in entry)) {
            return [];
        }
        let ref: AppTabRef | null = null;
        if (entry.kind === 'artifact' && 'key' in entry && typeof entry.key === 'string') {
            ref = { kind: 'artifact', key: entry.key };
        } else if (
            entry.kind === 'agent' &&
            'agentId' in entry &&
            typeof entry.agentId === 'string'
        ) {
            ref = { kind: 'agent', agentId: entry.agentId };
        } else if (entry.kind === 'thread') {
            const tab = parseThreadTab(entry);
            ref = tab && { kind: 'thread', ...tab };
        }
        return ref && live.has(workspaceTabId(ref)) ? [ref] : [];
    });
}

function parseThreadTab(entry: unknown): ThreadTab | null {
    if (
        entry &&
        typeof entry === 'object' &&
        'chatId' in entry &&
        typeof entry.chatId === 'string' &&
        entry.chatId.length > 0 &&
        'anchorMessageId' in entry &&
        typeof entry.anchorMessageId === 'string' &&
        entry.anchorMessageId.length > 0
    ) {
        return { anchorMessageId: entry.anchorMessageId, chatId: entry.chatId };
    }
    return null;
}

function parseAgentTab(entry: unknown): AgentTab | null {
    if (
        !(
            entry &&
            typeof entry === 'object' &&
            'agentId' in entry &&
            typeof entry.agentId === 'string' &&
            entry.agentId.length > 0
        )
    ) {
        return null;
    }
    const section =
        'section' in entry && typeof entry.section === 'string' && isAgentSection(entry.section)
            ? entry.section
            : 'home';
    return { agentId: entry.agentId, section };
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

/** Drops nulls and later duplicates by key. */
function unique<T>(entries: (T | null)[], key: (entry: T) => string): T[] {
    const seen = new Set<string>();
    return entries.flatMap((entry) => {
        if (!entry || seen.has(key(entry))) {
            return [];
        }
        seen.add(key(entry));
        return [entry];
    });
}

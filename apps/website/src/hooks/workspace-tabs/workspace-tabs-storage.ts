import { chatPaneTargetSchema } from '@haus/api';
import { getArtifactPanelTargetKey } from '../../features/chats/haus-resource-link.ts';
import { isAgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import {
    type AgentTab,
    type ArtifactTab,
    emptyWorkspaceTabs,
    primaryTabRef,
    type WorkspaceArtifactTarget,
    type WorkspaceTabRef,
    type WorkspaceTabsState,
    workspaceTabId,
} from './workspace-tabs-model.ts';

/**
 * Persists App-local tabs per Server: artifacts, Agent profiles, and the main
 * strip order. Browser tabs are not restored, and the split is per window, so
 * split tabs persist folded onto the end of the main order.
 */
export function serializeWorkspaceTabs(state: WorkspaceTabsState): string {
    return JSON.stringify({
        agents: state.agents,
        artifacts: state.artifacts,
        order: [...state.order.filter((ref) => ref.kind !== 'browser'), ...state.split.order],
    });
}

/**
 * Restores persisted tabs into the main strip, dropping anything malformed.
 * Selection is not restored. State saved before Agent tabs existed (no
 * `agents`) still parses: it is a real contract in users' localStorage.
 */
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
    const artifacts = unique(
        (Array.isArray(value.artifacts) ? value.artifacts : []).map(parseArtifactTab),
        (tab) => tab.key
    );
    const agents = unique(
        ('agents' in value && Array.isArray(value.agents) ? value.agents : []).map(parseAgentTab),
        (tab) => tab.agentId
    );
    const live = new Set([
        ...artifacts.map((tab) => workspaceTabId({ kind: 'artifact', key: tab.key })),
        ...agents.map((tab) => workspaceTabId({ kind: 'agent', agentId: tab.agentId })),
    ]);
    const order = Array.isArray(value.order) ? parseOrder(value.order, live) : [];
    return { ...emptyWorkspaceTabs, agents, artifacts, order };
}

/** Keeps known App-local refs and the first primary ref; the resolver places a missing primary. */
function parseOrder(entries: unknown[], live: ReadonlySet<string>): WorkspaceTabRef[] {
    let primary = false;
    return entries.flatMap((entry): WorkspaceTabRef[] => {
        if (!(entry && typeof entry === 'object' && 'kind' in entry)) {
            return [];
        }
        if (entry.kind === 'primary' && !primary) {
            primary = true;
            return [primaryTabRef];
        }
        let ref: WorkspaceTabRef | null = null;
        if (entry.kind === 'artifact' && 'key' in entry && typeof entry.key === 'string') {
            ref = { kind: 'artifact', key: entry.key };
        } else if (
            entry.kind === 'agent' &&
            'agentId' in entry &&
            typeof entry.agentId === 'string'
        ) {
            ref = { kind: 'agent', agentId: entry.agentId };
        }
        return ref && live.has(workspaceTabId(ref)) ? [ref] : [];
    });
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

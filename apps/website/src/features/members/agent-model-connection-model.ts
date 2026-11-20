import {
    type Agent,
    type ModelConnection,
    type ModelConnectionsRead,
    modelProviderFor,
} from '@haus/api';
import { modelProviderNames } from '../settings/models/connections/model-connection-model.ts';

type AgentConnectionFields = Pick<Agent, 'desiredModelId' | 'modelConnectionId'>;

export const defaultConnectionKey = 'default';

export function agentConnectionChoice(
    agent: AgentConnectionFields,
    connections: readonly ModelConnection[]
) {
    const provider = modelProviderFor(agent.desiredModelId);
    const options = providerConnections(provider, connections);
    const first = options.find((connection) => connection.enabled) ?? options[0];
    if (!first) {
        return { kind: 'none' as const, provider, providerName: modelProviderNames[provider] };
    }
    const chosen = options.find((connection) => connection.id === agent.modelConnectionId);
    return {
        defaultLabel: first.label,
        kind: 'choose' as const,
        options,
        provider,
        providerName: modelProviderNames[provider],
        selectedKey: chosen ? chosen.id : defaultConnectionKey,
    };
}

export function agentConnectionIssue(
    agent: AgentConnectionFields,
    read: Pick<ModelConnectionsRead, 'agentLoop' | 'connections'>
) {
    if (read.agentLoop !== 'runner') {
        return null;
    }
    const provider = modelProviderFor(agent.desiredModelId);
    const providerName = modelProviderNames[provider];
    const options = providerConnections(provider, read.connections);
    const pinned = options.find((connection) => connection.id === agent.modelConnectionId);
    if (pinned && !pinned.enabled) {
        return { connection: pinned, kind: 'disabled' as const, providerName };
    }
    const resolved = pinned ?? options.find((connection) => connection.enabled);
    if (!resolved) {
        return { kind: 'missing' as const, providerName };
    }
    return resolved.status === 'failed'
        ? { connection: resolved, kind: 'failed' as const, providerName }
        : null;
}

export type AgentConnectionIssue = NonNullable<ReturnType<typeof agentConnectionIssue>>;

export const connectionIssueFix: Record<AgentConnectionIssue['kind'], string> = {
    disabled: 'Turn it on in Settings → Models',
    failed: 'Reconnect in Settings → Models',
    missing: 'Connect one in Settings → Models',
};

export function connectionIssueTitle(issue: AgentConnectionIssue) {
    switch (issue.kind) {
        case 'disabled':
            return `${issue.connection.label} is turned off`;
        case 'failed':
            return `${issue.providerName} connection failed`;
        case 'missing':
            return `No ${issue.providerName} connection`;
    }
}

export function connectionIdForKey(key: unknown) {
    return key === defaultConnectionKey || typeof key !== 'string' ? null : key;
}

function providerConnections(
    provider: ModelConnection['provider'],
    connections: readonly ModelConnection[]
) {
    return connections
        .filter((connection) => connection.provider === provider)
        .sort((left, right) => left.position - right.position);
}

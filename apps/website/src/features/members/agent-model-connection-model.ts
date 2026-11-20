import { type Agent, type ModelConnection, modelProviderFor } from '@haus/api';
import { modelProviderNames } from '../settings/models/connections/model-connection-model.ts';

type AgentConnectionFields = Pick<Agent, 'desiredModelId' | 'modelConnectionId'>;

export const defaultConnectionKey = 'default';

export function agentConnectionChoice(
    agent: AgentConnectionFields,
    connections: readonly ModelConnection[]
) {
    const provider = modelProviderFor(agent.desiredModelId);
    const options = providerConnections(provider, connections);
    const [first] = options;
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
    connections: readonly ModelConnection[]
) {
    const provider = modelProviderFor(agent.desiredModelId);
    const providerName = modelProviderNames[provider];
    const options = providerConnections(provider, connections);
    const resolved =
        options.find((connection) => connection.id === agent.modelConnectionId) ?? options[0];
    if (!resolved) {
        return { kind: 'missing' as const, providerName };
    }
    return resolved.status === 'failed'
        ? { connection: resolved, kind: 'failed' as const, providerName }
        : null;
}

export type AgentConnectionIssue = NonNullable<ReturnType<typeof agentConnectionIssue>>;

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

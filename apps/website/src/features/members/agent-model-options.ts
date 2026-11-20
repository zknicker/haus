import {
    type ComputerRuntime,
    type ModelConnection,
    type ModelProvider,
    modelProviderFor,
    modelProviderNames,
} from '@haus/api';

type CatalogModel = ComputerRuntime['models'][number];

export interface AgentModelOption {
    connected: boolean;
    key: string;
    label: string;
    model: CatalogModel;
    provider: ModelProvider;
    runtimeId: string;
}

export interface AgentModelSection {
    id: string;
    options: AgentModelOption[];
    title: string | null;
}

export function agentModelOptions(
    runtimes: readonly ComputerRuntime[],
    connections: readonly Pick<ModelConnection, 'enabled' | 'provider'>[] | null
) {
    return runtimes.flatMap((runtime) =>
        runtime.models.map((model) => {
            const provider = modelProviderFor(model.id);
            const option: AgentModelOption = {
                connected:
                    connections === null ||
                    connections.some(
                        (connection) => connection.enabled && connection.provider === provider
                    ),
                key: agentModelKey(runtime.id, model.id),
                label: model.label,
                model,
                provider,
                runtimeId: runtime.id,
            };
            return option;
        })
    );
}

export function agentModelSections(
    options: readonly AgentModelOption[],
    grouping: 'provider' | 'flat'
) {
    if (grouping === 'flat') {
        const flat: AgentModelSection = {
            id: 'all',
            options: [...options].sort((left, right) => left.label.localeCompare(right.label)),
            title: null,
        };
        return [flat];
    }
    const providers = [...new Set(options.map((option) => option.provider))];
    return providers.map((provider) => {
        const section: AgentModelSection = {
            id: provider,
            options: options.filter((option) => option.provider === provider),
            title: modelProviderNames[provider],
        };
        return section;
    });
}

export function agentModelKey(runtimeId: string, modelId: string) {
    return `${runtimeId}::${modelId}`;
}

export function contextWindowLabel(tokens: number) {
    if (tokens >= 1_000_000) {
        return `${Number((tokens / 1_000_000).toFixed(1))}M`;
    }
    return `${Math.round(tokens / 1000)}K`;
}

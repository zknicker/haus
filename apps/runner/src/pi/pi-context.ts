import {
    type CompactionPolicy,
    type CompactionSettings,
    DEFAULT_COMPACTION_POLICY,
    type HarnessSettings,
    type ModelRef,
} from '@earendil-works/pi-durable';
import { estimateTokens, type HarnessContext } from '../turn/context-snapshot.ts';

export function piHarnessContext(input: {
    model: { readonly contextWindow: number };
    policy: CompactionPolicy;
    tools: readonly {
        readonly description: string;
        readonly name: string;
        readonly parameters: unknown;
    }[];
}) {
    const { contextWindow } = input.model;
    const { backgroundTokens, enabled, reserveTokens } = input.policy;
    const schemas = input.tools.map(({ description, name, parameters }) => ({
        description,
        name,
        parameters,
    }));
    const context: HarnessContext = {
        compactAtTokens: enabled ? contextWindow - reserveTokens - backgroundTokens : contextWindow,
        contextWindow,
        kind: 'window',
        toolTokens: estimateTokens(JSON.stringify(schemas)),
    };
    return context;
}

export function piCompactionPolicy(
    settings: HarnessSettings,
    model: ModelRef,
    conversation: CompactionSettings | undefined
) {
    const { modelOverrides, ...harness } = {
        ...DEFAULT_COMPACTION_POLICY,
        ...settings.compaction,
    };
    const key = `${model.provider}/${model.modelId}`;
    const conversationModel = conversation?.modelOverrides?.[key];
    const layers = [conversationModel, modelOverrides?.[key], conversation];
    const field = <Name extends keyof CompactionPolicy>(name: Name) =>
        layers.find((layer) => layer?.[name] !== undefined)?.[name] ?? harness[name];
    const policy: CompactionPolicy = {
        backgroundTokens: field('backgroundTokens'),
        enabled:
            conversationModel?.enabled ??
            (conversation?.enabled === false ? false : field('enabled')),
        keepRecentTokens: field('keepRecentTokens'),
        reserveTokens: field('reserveTokens'),
    };
    return policy;
}

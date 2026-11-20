import type { Api, Model, Provider } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import type { AgentReasoningEffort, ComputerRuntime } from '@haus/api';
import { noAmbientAuth } from './pi/pi-models.ts';

export const curatedModels = [
    {
        id: 'claude-code',
        label: 'Claude',
        modelIds: ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
        provider: anthropicProvider,
    },
    {
        id: 'codex',
        label: 'ChatGPT',
        modelIds: ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-astra', 'gpt-6-luna'],
        provider: openaiCodexProvider,
    },
    {
        id: 'grok-build',
        label: 'Grok',
        modelIds: ['grok-4.7', 'grok-4.6'],
        provider: xaiProvider,
    },
    {
        id: 'gemini',
        label: 'Gemini',
        modelIds: ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
        provider: googleProvider,
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        modelIds: [
            'deepseek/deepseek-v4-pro',
            'moonshotai/kimi-k3.1-pro',
            'qwen/qwen3.5-plus-02-15',
            'minimax/minimax-m3',
            'mistralai/mistral-large-4-0',
        ],
        provider: openrouterProvider,
    },
] as const satisfies readonly {
    id: string;
    label: string;
    modelIds: readonly string[];
    provider: () => Provider;
}[];

export function runnerModelCatalog() {
    return curatedModels.map((family) => {
        const provider = family.provider();
        const models = createModels({ authContext: noAmbientAuth });
        models.setProvider(provider);
        const runtime: ComputerRuntime = {
            id: family.id,
            label: family.label,
            models: family.modelIds.map((modelId) => {
                const model = models.getModel(provider.id, modelId);
                if (!model) {
                    throw new Error(`Pi does not know the curated model ${modelId}.`);
                }
                return catalogModel(model);
            }),
        };
        return runtime;
    });
}

function catalogModel(model: Model<Api>) {
    const efforts = model.reasoning ? reasoningEfforts(model) : [];
    return {
        contextWindow: model.contextWindow,
        id: model.id,
        label: model.name,
        ...(efforts.length > 0 ? { reasoningEfforts: efforts } : {}),
    };
}

function reasoningEfforts(model: Model<Api>) {
    const levels = model.thinkingLevelMap ?? {};
    return effortLevels.filter((effort) => levels[effort] !== null);
}

const effortLevels = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly Exclude<
    AgentReasoningEffort,
    'default'
>[];

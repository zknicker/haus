import type { AuthContext, Models, Provider } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import type { ModelProvider } from '@haus/api';
import type { ConnectionBook } from '../model-connections/connection-book.ts';
import type { RunnerLink } from '../run-context.ts';
import { connectionCredentialStore } from './pi-connection-credentials.ts';

export interface PiConnectionModels {
    readonly models: Models;
    readonly providerId: string;
}

export function piProviderFor(provider: ModelProvider) {
    switch (provider) {
        case 'chatgpt':
            return openaiCodexProvider();
        case 'xai':
            return xaiProvider();
        case 'gemini':
            return googleProvider();
        case 'openrouter':
            return openrouterProvider();
        case 'claude':
            throw new Error('Claude connections run on the Claude Agent SDK, not Pi.');
        default:
            return provider satisfies never;
    }
}

export function connectionModels(input: {
    book: ConnectionBook;
    connectionId: string;
    link: RunnerLink;
    provider: Provider;
}) {
    const models = createModels({
        authContext: noAmbientAuth,
        credentials: connectionCredentialStore({ ...input, providerId: input.provider.id }),
    });
    models.setProvider(input.provider);
    const opened: PiConnectionModels = { models, providerId: input.provider.id };
    return opened;
}

export function piModelRef(opened: PiConnectionModels, modelId: string) {
    return opened.models.getModel(opened.providerId, modelId)
        ? { modelId, provider: opened.providerId }
        : null;
}

export function piToolFamily(modelId: string) {
    return gptModel.test(modelId) ? 'gpt' : 'text-editor';
}

export type PiToolFamily = ReturnType<typeof piToolFamily>;

export class PiModelUnavailableError extends Error {
    constructor(modelId: string, providerId: string) {
        super(`The Pi provider ${providerId} does not serve the model ${modelId}.`);
        this.name = 'PiModelUnavailableError';
    }
}

export const noAmbientAuth: AuthContext = {
    env: () => Promise.resolve(undefined),
    fileExists: () => Promise.resolve(false),
};

const gptModel = /(?:^|\/)gpt-/u;

import type { AuthContext, CredentialStore, Models } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';

export interface PiApiKeys {
    readonly geminiApiKey: string | null;
    readonly openrouterApiKey: string | null;
    readonly xaiApiKey: string | null;
}

export function createPiModels(input: { apiKeys: PiApiKeys; credentials: CredentialStore }) {
    const models = createModels({
        authContext: piAuthContext(input.apiKeys),
        credentials: input.credentials,
    });
    for (const provider of [
        openaiCodexProvider(),
        xaiProvider(),
        googleProvider(),
        openrouterProvider(),
    ]) {
        models.setProvider(provider);
    }
    return models;
}

export function piAuthContext(apiKeys: PiApiKeys) {
    const values: Readonly<Record<string, string | null>> = {
        GEMINI_API_KEY: apiKeys.geminiApiKey,
        OPENROUTER_API_KEY: apiKeys.openrouterApiKey,
        XAI_API_KEY: apiKeys.xaiApiKey,
    };
    const context: AuthContext = {
        env: (name) => Promise.resolve(values[name] ?? undefined),
        fileExists: () => Promise.resolve(false),
    };
    return context;
}

export function piModelRef(models: Models, modelId: string) {
    const provider = models
        .getProviders()
        .find((candidate) => models.getModel(candidate.id, modelId) !== undefined);
    return provider ? { modelId, provider: provider.id } : null;
}

export function piToolFamily(modelId: string) {
    return gptModel.test(modelId) ? 'gpt' : 'text-editor';
}

export type PiToolFamily = ReturnType<typeof piToolFamily>;

export class PiModelUnavailableError extends Error {
    constructor(modelId: string) {
        super(`No Pi provider on this runner serves the model ${modelId}.`);
        this.name = 'PiModelUnavailableError';
    }
}

const gptModel = /(?:^|\/)gpt-/u;

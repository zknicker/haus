import { expect, test } from 'bun:test';
import { createModels } from '@earendil-works/pi-ai/models';
import { curatedModels, defaultThinkingLevel, runnerModelCatalog } from './model-catalog.ts';
import { noAmbientAuth } from './pi/pi-models.ts';

const curatedModel = (familyId: string, modelId: string) => {
    const family = curatedModels.find((candidate) => candidate.id === familyId);
    if (!family) {
        throw new Error(`No curated family ${familyId}.`);
    }
    const provider = family.provider();
    const models = createModels({ authContext: noAmbientAuth });
    models.setProvider(provider);
    const model = models.getModel(provider.id, modelId);
    if (!model) {
        throw new Error(`Pi does not know ${modelId}.`);
    }
    return model;
};

test('a GPT Captain on the default effort reasons at its model default, not off', () => {
    expect(defaultThinkingLevel(curatedModel('codex', 'gpt-6.1-sol'))).toBe('medium');
});

test('every curated reasoning model gets a default level it supports', () => {
    for (const runtime of runnerModelCatalog()) {
        for (const listed of runtime.models) {
            const level = defaultThinkingLevel(curatedModel(runtime.id, listed.id));
            if (listed.reasoningEfforts) {
                expect(listed.reasoningEfforts).toContain(level);
            } else {
                expect(level).toBeNull();
            }
        }
    }
});

import { expect, test } from 'bun:test';
import { computerRuntimeSchema, modelProviderFor } from '@haus/api';
import { runnerModelCatalog } from './model-catalog.ts';
import { harnessFor } from './turn/runtime-driver.ts';

test('the runner catalog lists every curated model with Pi metadata, one provider per family', () => {
    const catalog = runnerModelCatalog();

    expect(catalog.map((runtime) => runtime.id)).toEqual([
        'claude-code',
        'codex',
        'grok-build',
        'gemini',
        'openrouter',
    ]);
    const providers = catalog.map((runtime) => [
        ...new Set(runtime.models.map((model) => modelProviderFor(model.id))),
    ]);
    expect(providers).toEqual([['claude'], ['chatgpt'], ['xai'], ['gemini'], ['openrouter']]);
    for (const runtime of catalog) {
        expect(computerRuntimeSchema.parse(runtime)).toEqual(runtime);
        for (const model of runtime.models) {
            expect(model.contextWindow).toBeGreaterThan(0);
            expect(model.label).not.toBe(model.id);
        }
    }
    expect(catalog[0]?.models.map((model) => harnessFor(model.id))).toEqual(
        catalog[0]?.models.map(() => 'claude-agent-sdk')
    );
    expect(catalog[4]?.models.map((model) => model.label)).toEqual([
        'DeepSeek V4.1 Flash',
        'GLM 5.3',
        'Kimi K3.1 Pro',
        'MiMo-V2.6-Pro',
    ]);
    expect(catalog[0]?.models[1]).toEqual({
        contextWindow: 1_000_000,
        id: 'claude-opus-5-5',
        label: expect.any(String),
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    });
});

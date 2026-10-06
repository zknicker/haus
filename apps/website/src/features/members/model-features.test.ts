import { expect, test } from 'bun:test';
import { modelFeatureDescription, modelFeatureLabels } from './model-features.ts';

test('labels model features, with the Codex plan caveat on image generation', () => {
    expect(modelFeatureLabels('claude-code', ['subagents'])).toEqual(['Sub-agents']);
    expect(modelFeatureLabels('grok-build', ['image-generation'])).toEqual(['Image generation']);
    expect(modelFeatureLabels('codex', ['image-generation'])).toEqual([
        'Image generation (ChatGPT paid plans)',
    ]);
});

test('describes no features, or an older Computer that reports none, as nothing', () => {
    expect(modelFeatureDescription('pi', [])).toBeUndefined();
    expect(modelFeatureDescription('codex')).toBeUndefined();
    expect(modelFeatureDescription('claude-code', ['subagents', 'image-generation'])).toBe(
        'Sub-agents · Image generation'
    );
});

import { expect, test } from 'bun:test';
import { modelDefaultReasoningEffort, reasoningChangeResetsSession } from './agent-execution.ts';
import { computerModelSchema } from './computer-inventory.ts';

test('model defaults are concrete, supported settings', () => {
    const model = computerModelSchema.parse({
        id: 'model',
        label: 'Model',
        defaultReasoningEffort: 'high',
        reasoningEfforts: ['low', 'medium', 'high'],
    });
    expect(modelDefaultReasoningEffort(model)).toBe('high');
    expect(modelDefaultReasoningEffort({})).toBe('medium');
    expect(computerModelSchema.safeParse({ ...model, defaultReasoningEffort: 'max' }).success).toBe(
        false
    );
});

test('only the Grok adapter requires a fresh session for an effort change', () => {
    for (const runtimeId of ['claude-code', 'codex', 'pi']) {
        expect(reasoningChangeResetsSession(runtimeId)).toBe(false);
    }
    expect(reasoningChangeResetsSession('grok-build')).toBe(true);
});

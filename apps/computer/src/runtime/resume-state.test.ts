import { expect, test } from 'bun:test';
import { isHausResumeState, parseRuntimeResumeState } from './resume-state.ts';

test('a Haus resume state must parse exactly', () => {
    const claude = { claudeSessionId: 'c1', runtime: 'claude-code', version: 1 };
    expect(parseRuntimeResumeState(claude)).toEqual(claude);
    expect(isHausResumeState(claude)).toBe(true);
    expect(parseRuntimeResumeState({ runtime: 'codex', version: 1 })).toBeNull();
    expect(
        parseRuntimeResumeState({ runtime: 'claude-code', sessionId: 'x', version: 2 })
    ).toBeNull();
});

test('any other object is a legacy harness state the adapter still owns', () => {
    const legacy = { data: { sessionId: 's1' }, harnessId: 'claude-code', type: 'resume-session' };
    expect(parseRuntimeResumeState(legacy)).toBe(legacy);
    expect(isHausResumeState(legacy)).toBe(false);
    for (const value of [null, undefined, 'state', 3, ['a']]) {
        expect(parseRuntimeResumeState(value)).toBeNull();
    }
});

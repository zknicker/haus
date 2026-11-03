import { expect, test } from 'bun:test';
import {
    isHausResumeState,
    parseRuntimeResumeState,
    UnreadableResumeState,
} from './resume-state.ts';

test('a Haus resume state must parse exactly', () => {
    const claude = { claudeSessionId: 'c1', runtime: 'claude-code', version: 1 };
    expect(parseRuntimeResumeState(claude)).toEqual(claude);
    expect(isHausResumeState(claude)).toBe(true);
});

test('a Haus-shaped state that does not parse is kept as unreadable, not dropped', () => {
    for (const value of [
        { runtime: 'codex', version: 1 },
        { runtime: 'claude-code', sessionId: 'x', version: 2 },
        'state',
        3,
        ['a'],
    ]) {
        const parsed = parseRuntimeResumeState(value);
        expect(parsed).toBeInstanceOf(UnreadableResumeState);
        expect((parsed as UnreadableResumeState).stored).toEqual(value);
    }
});

test('any other object is a legacy harness state the adapter still owns', () => {
    const legacy = { data: { sessionId: 's1' }, harnessId: 'claude-code', type: 'resume-session' };
    expect(parseRuntimeResumeState(legacy)).toBe(legacy);
    expect(isHausResumeState(legacy)).toBe(false);
    for (const value of [null, undefined]) {
        expect(parseRuntimeResumeState(value)).toBeNull();
    }
});

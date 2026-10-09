import { expect, test } from 'bun:test';
import { resolveAgentActivityGhostTempo } from './agent-activity-ghost-tempo.ts';

test('keeps the mark calm outside an activity provider', () => {
    expect(resolveAgentActivityGhostTempo(null)).toBe('calm');
});

test('keeps the mark calm until the activity snapshot settles', () => {
    expect(resolveAgentActivityGhostTempo('unsettled')).toBe('calm');
});

test('keeps the mark calm on a settled quiet Server', () => {
    expect(resolveAgentActivityGhostTempo('quiet')).toBe('calm');
});

test('quickens the mark while any Agent is working', () => {
    expect(resolveAgentActivityGhostTempo('working')).toBe('lively');
});

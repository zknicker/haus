import { describe, expect, test } from 'bun:test';
import { agentThoughtFrameSchema, agentThoughtTextMaxLength } from './agent-thought.ts';

const frame = {
    agentId: 'agt_test',
    at: '2026-09-24T12:00:00.000Z',
    runId: 'run_test',
    text: 'Checking Halloween bid changes',
    type: 'agent-thought' as const,
};

describe('Agent thought contract', () => {
    test('accepts one short phrase and trims it', () => {
        expect(agentThoughtFrameSchema.parse({ ...frame, text: '  Reading the chart  ' })).toEqual({
            ...frame,
            text: 'Reading the chart',
        });
    });

    test('caps length and refuses multi-line, fenced, or empty text', () => {
        const longest = 'a'.repeat(agentThoughtTextMaxLength);
        expect(agentThoughtFrameSchema.safeParse({ ...frame, text: longest }).success).toBe(true);
        for (const text of [`${longest}a`, 'one\ntwo', 'run `rm`', '   ', '']) {
            expect(agentThoughtFrameSchema.safeParse({ ...frame, text }).success).toBe(false);
        }
    });

    test('carries nothing beyond the phrase and its run', () => {
        expect(agentThoughtFrameSchema.safeParse({ ...frame, reasoning: 'raw text' }).success).toBe(
            false
        );
    });
});

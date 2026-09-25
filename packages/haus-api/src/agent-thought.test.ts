import { describe, expect, test } from 'bun:test';
import { agentThoughtFrameSchema, agentThoughtTextMaxLength } from './agent-thought.ts';

const phrase = {
    agentId: 'agt_test',
    at: '2026-09-24T12:00:00.000Z',
    kind: 'phrase' as const,
    runId: 'run_test',
    text: 'Checking Halloween bid changes',
    type: 'agent-thought' as const,
};
const { kind: _kind, text: _text, ...base } = phrase;
const reasoning = {
    ...base,
    kind: 'reasoning' as const,
    reasoning: 'Comparing the Halloween bids with last week.\nThen the reply.',
};

describe('Agent thought contract', () => {
    test('accepts one short phrase and trims it', () => {
        expect(agentThoughtFrameSchema.parse({ ...phrase, text: '  Reading the chart  ' })).toEqual(
            {
                ...phrase,
                text: 'Reading the chart',
            }
        );
    });

    test('caps phrase length and refuses multi-line, fenced, or empty text', () => {
        const longest = 'a'.repeat(agentThoughtTextMaxLength);
        expect(agentThoughtFrameSchema.safeParse({ ...phrase, text: longest }).success).toBe(true);
        for (const text of [`${longest}a`, 'one\ntwo', 'run `rm`', '   ', '']) {
            expect(agentThoughtFrameSchema.safeParse({ ...phrase, text }).success).toBe(false);
        }
    });

    test('accepts a bounded multi-line excerpt and refuses short, long, or control text', () => {
        expect(agentThoughtFrameSchema.parse(reasoning)).toEqual(reasoning);
        for (const text of ['too short', 'a'.repeat(3001), `${'a'.repeat(50)}\u0007bell`]) {
            expect(
                agentThoughtFrameSchema.safeParse({ ...reasoning, reasoning: text }).success
            ).toBe(false);
        }
    });

    test('carries exactly one shape: a phrase or an excerpt, never both or neither', () => {
        for (const frame of [
            { ...phrase, reasoning: reasoning.reasoning },
            { ...reasoning, text: phrase.text },
            { ...base, kind: 'phrase' },
            { ...base, text: phrase.text },
        ]) {
            expect(agentThoughtFrameSchema.safeParse(frame).success).toBe(false);
        }
    });
});

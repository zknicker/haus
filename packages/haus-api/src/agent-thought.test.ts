import { describe, expect, test } from 'bun:test';
import {
    agentThoughtActionMaxLength,
    agentThoughtFrameSchema,
    agentThoughtResultMaxLength,
    agentThoughtTextMaxLength,
} from './agent-thought.ts';

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

const action = {
    ...base,
    action: 'curl api.open-meteo.com/v1/forecast',
    kind: 'action' as const,
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

    test('accepts a one-line action description up to its cap', () => {
        expect(agentThoughtFrameSchema.parse(action)).toEqual(action);
        const longest = 'a'.repeat(agentThoughtActionMaxLength);
        expect(agentThoughtFrameSchema.safeParse({ ...action, action: longest }).success).toBe(
            true
        );
        for (const text of [`${longest}a`, 'curl a\ncurl b', '  ']) {
            expect(agentThoughtFrameSchema.safeParse({ ...action, action: text }).success).toBe(
                false
            );
        }
        expect(agentThoughtFrameSchema.safeParse({ ...action, text: 'x' }).success).toBe(false);
    });

    test('an action may carry a bounded multi-line result excerpt', () => {
        const withResult = { ...action, result: 'Sat: rain 80%, high 58\nSun: sunny, high 66' };
        expect(agentThoughtFrameSchema.parse(withResult)).toEqual(withResult);
        const longest = 'a'.repeat(agentThoughtResultMaxLength);
        expect(agentThoughtFrameSchema.safeParse({ ...action, result: longest }).success).toBe(
            true
        );
        for (const result of [`${longest}a`, '  ', 'bell\u0007']) {
            expect(agentThoughtFrameSchema.safeParse({ ...action, result }).success).toBe(false);
        }
        expect(agentThoughtFrameSchema.safeParse({ ...phrase, result: 'Sat: rain' }).success).toBe(
            false
        );
    });

    test('an action frame fits no earlier kind, so a Server that predates it drops it', () => {
        const earlier = agentThoughtFrameSchema.options.filter(
            (option) => option.shape.kind.value !== 'action'
        );
        expect(earlier).toHaveLength(2);
        for (const option of earlier) {
            expect(option.safeParse(action).success).toBe(false);
        }
    });
});

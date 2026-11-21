import { expect, test } from 'bun:test';
import { agentContextSnapshotSchema } from '@haus/api';
import { contextSnapshot } from './context-snapshot.ts';

const start = { agentId: 'agt_1', modelId: 'claude-opus-5-5', sessionGeneration: 3 };
const measuredAt = '2026-11-20T18:00:00.000Z';
const skillListing = 's'.repeat(4000);
const measured = { instructions: 'i'.repeat(40_000), memory: 'm'.repeat(2000), skillListing };

test('harness counts keep their total while the skill listing and delivered memory get their own rows', () => {
    const snapshot = contextSnapshot({
        harness: {
            compactAtTokens: 400_000,
            contextWindow: 1_000_000,
            kind: 'counted',
            rows: { conversation: 50_000, memory: 0, skills: 0, systemPrompt: 11_000, tools: 6000 },
        },
        measured,
        measuredAt,
        providerTokens: null,
        start,
    });

    expect(snapshot).toEqual({
        agentId: 'agt_1',
        compactAtTokens: 400_000,
        contextWindow: 1_000_000,
        measuredAt,
        modelId: 'claude-opus-5-5',
        sections: [
            { id: 'system-prompt', tokens: 10_000 },
            { id: 'tools', tokens: 6000 },
            { id: 'skills', tokens: 1000 },
            { id: 'memory', tokens: 500 },
            { id: 'conversation', tokens: 49_500 },
        ],
        sessionGeneration: 3,
        source: 'harness',
        usedTokens: 67_000,
    });
    expect(agentContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
});

test('measured sections fill in around the provider total, and conversation takes the rest', () => {
    const snapshot = contextSnapshot({
        harness: {
            compactAtTokens: 350_000,
            contextWindow: 400_000,
            kind: 'window',
            toolTokens: 3000,
        },
        measured,
        measuredAt,
        providerTokens: 30_000,
        start,
    });

    expect(snapshot?.source).toBe('measured');
    expect(snapshot?.usedTokens).toBe(30_000);
    expect(snapshot?.sections).toEqual([
        { id: 'system-prompt', tokens: 9000 },
        { id: 'tools', tokens: 3000 },
        { id: 'skills', tokens: 1000 },
        { id: 'memory', tokens: 500 },
        { id: 'conversation', tokens: 16_500 },
    ]);
});

test('estimates that overshoot the provider total shrink to fit it', () => {
    const snapshot = contextSnapshot({
        harness: {
            compactAtTokens: 350_000,
            contextWindow: 400_000,
            kind: 'window',
            toolTokens: 3000,
        },
        measured,
        measuredAt,
        providerTokens: 6750,
        start,
    });

    expect(snapshot?.usedTokens).toBe(6750);
    expect(snapshot?.sections.find((section) => section.id === 'conversation')?.tokens).toBe(0);
});

test('a measured window without a provider total reports nothing', () => {
    expect(
        contextSnapshot({
            harness: {
                compactAtTokens: 350_000,
                contextWindow: 400_000,
                kind: 'window',
                toolTokens: 3000,
            },
            measured,
            measuredAt,
            providerTokens: null,
            start,
        })
    ).toBeNull();
});

test('a threshold past the model window is held to the window', () => {
    const snapshot = contextSnapshot({
        harness: {
            compactAtTokens: 250_000,
            contextWindow: 200_000,
            kind: 'counted',
            rows: { conversation: 1, memory: 0, skills: 0, systemPrompt: 0, tools: 0 },
        },
        measured: { instructions: '', memory: '', skillListing: '' },
        measuredAt,
        providerTokens: null,
        start,
    });

    expect(snapshot?.compactAtTokens).toBe(200_000);
});

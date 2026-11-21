import { expect, test } from 'bun:test';
import type { AgentContextSnapshot } from '@haus/api';
import { chatCaptainId, contextUsageView } from './context-usage-model.ts';

const snapshot: AgentContextSnapshot = {
    agentId: 'agt_cap',
    compactAtTokens: 400_000,
    contextWindow: 1_000_000,
    measuredAt: '2026-11-20T18:00:00.000Z',
    modelId: 'claude-opus-5-5',
    sections: [
        { id: 'system-prompt', tokens: 12_400 },
        { id: 'tools', tokens: 16_300 },
        { id: 'skills', tokens: 14_000 },
        { id: 'memory', tokens: 4700 },
        { id: 'conversation', tokens: 254_000 },
    ],
    sessionGeneration: 1,
    source: 'harness',
    usedTokens: 301_400,
};

test('the panel reads like Capy: used over the compaction threshold, rows, and the window', () => {
    const view = contextUsageView(snapshot);

    expect(view.summary).toBe('301.4K / 400K used (75%)');
    expect(view.compactAt).toBe('400K');
    expect(view.window).toBe('1M');
    expect(view.rows.map((row) => [row.label, row.tokens])).toEqual([
        ['System prompt', '12.4K'],
        ['Tools', '16.3K'],
        ['Skills', '14K'],
        ['Rules and memory', '4.7K'],
        ['Conversation', '254K'],
    ]);
    expect(view.rows.at(-1)?.share).toBeCloseTo(0.635);
});

test('a DM follows its Agent, a Channel its one Agent, and several Agents show no ring', () => {
    expect(chatCaptainId({ participantAgentIds: ['agt_a', 'agt_b'], peerAgentId: 'agt_a' })).toBe(
        'agt_a'
    );
    expect(chatCaptainId({ participantAgentIds: ['agt_b'], peerAgentId: null })).toBe('agt_b');
    expect(
        chatCaptainId({ participantAgentIds: ['agt_a', 'agt_b'], peerAgentId: null })
    ).toBeNull();
    expect(chatCaptainId({ participantAgentIds: [], peerAgentId: null })).toBeNull();
});

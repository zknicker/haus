import { expect, test } from 'bun:test';
import type { ChatEngagement } from '@haus/api';
import { formatChatTypingLabel, resolveChatTypists } from './chat-typing.ts';

test.each([
    [[], null],
    [['Juniper'], 'Juniper is typing'],
    [['Juniper', 'Cove'], 'Juniper and Cove are typing'],
    [['Juniper', 'Cove', 'Ash'], 'Juniper, Cove, and 1 other are typing'],
    [['Juniper', 'Cove', 'Ash', 'Fen'], 'Juniper, Cove, and 2 others are typing'],
] as const)('labels %p as %p', (names, label) => {
    expect(formatChatTypingLabel(names)).toBe(label);
});

test('typists follow engagement order, one per Agent, skipping unknown Agents', () => {
    const engagement = (agentId: string, runId: string): ChatEngagement => ({
        agentId,
        chatId: 'cht_general',
        runId,
        startedAt: '2026-09-23T12:00:00.000Z',
    });
    const agents = [
        { avatarUrl: null, displayName: 'Juniper', id: 'agt_juniper' },
        { avatarUrl: '/cove.png', displayName: 'Cove', id: 'agt_cove' },
    ];

    expect(
        resolveChatTypists(
            [
                engagement('agt_cove', 'run_one'),
                engagement('agt_ghost', 'run_two'),
                engagement('agt_juniper', 'run_three'),
                engagement('agt_cove', 'run_four'),
            ],
            agents
        )
    ).toEqual([
        { agentId: 'agt_cove', avatarUrl: '/cove.png', displayName: 'Cove' },
        { agentId: 'agt_juniper', avatarUrl: null, displayName: 'Juniper' },
    ]);
});

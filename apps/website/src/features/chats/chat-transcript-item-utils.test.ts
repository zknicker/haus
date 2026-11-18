import assert from 'node:assert/strict';
import test from 'node:test';
import { groupAgentItems } from './chat-transcript-item-utils.ts';
import type { TranscriptItem } from './chat-transcript-model.ts';

test('groupAgentItems keeps work segment keys stable when activity rows append', () => {
    const oneTool = groupAgentItems([toolItem('tool-1')]);
    const twoTools = groupAgentItems([toolItem('tool-1'), toolItem('tool-2')]);

    assert.equal(oneTool[0]?.kind, 'activity');
    assert.equal(twoTools[0]?.kind, 'activity');
    assert.equal(oneTool[0]?.key, 'activity:work:tool-1');
    assert.equal(twoTools[0]?.key, 'activity:work:tool-1');
});

test('groupAgentItems still separates thinking and work into distinct stable segments', () => {
    const segments = groupAgentItems([
        thinkingItem('thinking-1'),
        toolItem('tool-1'),
        thinkingItem('thinking-2'),
        toolItem('tool-2'),
    ]);

    assert.deepEqual(
        segments.map((segment) => segment.key),
        [
            'activity:thinking:thinking-1',
            'activity:work:tool-1',
            'activity:thinking:thinking-2',
            'activity:work:tool-2',
        ]
    );
});

function thinkingItem(id: string): TranscriptItem {
    return {
        kind: 'row',
        row: {
            id,
            kind: 'system',
            systemKind: 'thinking',
            thinking: {
                id,
                messageId: 'run-1',
                sender: 'tiny',
                text: 'I should inspect the current state.',
                timestamp: '2026-06-08T16:00:00.000Z',
            },
            timestamp: '2026-06-08T16:00:00.000Z',
        },
    };
}

function toolItem(id: string): TranscriptItem {
    return {
        kind: 'row',
        row: {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: null,
            connectsToNext: false,
            connectsToPrevious: false,
            id,
            isFirstInGroup: false,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-06-08T16:00:00.000Z',
            toolCall: {
                callId: id,
                facts: [],
                label: 'date',
                name: 'bash',
                status: 'running',
                summaryParts: ['date'],
            },
        },
    };
}

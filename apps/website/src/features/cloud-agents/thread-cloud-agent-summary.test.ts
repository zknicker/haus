import { expect, test } from 'bun:test';
import type { CloudAgentStatus, CloudAgentWork } from '@haus/api';
import {
    statusBreakdownText,
    summarizeThreadCloudAgentWork,
} from './thread-cloud-agent-summary.ts';

test('one work in a Thread keeps its own row', () => {
    const only = work('caw_one', 'completed');

    expect(summarizeThreadCloudAgentWork([only])).toEqual([
        { kind: 'single', provider: 'cursor', work: only },
    ]);
});

test('a fan-out collapses to one row with a live-first status breakdown', () => {
    const statuses: CloudAgentStatus[] = [
        'completed',
        'running',
        'running',
        'failed',
        'running',
        'running',
        'running',
        'running',
        'running',
    ];
    const [summary, ...rest] = summarizeThreadCloudAgentWork(
        statuses.map((status, index) => work(`caw_${index}`, status))
    );

    expect(rest).toEqual([]);
    expect(summary).toMatchObject({ count: 9, kind: 'group', provider: 'cursor' });
    if (summary?.kind !== 'group') {
        throw new Error('expected a group summary');
    }
    expect(statusBreakdownText(summary)).toBe('7 running · 1 done · 1 failed');
});

test('a pending cancellation counts as cancelling, not as its stored status', () => {
    const [summary] = summarizeThreadCloudAgentWork([
        work('caw_a', 'running'),
        { ...work('caw_b', 'running'), cancelRequestedAt: new Date().toISOString() },
    ]);

    if (summary?.kind !== 'group') {
        throw new Error('expected a group summary');
    }
    expect(statusBreakdownText(summary)).toBe('1 running · 1 cancelling');
});

test('no work, no rows', () => {
    expect(summarizeThreadCloudAgentWork([])).toEqual([]);
});

function work(id: string, status: CloudAgentStatus): CloudAgentWork {
    const at = new Date().toISOString();

    return {
        activity: null,
        agentId: 'agt_one',
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        chatId: 'cht_one',
        computerId: 'cmp_one',
        createdAt: at,
        id,
        messageId: `msg_${id}`,
        provider: 'cursor',
        providerAgentId: null,
        providerUrl: null,
        repository: 'haus/haus',
        runs: [],
        startedAt: null,
        startingRef: null,
        status,
        terminalAt: null,
        title: `Work ${id}`,
        updatedAt: at,
    };
}

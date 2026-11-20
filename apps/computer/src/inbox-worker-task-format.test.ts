import { expect, test } from 'bun:test';
import {
    type AgentInboxItem,
    type AgentWorkerAttention,
    composeInboxDrain,
    composeInboxNotice,
} from '@haus/agent-prompt';
import { agentInboxItemSchema } from '@haus/api';
import { parseInbox } from './agent-inbox-input.ts';

const workerId = 'wkr_1234567890abcdef';
const pullRequest = 'https://github.com/haus/haus/pull/12';
const stalled: AgentWorkerAttention = {
    branches: [{ branch: 'cloud/fix-flake', pullRequestUrl: pullRequest, repository: 'haus/haus' }],
    errorCode: null,
    notice: 'stall',
    place: { kind: 'cursor' },
    providerUrl: 'https://cursor.com/agents?id=bc_one',
    repository: 'haus/haus',
    stallCode: 'followup-auto-interrupt-failed',
    status: 'queued',
    summary: 'Last error: Agent already has an active run in progress.',
    title: 'Fix the flaky delivery test',
    turnId: 'wkt_1234567890abcdef',
    workerId,
};

test('a stall names the Worker, why it is stuck, and the three ways to act', () => {
    expect(composeInboxDrain([attentionItem(stalled)])).toContain(
        [
            `[worker stall · SEC-12 · Worker on cursor (${workerId}) · turn wkt_1234567890abcdef]`,
            'Fix the flaky delivery test — haus/haus',
            'Haus interrupted the hosted session to deliver a follow-up, and it still did not go through. Haus keeps retrying.',
            'Last error: Agent already has an active run in progress.',
            `Branches: haus/haus:cloud/fix-flake pr=${pullRequest}`,
            'Provider: https://cursor.com/agents?id=bc_one',
            `Nothing settled, so nothing was posted. Wait, stop it with haus worker stop --worker ${workerId}, or replace its waiting follow-up with haus worker send --worker ${workerId} --interrupt.`,
        ].join('\n')
    );
});

test('a Claude turn whose prompt cannot be found says so', () => {
    const drain = composeInboxDrain([
        attentionItem({
            ...stalled,
            place: { kind: 'claude' },
            stallCode: 'claude-prompt-not-found',
            summary: null,
        }),
    ]);
    expect(drain).toContain(
        "Claude's session log is too large to find this turn in it, so Haus cannot tell when it finishes."
    );
});

test.each([
    ['ready_for_review', 'is ready for review'],
    ['checks_passing', 'has its checks passing'],
    ['checks_failing', 'has failing checks'],
] as const)(
    'a %s pull request change says what changed, the URL, and the Task',
    (change, words) => {
        const drain = composeInboxDrain([
            attentionItem({
                ...stalled,
                notice: 'pull_request',
                pullRequestChange: { change, url: pullRequest },
                stallCode: null,
                status: 'completed',
            }),
        ]);
        expect(drain).toContain(
            [
                `[pull request · SEC-12 · ${words} · Worker on cursor (${workerId})]`,
                `The pull request from Fix the flaky delivery test ${words} after the Worker's turn settled: ${pullRequest}`,
                'Post what you learn in the Task: haus message send --target task:SEC-12',
            ].join('\n')
        );
    }
);

test('a pull request change without a named change still gives the URL from its branch', () => {
    const drain = composeInboxDrain([
        attentionItem({ ...stalled, notice: 'pull_request', stallCode: null, status: 'completed' }),
    ]);
    expect(drain).toContain(
        `The pull request from Fix the flaky delivery test changed after the Worker's turn settled: ${pullRequest}`
    );
});

test('a Worker attention counts as pending work on its Task and never shows its body in a notice', () => {
    const notice = composeInboxNotice([attentionItem(stalled)]);
    expect(notice).toContain('task:SEC-12  pending: 1 work item');
    expect(notice).toContain('msg=-');
    expect(notice).toContain('· task · Worker result');
    expect(notice).not.toContain('Agent already has an active run');
});

test('the stall the Server contract accepts parses with its place', () => {
    const item = attentionItem(stalled);
    expect(agentInboxItemSchema.safeParse(item).success).toBe(true);
    expect(parseInbox([item])?.[0]?.worker?.place).toEqual({ kind: 'cursor' });
});

test('a message in a Task conversation carries its Task target, tagged as a Task', () => {
    const message = messageItem({ chatId: 'cht_task', target: 'task:SEC-12' });
    expect(composeInboxDrain([message])).toContain('[target=task:SEC-12 msg=');
    const notice = composeInboxNotice([message]);
    expect(notice).toContain('task:SEC-12  pending: 1 message');
    expect(notice).toContain('· task');
});

function attentionItem(worker: AgentWorkerAttention): AgentInboxItem {
    return messageItem({
        chatId: 'cht_task',
        content: '',
        id: 'wkt_1234567890abcdef:stall:1',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: 'task:SEC-12',
        worker,
    });
}

function messageItem(overrides: Partial<AgentInboxItem> = {}): AgentInboxItem {
    return {
        chatId: 'cht_general',
        content: 'Ship it',
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'msg_first',
        senderHandle: 'zach',
        senderType: 'human',
        sequence: 1,
        target: '#general',
        ...overrides,
    };
}

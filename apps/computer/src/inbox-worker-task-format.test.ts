import { expect, test } from 'bun:test';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';

const taskWork = {
    branches: [
        {
            branch: 'cloud/fix-flake',
            pullRequestUrl: 'https://github.com/haus/haus/pull/12',
            repository: 'haus/haus',
        },
    ],
    errorCode: null,
    notice: 'settled' as const,
    provider: 'cursor' as const,
    providerUrl: 'https://cursor.com/agents/bc_one',
    repository: 'haus/haus',
    runId: 'car_1234567890abcdef',
    stallCode: null,
    status: 'completed' as const,
    summary: 'Opened a pull request.',
    title: 'Fix the flaky delivery test',
    workId: 'caw_1234567890abcdef',
};

function taskAttention(work: AgentInboxItem['worker']): AgentInboxItem {
    return item({
        chatId: 'cht_task',
        worker: work,
        content: '',
        id: 'car_1234567890abcdef',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: 'task:SEC-12',
    });
}

test('a settled Run on a Task names the Task and where to report', () => {
    const attention = taskAttention(taskWork);
    const drain = composeInboxDrain([attention]);
    expect(drain).toContain(
        '[Haus Worker attention status=completed work=caw_1234567890abcdef run=car_1234567890abcdef target=task:SEC-12]'
    );
    expect(drain).toContain(
        'This work is for Task SEC-12. Report what you learn in the Task: haus message send --target task:SEC-12'
    );
    expect(composeInboxNotice([attention])).toContain('task:SEC-12  pending: 1 work item');
    expect(composeInboxNotice([attention])).toContain('· task · Worker result');
});

test.each([
    ['ready_for_review', 'Its pull request is ready for review after the run settled'],
    ['checks_passing', 'Its pull request has its checks passing after the run settled'],
    ['checks_failing', 'Its pull request has failing checks after the run settled'],
] as const)('a %s pull request notice says what changed, the URL, and the Task', (change, line) => {
    const drain = composeInboxDrain([
        taskAttention({
            ...taskWork,
            notice: 'pull_request',
            pullRequestChange: { change, url: 'https://github.com/haus/haus/pull/12' },
        }),
    ]);
    expect(drain).toContain('[Haus Worker attention notice=pull_request status=completed');
    expect(drain).toContain(`${line}: https://github.com/haus/haus/pull/12`);
    expect(drain).toContain('This work is for Task SEC-12.');
});

test('a pull request notice without a named change still gives the URL from its branch', () => {
    const drain = composeInboxDrain([taskAttention({ ...taskWork, notice: 'pull_request' })]);
    expect(drain).toContain(
        'Its pull request changed after the run settled: https://github.com/haus/haus/pull/12'
    );
});

test('a message in a Task conversation carries its Task target, tagged as a Task', () => {
    const message = item({ chatId: 'cht_task', target: 'task:SEC-12' });
    expect(composeInboxDrain([message])).toContain('[target=task:SEC-12 msg=');
    const notice = composeInboxNotice([message]);
    expect(notice).toContain('task:SEC-12  pending: 1 message');
    expect(notice).toContain('· task');
    expect(notice).not.toContain('· thread');
});

test('a settled Run outside a Task names no Task', () => {
    expect(
        composeInboxDrain(
            [taskAttention(taskWork)].map((entry) => ({ ...entry, target: '#general' }))
        )
    ).not.toContain('This work is for Task');
});

function item(overrides: Partial<AgentInboxItem> = {}): AgentInboxItem {
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

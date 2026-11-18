import { expect, test } from 'bun:test';

import { AgentCliError } from '../agent-error.ts';
import { runTaskAssign, runTaskUpdate } from './agent-task-actions.ts';
import {
    runTaskAttachPullRequest,
    runTaskStart,
    runTaskState,
} from './agent-task-place-actions.ts';
import { args, harness, task } from './agent-task-test-fixtures.ts';

const startArgs = {
    '--from': 'msg_1a2b3c4d5e6f',
    '--target': '#security',
    '--title': 'Rotate the signing key',
};

test('start sends the origin message and names where the Task lives', async () => {
    const { calls, lines, run } = harness(() => ({ target: 'task:SEC-12', task }));

    await run(
        runTaskStart,
        args({ values: { ...startArgs, '--assignee': '@kit', '--description': '-' } })
    );

    expect(calls[0]?.route).toBe('/api/agent/tasks/start');
    expect(calls[0]?.input?.body).toEqual({
        assignee: '@kit',
        description: 'From stdin',
        dueOn: undefined,
        from: 'msg_1a2b3c4d5e6f',
        priority: undefined,
        state: undefined,
        target: '#security',
        title: 'Rotate the signing key',
    });
    expect(lines.join('')).toBe(
        [
            'Started SEC-12 [open] "Rotate the signing key" · priority high · assigned @kit',
            'Task target: task:SEC-12',
            'Started from message 1a2b3c4d in #security; its author and anyone it mentions follow the Task.',
            '',
        ].join('\n')
    );
});

test('start refuses a DM origin before asking the Server, and says where to post instead', async () => {
    const { calls, run } = harness(() => ({ target: 'task:SEC-12', task }));
    const refusal = run(runTaskStart, args({ values: { ...startArgs, '--target': 'dm:@zero' } }));
    await expect(refusal).rejects.toMatchObject({ code: 'TASK_ORIGIN_DM' });
    await expect(refusal).rejects.toMatchObject({
        options: { nextAction: expect.stringContaining('in the channel where the work belongs') },
    });
    expect(calls).toHaveLength(0);
});

test('a Server TASK_ORIGIN_DM refusal gains the same next step', async () => {
    const { run } = harness(() => {
        throw new AgentCliError('TASK_ORIGIN_DM', 'That message is in a DM.');
    });
    await expect(run(runTaskStart, args({ values: startArgs }))).rejects.toMatchObject({
        code: 'TASK_ORIGIN_DM',
        options: { nextAction: expect.stringContaining('mentioning whoever asked') },
    });
});

test('start needs a channel, an origin, and a title, and starts only todo or open', async () => {
    const { calls, run } = harness(() => ({ target: 'task:SEC-12', task }));
    await expect(
        run(runTaskStart, args({ values: { ...startArgs, '--from': '' } }))
    ).rejects.toThrow('--from is required.');
    await expect(
        run(runTaskStart, args({ values: { ...startArgs, '--title': '' } }))
    ).rejects.toThrow('--title is required.');
    await expect(
        run(runTaskStart, args({ values: { ...startArgs, '--state': 'done' } }))
    ).rejects.toThrow('A Task starts todo or open.');
    expect(calls).toHaveLength(0);
});

test.each([
    [
        'done',
        'SEC-12 is done. It leaves the sidebar and its pending reminders are canceled; a post in it reopens it.\n',
    ],
    ['open', 'SEC-12 is open. It shows in the sidebar with its state.\n'],
    ['todo', 'SEC-12 is todo. Todo Tasks are not listed in the sidebar.\n'],
] as const)('state %s says what it means for the Task', async (state, expected) => {
    const { calls, lines, run } = harness(() => ({ task: { ...task, state } }));
    await run(runTaskState, args({ positionals: ['task:SEC-12', state] }));
    expect(calls[0]?.input?.body).toEqual({ expectedVersion: undefined, key: 'SEC-12', state });
    expect(lines.join('')).toBe(expected);
});

test('state refuses an unknown state and a bad key before asking the Server', async () => {
    const { calls, run } = harness(() => ({ task }));
    await expect(run(runTaskState, args({ positionals: ['SEC-12', 'finished'] }))).rejects.toThrow(
        'Give the new state'
    );
    await expect(run(runTaskState, args({ positionals: ['sec', 'done'] }))).rejects.toThrow(
        'needs a Task key like SEC-12'
    );
    expect(calls).toHaveLength(0);
});

test('attach-pr attaches the pull request and names the Task target', async () => {
    const url = 'https://github.com/haus/haus/pull/12';
    const { calls, lines, run } = harness(() => ({
        pullRequest: { number: 12, repository: 'haus/haus', url },
        task,
    }));
    await run(runTaskAttachPullRequest, args({ positionals: ['SEC-12', url] }));
    expect(calls[0]?.input?.body).toEqual({ key: 'SEC-12', url });
    expect(lines.join('')).toBe(
        'Attached haus/haus#12 to SEC-12. When it becomes ready for review or its checks finish, Haus wakes you on the Task.\nTask target: task:SEC-12\n'
    );
});

test('update sends only what changed and clears with none', async () => {
    const { calls, lines, run } = harness(() => ({ task }));

    await run(
        runTaskUpdate,
        args({
            positionals: ['SEC-12'],
            values: { '--due': 'none', '--labels': 'none', '--priority': 'urgent' },
        })
    );

    expect(calls[0]?.input?.body).toEqual({
        description: undefined,
        dueOn: null,
        expectedVersion: undefined,
        key: 'SEC-12',
        labels: [],
        priority: 'urgent',
        title: undefined,
    });
    expect(lines.join('')).toStartWith('Updated SEC-12 [open]');
});

test('update refuses a call that changes nothing', async () => {
    const { calls, run } = harness(() => ({ task }));
    await expect(run(runTaskUpdate, args({ positionals: ['SEC-12'] }))).rejects.toThrow(
        'Provide at least one of'
    );
    expect(calls).toHaveLength(0);
});

test('assign takes a handle or me, and none unassigns', async () => {
    const { calls, lines, run } = harness((_route, input) => ({
        task: {
            ...task,
            assignee:
                (input?.body as { assignee: string | null }).assignee === null
                    ? null
                    : { handle: 'kit', type: 'agent' },
        },
    }));

    await run(runTaskAssign, args({ positionals: ['SEC-12', '@kit'] }));
    await run(runTaskAssign, args({ positionals: ['SEC-12', 'me'] }));
    await run(runTaskAssign, args({ positionals: ['SEC-12', 'none'] }));

    expect(calls.map((call) => (call.input?.body as { assignee: unknown }).assignee)).toEqual([
        '@kit',
        'me',
        null,
    ]);
    expect(lines).toEqual([
        'Assigned SEC-12 to @kit.\n',
        'Assigned SEC-12 to @kit.\n',
        'Unassigned SEC-12.\n',
    ]);
});

test('a refusal from the Server reaches the caller untouched', async () => {
    const { run } = harness(() => {
        throw new AgentCliError('TASK_NOT_FOUND', 'No Task SEC-12 on this Server.');
    });
    await expect(
        run(runTaskState, args({ positionals: ['SEC-12', 'done'] }))
    ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
});

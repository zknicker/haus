import { expect, test } from 'bun:test';
import { AgentCliError } from '../agent-error.ts';
import { runTaskArchive } from './agent-task-actions.ts';
import { runTaskAttachPullRequest, runTaskStart } from './agent-task-place-actions.ts';
import { args, harness, task } from './agent-task-test-fixtures.ts';

const startArgs = {
    '--from': 'msg_1a2b3c4d5e6f',
    '--target': '#security',
    '--title': 'Rotate the signing key',
};

test('start sends the origin message and names where the Task lives', async () => {
    const { calls, lines, run } = harness(() => ({ target: 'task:k3mq7xta', task }));

    await run(runTaskStart, args({ values: { ...startArgs, '--description': '-' } }));

    expect(calls[0]?.route).toBe('/api/agent/tasks/start');
    expect(calls[0]?.input?.body).toEqual({
        description: 'From stdin',
        from: 'msg_1a2b3c4d5e6f',
        project: undefined,
        target: '#security',
        title: 'Rotate the signing key',
    });
    expect(lines.join('')).toBe(
        [
            'Started k3mq7xta "Rotate the signing key" · started by @kit',
            'Task target: task:k3mq7xta',
            'Started from message 1a2b3c4d in #security; you, its author and anyone it mentions follow the Task.',
            '',
        ].join('\n')
    );
});

test('start sends a DM origin with the Project it names', async () => {
    const { calls, lines, run } = harness(() => ({ target: 'task:k3mq7xta', task }));

    await run(
        runTaskStart,
        args({ values: { ...startArgs, '--project': 'SEC', '--target': 'dm:@zero' } })
    );

    expect(calls[0]?.input?.body).toMatchObject({
        from: 'msg_1a2b3c4d5e6f',
        project: 'SEC',
        target: 'dm:@zero',
    });
    expect(lines.join('')).toContain('Started from message 1a2b3c4d in dm:@zero;');
});

test('start refuses an origin inside a Task before asking the Server', async () => {
    const { calls, run } = harness(() => ({ target: 'task:k3mq7xta', task }));
    const refusal = run(
        runTaskStart,
        args({ values: { ...startArgs, '--target': 'task:h4tq9z2b' } })
    );
    await expect(refusal).rejects.toMatchObject({
        code: 'INVALID_ARG',
        options: {
            nextAction: 'Start it from the message in the channel or DM that asked for the work.',
        },
    });
    expect(calls).toHaveLength(0);
});

test('start needs an origin and a title', async () => {
    const { calls, run } = harness(() => ({ target: 'task:k3mq7xta', task }));
    await expect(
        run(runTaskStart, args({ values: { ...startArgs, '--from': '' } }))
    ).rejects.toThrow('--from is required.');
    await expect(
        run(runTaskStart, args({ values: { ...startArgs, '--title': '' } }))
    ).rejects.toThrow('--title is required.');
    expect(calls).toHaveLength(0);
});

test('archive takes a short id, a task: target, or a full id', async () => {
    const archivedAt = '2026-11-05T09:00:00.000Z';
    const { calls, lines, run } = harness(() => ({ task: { ...task, archivedAt } }));
    await run(runTaskArchive, args({ positionals: ['task:k3mq7xta'] }));
    await run(runTaskArchive, args({ positionals: ['tsk_12'] }));
    expect(calls.map((call) => call.input?.body)).toEqual([
        { expectedVersion: undefined, task: 'k3mq7xta' },
        { expectedVersion: undefined, task: 'tsk_12' },
    ]);
    expect(lines[0]).toBe(
        'k3mq7xta is archived. It leaves the sidebar and its pending reminders are canceled.\n'
    );
});

test('archive refuses an Issue code before asking the Server', async () => {
    const { calls, run } = harness(() => ({ task }));
    await expect(run(runTaskArchive, args({ positionals: ['SEC-12'] }))).rejects.toThrow(
        'needs a Task short id like k3mq7xta'
    );
    expect(calls).toHaveLength(0);
});

test('attach-pr attaches the pull request and names the Task target', async () => {
    const url = 'https://github.com/haus/haus/pull/12';
    const { calls, lines, run } = harness(() => ({
        pullRequest: { number: 12, repository: 'haus/haus', url },
        task,
    }));
    await run(runTaskAttachPullRequest, args({ positionals: ['k3mq7xta', url] }));
    expect(calls[0]?.input?.body).toEqual({ task: 'k3mq7xta', url });
    expect(lines.join('')).toBe(
        'Attached haus/haus#12 to k3mq7xta. When it becomes ready for review or its checks finish, Haus wakes you on the Task.\nTask target: task:k3mq7xta\n'
    );
});

test('a refusal from the Server reaches the caller untouched', async () => {
    const { run } = harness(() => {
        throw new AgentCliError('TASK_NOT_FOUND', 'No task is k3mq7xta.');
    });
    await expect(run(runTaskArchive, args({ positionals: ['k3mq7xta'] }))).rejects.toMatchObject({
        code: 'TASK_NOT_FOUND',
    });
});

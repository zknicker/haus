import { expect, test } from 'bun:test';
import { AgentCliError } from '../agent-error.ts';
import { runTaskArchive } from './agent-task-actions.ts';
import { runTaskAttachPullRequest, runTaskStart } from './agent-task-place-actions.ts';
import { args, harness, task } from './agent-task-test-fixtures.ts';

const startArgs = {
    '--from': 'msg_1a2b3c4d5e6f',
    '--issue': 'SEC-12',
    '--target': '#security',
    '--title': 'Rotate the signing key',
};

const started = { state: 'started', target: 'task:k3mq7xta', task };

test('start sends the brief from stdin and says who sees the Task, never that its work began', async () => {
    const { calls, lines, run } = harness(() => started);

    await run(runTaskStart, args({ values: { ...startArgs, '--request-id': 'req-1' } }));

    expect(calls[0]?.route).toBe('/api/agent/tasks/start');
    expect(calls[0]?.input?.body).toEqual({
        brief: 'From stdin',
        from: 'msg_1a2b3c4d5e6f',
        issue: 'SEC-12',
        machine: undefined,
        model: undefined,
        requestId: 'req-1',
        target: '#security',
        title: 'Rotate the signing key',
    });
    expect(lines.join('')).toBe(
        [
            'k3mq7xta "Rotate the signing key" · started by @kit',
            'Its brief is its first message, and it is starting on it. Task target: task:k3mq7xta',
            "It shows under message 1a2b3c4d in #security with its state and newest messages, and that message's author follows it.",
            'SEC-12 is assigned to it, in the state it had.',
            'Your Captain panel lists it under Crew.',
            'You hear when each of its turns ends; its chat holds what it did.',
            '',
        ].join('\n')
    );
});

test('a held start shows the newer messages and records nothing', async () => {
    const { lines, run } = harness(() => ({
        formalMentionCount: 0,
        newMessageCount: 1,
        omittedMessageCount: 0,
        shownMessages: [],
        state: 'held',
    }));

    await run(runTaskStart, args({ values: { '--target': '#security' } }));

    expect(lines.join('')).toContain('The Task was not started: nothing was recorded.');
});

test('start needs the chat of its origin message before asking the Server', async () => {
    const { calls, run } = harness(() => started);
    await expect(
        run(runTaskStart, args({ values: { '--from': 'msg_1a2b3c4d5e6f' } }))
    ).rejects.toThrow('--from needs the chat it is in as --target.');
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
        'k3mq7xta is archived. Its session is freed, it leaves the sidebar, and its pending reminders are canceled.\n'
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
        'Attached haus/haus#12 to k3mq7xta. When it becomes ready for review or its checks finish, Haus wakes the Task.\nTask target: task:k3mq7xta\n'
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

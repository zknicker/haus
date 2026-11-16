import { expect, test } from 'bun:test';
import { AgentCliError } from '../agent-error.ts';
import { runTaskAssign, runTaskCreate, runTaskMove, runTaskUpdate } from './agent-task-actions.ts';
import { args, harness, task } from './agent-task-test-fixtures.ts';

const done = { ...task, category: 'done' as const, column: 'Done' };

test('create sends the Task and restates it, with the description from stdin on -', async () => {
    const { calls, lines, run } = harness(() => ({ task }));

    await run(
        runTaskCreate,
        args({
            values: {
                '--assignee': '@kit',
                '--board': 'SEC',
                '--column': 'Todo',
                '--description': '-',
                '--due': '2026-11-20',
                '--labels': 'Security, Infra',
                '--priority': 'high',
                '--title': 'Rotate the signing key',
            },
        })
    );

    expect(calls[0]?.route).toBe('/api/agent/tasks/create');
    expect(calls[0]?.input?.body).toEqual({
        assignee: '@kit',
        board: 'SEC',
        column: 'Todo',
        description: 'From stdin',
        dueOn: '2026-11-20',
        labels: ['Security', 'Infra'],
        priority: 'high',
        title: 'Rotate the signing key',
    });
    expect(lines.join('')).toBe(
        'Created SEC-12 [todo: Todo] "Rotate the signing key" · priority high · assigned @kit\n'
    );
});

test('create needs a board and a title', async () => {
    const { calls, run } = harness(() => ({ task }));
    await expect(run(runTaskCreate, args({ values: { '--title': 'No board' } }))).rejects.toThrow(
        '--board is required.'
    );
    await expect(run(runTaskCreate, args({ values: { '--board': 'SEC' } }))).rejects.toThrow(
        '--title is required.'
    );
    expect(calls).toHaveLength(0);
});

test('a move into an open column prints no queue', async () => {
    const { calls, lines, run } = harness(() => ({
        queue: { active: 1, todo: 3 },
        task: { ...task, category: 'active', column: 'In progress' },
    }));

    await run(
        runTaskMove,
        args({
            positionals: ['SEC-12'],
            values: { '--column': 'In progress', '--expected-version': '3' },
        })
    );

    expect(calls[0]?.input?.body).toEqual({
        column: 'In progress',
        expectedVersion: 3,
        key: 'SEC-12',
    });
    expect(lines.join('')).toBe('Moved SEC-12 to In progress [active].\n');
});

test.each([
    [{ active: 0, todo: 3 }, '3 more assigned to you in todo\n'],
    [{ active: 2, todo: 0 }, '2 more assigned to you in active\n'],
    [{ active: 1, todo: 3 }, '4 more assigned to you: 3 in todo, 1 in active\n'],
    [{ active: 0, todo: 0 }, ''],
])('a move into done names what is still waiting: %o', async (queue, expected) => {
    const { lines, run } = harness(() => ({ queue, task: done }));
    await run(runTaskMove, args({ positionals: ['SEC-12'], values: { '--column': 'Done' } }));
    expect(lines.join('')).toBe(`Moved SEC-12 to Done [done].\n${expected}`);
});

test('a move into a canceled column counts as closing it too', async () => {
    const { lines, run } = harness(() => ({
        queue: { active: 0, todo: 1 },
        task: { ...task, category: 'canceled', column: 'Canceled' },
    }));
    await run(runTaskMove, args({ positionals: ['SEC-12'], values: { '--column': 'Canceled' } }));
    expect(lines.join('')).toBe(
        'Moved SEC-12 to Canceled [canceled].\n1 more assigned to you in todo\n'
    );
});

test('move needs a column and a valid expected version', async () => {
    const { calls, run } = harness(() => ({ queue: { active: 0, todo: 0 }, task }));
    await expect(run(runTaskMove, args({ positionals: ['SEC-12'] }))).rejects.toThrow(
        '--column is required.'
    );
    await expect(
        run(
            runTaskMove,
            args({
                positionals: ['SEC-12'],
                values: { '--column': 'Done', '--expected-version': '0' },
            })
        )
    ).rejects.toMatchObject({ code: 'INVALID_ARG' });
    expect(calls).toHaveLength(0);
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
    expect(lines.join('')).toStartWith('Updated SEC-12 [todo: Todo]');
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
        throw new AgentCliError(
            'REGULAR_TURN_REQUIRED',
            'Tasks and boards are read-only in a heartbeat run. Report what you found with haus heartbeat report.'
        );
    });
    await expect(
        run(runTaskMove, args({ positionals: ['SEC-12'], values: { '--column': 'Done' } }))
    ).rejects.toMatchObject({ code: 'REGULAR_TURN_REQUIRED' });
});

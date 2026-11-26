import { expect, test } from 'bun:test';
import { runTaskList, runTaskShow } from './agent-task-actions.ts';
import { args, harness, task } from './agent-task-test-fixtures.ts';

test('list asks for the active Tasks the caller started by default', async () => {
    const { calls, lines, run } = harness(() => ({ omitted: 0, tasks: [task] }));

    await run(runTaskList, args());

    expect(calls[0]?.input?.query).toEqual({});
    expect(lines.join('')).toBe(
        '1 active Tasks you started, newest first:\n' +
            'k3mq7xta "Rotate the signing key" · started by @kit\n'
    );
});

test('list says so when nothing matches', async () => {
    const empty = harness(() => ({ omitted: 0, tasks: [] }));
    await empty.run(runTaskList, args());
    await empty.run(runTaskList, args({ flags: { '--all': true, '--archived': true } }));
    expect(empty.lines).toEqual(['No active Tasks you started.\n', 'No archived Tasks.\n']);
});

test('--all, --archived and --project widen or narrow the query', async () => {
    const { calls, run } = harness(() => ({ omitted: 0, tasks: [] }));

    await run(runTaskList, args({ flags: { '--all': true } }));
    await run(runTaskList, args({ flags: { '--archived': true } }));
    await run(runTaskList, args({ flags: { '--all': true }, values: { '--project': 'SEC' } }));

    expect(calls.map((call) => call.input?.query)).toEqual([
        { all: 'true' },
        { archived: 'true' },
        { all: 'true', project: 'SEC' },
    ]);
});

test('list names the rows it left out', async () => {
    const { lines, run } = harness(() => ({ omitted: 7, tasks: [task] }));
    await run(runTaskList, args({ flags: { '--all': true } }));
    expect(lines.join('')).toContain('8 active Tasks, newest first:\n');
    expect(lines.join('')).toContain('Truncated: 7 more. Narrow with --project or --archived.\n');
});

test('show prints the Task target, description, mentions, and reminders', async () => {
    const { calls, lines, run } = harness(() => ({
        description: 'Rotate it.\nThen tell @zero.',
        mentions: [
            {
                author: 'zero',
                createdAt: '2026-11-04T09:05:00.000Z',
                excerpt: 'Please take the key rotation',
                messageId: 'msg_1a2b3c4d5e6f',
                target: '#security',
            },
        ],
        reminders: [
            {
                anchorTarget: 'task:k3mq7xta',
                id: 'rem_1',
                nextFireAt: '2026-11-06T09:00:00.000Z',
                repeat: null,
                title: 'Check the key',
            },
        ],
        task,
    }));

    await run(runTaskShow, args({ positionals: ['k3mq7xta'] }));

    expect(calls[0]?.input?.query).toEqual({ task: 'k3mq7xta' });
    expect(lines.join('')).toBe(
        [
            'k3mq7xta "Rotate the signing key" · started by @kit',
            'Task target: task:k3mq7xta',
            'Created 2026-11-04 09:00:00 UTC; updated 2026-11-04 10:00:00 UTC; version 3',
            '',
            'Description:',
            'Rotate it.',
            '  │ Then tell @zero.',
            '',
            'Mentioned in (newest first):',
            '- [target=#security msg=1a2b3c4d time=2026-11-04 09:05:00 UTC] zero: Please take the key rotation',
            '',
            'Reminders:',
            '- rem_1 "Check the key" next fire 2026-11-06 09:00:00 UTC, anchored in task:k3mq7xta',
            '',
        ].join('\n')
    );
});

test('show leaves out empty sections', async () => {
    const { lines, run } = harness(() => ({ description: '', mentions: [], reminders: [], task }));
    await run(runTaskShow, args({ positionals: ['k3mq7xta'] }));
    expect(lines.join('')).not.toContain('Description:');
    expect(lines.join('')).not.toContain('Mentioned in');
});

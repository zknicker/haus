import { expect, test } from 'bun:test';
import { runTaskList, runTaskShow } from './agent-task-actions.ts';
import { args, harness, task } from './agent-task-test-fixtures.ts';

test('list sends the caller and the open categories by default, most urgent first', async () => {
    const { calls, lines, run } = harness(() => ({ omitted: 0, tasks: [task] }));

    await run(runTaskList, args());

    expect(calls[0]?.input?.query).toEqual({
        assignee: 'me',
        board: undefined,
        category: 'backlog,todo,active',
    });
    expect(lines.join('')).toBe(
        '1 Task assigned to you, by priority then age:\n' +
            'SEC-12 [todo: Todo] "Rotate the signing key" · priority high · assigned @kit\n'
    );
});

test('list says so when nothing is open, and when a wider filter finds nothing', async () => {
    const empty = harness(() => ({ omitted: 0, tasks: [] }));
    await empty.run(runTaskList, args());
    await empty.run(runTaskList, args({ flags: { '--all': true } }));
    expect(empty.lines).toEqual(['No open Tasks assigned to you.\n', 'No Tasks match.\n']);
});

test('--all and --board drop the assignee, --assignee names one, --category replaces open', async () => {
    const { calls, run } = harness(() => ({ omitted: 0, tasks: [] }));

    await run(runTaskList, args({ flags: { '--all': true } }));
    await run(runTaskList, args({ values: { '--board': 'SEC' } }));
    await run(runTaskList, args({ values: { '--assignee': 'zero', '--board': 'SEC' } }));
    await run(runTaskList, args({ values: { '--category': 'done,canceled' } }));

    expect(calls.map((call) => call.input?.query)).toEqual([
        { assignee: undefined, board: undefined, category: 'backlog,todo,active' },
        { assignee: undefined, board: 'SEC', category: 'backlog,todo,active' },
        { assignee: '@zero', board: 'SEC', category: 'backlog,todo,active' },
        { assignee: 'me', board: undefined, category: 'done,canceled' },
    ]);
});

test('list refuses a contradiction and an unknown category before asking the Server', async () => {
    const { calls, run } = harness(() => ({ omitted: 0, tasks: [] }));

    await expect(
        run(runTaskList, args({ flags: { '--all': true }, values: { '--assignee': 'me' } }))
    ).rejects.toMatchObject({ code: 'INVALID_ARG' });
    await expect(
        run(runTaskList, args({ values: { '--category': 'todo,finished' } }))
    ).rejects.toThrow('Unknown category finished.');
    expect(calls).toHaveLength(0);
});

test('list names the rows it left out', async () => {
    const { lines, run } = harness(() => ({ omitted: 7, tasks: [task] }));
    await run(runTaskList, args());
    expect(lines.join('')).toContain('8 Tasks assigned to you, by priority then age:\n');
    expect(lines.join('')).toContain(
        'Truncated: 7 more. Narrow with --board, --assignee, or --category.\n'
    );
});

test('show prints the columns, description, mentions, and reminders', async () => {
    const { calls, lines, run } = harness((route) =>
        route === '/api/agent/boards'
            ? {
                  boards: [
                      {
                          columns: [
                              { category: 'todo', id: 'col_todo', name: 'Todo', position: 0 },
                              { category: 'active', id: 'col_go', name: 'Doing', position: 1 },
                          ],
                          id: 'brd_1',
                          key: 'SEC',
                          name: 'Security',
                          openTaskCount: 1,
                          version: 1,
                      },
                  ],
              }
            : {
                  description: 'Rotate it.\nThen tell @zero.',
                  mentions: [
                      {
                          author: 'zero',
                          createdAt: '2026-11-04T09:05:00.000Z',
                          excerpt: 'Please take SEC-12',
                          messageId: 'msg_1a2b3c4d5e6f',
                          target: '#security',
                      },
                  ],
                  reminders: [
                      {
                          anchorTarget: '#security:1a2b3c4d',
                          id: 'rem_1',
                          nextFireAt: '2026-11-06T09:00:00.000Z',
                          repeat: null,
                          title: 'Check SEC-12',
                      },
                  ],
                  task,
              }
    );

    await run(runTaskShow, args({ positionals: ['SEC-12'] }));

    expect(calls[0]?.input?.query).toEqual({ key: 'SEC-12' });
    expect(lines.join('')).toBe(
        [
            'SEC-12 [todo: Todo] "Rotate the signing key" · priority high · assigned @kit',
            'Columns on SEC: Todo (todo), Doing (active)',
            'Created by @zero 2026-11-04 09:00:00 UTC; updated 2026-11-04 10:00:00 UTC; version 3',
            '',
            'Description:',
            'Rotate it.',
            '  │ Then tell @zero.',
            '',
            'Mentioned in (newest first):',
            '- [target=#security msg=1a2b3c4d time=2026-11-04 09:05:00 UTC] zero: Please take SEC-12',
            '',
            'Reminders:',
            '- rem_1 "Check SEC-12" next fire 2026-11-06 09:00:00 UTC, anchored in #security:1a2b3c4d',
            '',
        ].join('\n')
    );
});

test('show leaves out the column line for an archived board and empty sections', async () => {
    const { lines, run } = harness((route) =>
        route === '/api/agent/boards'
            ? { boards: [] }
            : { description: '', mentions: [], reminders: [], task }
    );
    await run(runTaskShow, args({ positionals: ['SEC-12'] }));
    expect(lines.join('')).not.toContain('Columns on');
    expect(lines.join('')).not.toContain('Description:');
    expect(lines.join('')).not.toContain('Mentioned in');
});

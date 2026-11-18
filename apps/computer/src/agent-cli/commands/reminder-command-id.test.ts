import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { runReminderSchedule } from './agent-reminder.ts';
import { scheduleCommandId } from './reminder-command-id.ts';

const values = {
    '--command-id': 'cove-review-consent-1',
    '--fire-at': '2027-01-01T09:00:00.000Z',
    '--message-id': 'abcdef12',
    '--repeat': 'every:1d',
    '--title': 'Quiet agreed team review',
};
const args = { flags: {}, help: false, positionals: [], values };

test('separate CLI invocations send the identical persisted schedule command', async () => {
    const bodies: unknown[] = [];
    const deps = {
        client: {
            request<T>(_route: string, schema: z.ZodType<T>, input?: AgentApiRequest): Promise<T> {
                bodies.push(input?.body);
                return Promise.resolve(
                    schema.parse({
                        reminder: {
                            anchorTarget: '#product',
                            fireAt: values['--fire-at'],
                            id: 'rem_fixture',
                            repeat: 'every:1d',
                            script: false,
                            status: 'scheduled',
                            title: values['--title'],
                            version: 1,
                        },
                    })
                );
            },
        },
        write: () => undefined,
    };
    await runReminderSchedule(args, deps);
    await runReminderSchedule(args, deps);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({
        commandId: values['--command-id'],
        fireAt: values['--fire-at'],
    });
});

test('stable keys reject relative fire times and empty or unbounded ids', () => {
    const invalidInputs: Record<string, string>[] = [
        { '--command-id': 'same', '--delay-seconds': '600' },
        { '--command-id': '', '--fire-at': values['--fire-at'] },
        { '--command-id': 'x'.repeat(129), '--fire-at': values['--fire-at'] },
    ];
    for (const invalid of invalidInputs) {
        expect(() => scheduleCommandId({ ...args, values: invalid })).toThrow();
    }
});

test('a calendar repeat keeps a retry-stable command id without a saved first fire', () => {
    const { '--fire-at': _derived, ...calendar } = values;
    expect(scheduleCommandId({ ...args, values: { ...calendar, '--repeat': 'daily@09:00' } })).toBe(
        'cove-review-consent-1'
    );
    expect(() => scheduleCommandId({ ...args, values: calendar })).toThrow('--fire-at');
});

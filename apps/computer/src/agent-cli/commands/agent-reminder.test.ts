import { describe, expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    runReminderCancel,
    runReminderList,
    runReminderSchedule,
    runReminderSnooze,
    runReminderUpdate,
} from './agent-reminder.ts';

const reminder = {
    anchorTarget: '#general:deadbeef',
    description: null,
    fireAt: '2026-07-30T16:00:00.000Z',
    id: 'rem_test',
    repeat: null,
    script: false,
    status: 'scheduled',
    title: 'Check the draft',
    version: 7,
};

describe('Agent reminder CLI', () => {
    test('does not confirm an update whose receipt lost its stored timezone', async () => {
        const lines: string[] = [];
        const client = requester((route) =>
            route === '/api/agent/reminders'
                ? { reminders: [{ ...reminder, timezone: 'UTC' }] }
                : { reminder }
        );
        const result = runReminderUpdate(
            args({
                '--id': reminder.id,
                '--repeat': 'daily@09:00',
                '--timezone': 'UTC',
            }),
            { client, write: (line) => lines.push(line) }
        );
        await expect(result).rejects.toMatchObject({ code: 'REMINDER_RECEIPT_UNCONFIRMED' });
        expect(lines).toHaveLength(0);
    });

    test('refuses a calendar update in a different zone before any mutation', async () => {
        const routes: string[] = [];
        const client = requester((route) => {
            routes.push(route);
            return { reminders: [{ ...reminder, timezone: 'UTC' }] };
        });
        await expect(
            runReminderUpdate(
                args({
                    '--id': reminder.id,
                    '--repeat': 'weekly:fri@09:00',
                    '--timezone': 'America/New_York',
                }),
                { client, write: () => undefined }
            )
        ).rejects.toThrow('stored timezone');
        expect(routes).toEqual(['/api/agent/reminders']);
    });

    test('verifies schedule timezone before printing success and labels the first instant', async () => {
        for (const timezone of [undefined, 'UTC', 'America/New_York']) {
            const lines: string[] = [];
            const client = requester((route, input) => {
                if (route.endsWith('/schedule')) {
                    expect(input.body).toHaveProperty('timezone', 'America/New_York');
                }
                return route.endsWith('/capabilities')
                    ? { supportsReminderTimezone: true }
                    : { reminder: { ...reminder, repeat: 'weekly:fri@09:00', timezone } };
            });
            const result = runReminderSchedule(
                args({
                    '--delay-seconds': '120',
                    '--message-id': 'deadbeef',
                    '--repeat': 'weekly:fri@09:00',
                    '--timezone': 'America/New_York',
                    '--title': reminder.title,
                }),
                { client, write: (line) => lines.push(line) }
            );
            if (timezone === 'America/New_York') {
                await result;
                expect(lines.join('')).toContain(
                    `fires ${reminder.fireAt} repeats weekly:fri@09:00 in America/New_York`
                );
            } else {
                await expect(result).rejects.toThrow('receipt');
                expect(lines).toHaveLength(0);
            }
        }
    });

    test('retries a schedule with the same idempotency key', async () => {
        const requests: AgentApiRequest[] = [];
        let attempts = 0;
        const client = requester((route, input) => {
            expect(route).toBe('/api/agent/reminders/schedule');
            requests.push(input);
            attempts++;
            if (attempts === 1) {
                throw new AgentCliError('SERVER_5XX', 'retry');
            }
            return { reminder };
        });

        await runReminderSchedule(
            args({
                '--delay-seconds': '120',
                '--message-id': 'deadbeef',
                '--title': 'Check the draft',
            }),
            { client, write: () => undefined }
        );

        expect(requests).toHaveLength(2);
        expect(requests[0]).toEqual(requests[1]);
        expect(requests[0]?.body).toMatchObject({
            commandId: expect.stringMatching(/^cli-/u),
            fireAt: expect.stringMatching(/Z$/u),
            messageId: 'deadbeef',
            title: 'Check the draft',
        });
        expect(requests[0]?.body).not.toHaveProperty('delaySeconds');
    });

    test('sends the description beside the short title and prints both', async () => {
        const requests: AgentApiRequest[] = [];
        const lines: string[] = [];
        const labeled = {
            ...reminder,
            description: 'Check advertising and flag campaigns that need bid adjustments',
            title: 'Monday Advertising Review',
        };
        const client = requester((_route, input) => {
            requests.push(input);
            return { reminder: labeled };
        });

        await runReminderSchedule(
            args({
                '--delay-seconds': '120',
                '--description': labeled.description,
                '--message-id': 'deadbeef',
                '--title': labeled.title,
            }),
            { client, write: (text) => lines.push(text) }
        );

        expect(requests[0]?.body).toMatchObject({
            description: labeled.description,
            title: 'Monday Advertising Review',
        });
        expect(lines.join('')).toContain(
            '"Monday Advertising Review" — Check advertising and flag campaigns that need bid adjustments — fires'
        );
    });

    test('still reads reminders from a Server that predates descriptions', async () => {
        const { description: _omitted, ...legacy } = reminder;
        const lines: string[] = [];
        const client = requester(() => ({ reminders: [legacy] }));

        await runReminderList(args({}), { client, write: (text) => lines.push(text) });

        expect(lines.join('')).toContain('rem_test [scheduled] "Check the draft" — fires');
    });

    test('updates the title and description together, but nothing else alongside', async () => {
        const mutations: AgentApiRequest[] = [];
        const client = requester((route, input) => {
            if (route === '/api/agent/reminders') {
                return { reminders: [reminder] };
            }
            mutations.push(input);
            return { reminder };
        });
        const deps = { client, write: () => undefined };

        await runReminderUpdate(
            args({ '--description': 'none', '--id': reminder.id, '--title': 'Draft Check' }),
            deps
        );
        expect(mutations[0]?.body).toMatchObject({ description: null, title: 'Draft Check' });
        await expect(
            runReminderUpdate(
                args({
                    '--fire-at': reminder.fireAt,
                    '--id': reminder.id,
                    '--title': 'Draft Check',
                }),
                deps
            )
        ).rejects.toThrow('Update one thing: --title and/or --description');
    });

    test('uses the listed reminder version for every mutation', async () => {
        const mutations: { input: AgentApiRequest; route: string }[] = [];
        const client = requester((route, input) => {
            if (route === '/api/agent/reminders') {
                return { reminders: [reminder] };
            }
            mutations.push({ input, route });
            return { reminder: { ...reminder, version: reminder.version + 1 } };
        });
        const deps = { client, write: () => undefined };

        await runReminderSnooze(args({ '--by': '2h', '--id': reminder.id }), deps);
        await runReminderUpdate(args({ '--id': reminder.id, '--title': 'Check CI' }), deps);
        await runReminderCancel(args({ '--id': reminder.id }), deps);

        expect(mutations.map(({ route }) => route)).toEqual([
            '/api/agent/reminders/snooze',
            '/api/agent/reminders/update',
            '/api/agent/reminders/cancel',
        ]);
        for (const { input } of mutations) {
            expect(input.body).toMatchObject({
                commandId: expect.stringMatching(/^cli-/u),
                expectedVersion: reminder.version,
                id: reminder.id,
            });
        }
    });
});

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], values };
}

function requester(respond: (route: string, input: AgentApiRequest) => unknown): AgentApiRequester {
    return {
        async request<T>(
            route: string,
            schema: z.ZodType<T>,
            input: AgentApiRequest = {}
        ): Promise<T> {
            return schema.parse(respond(route, input));
        },
    };
}

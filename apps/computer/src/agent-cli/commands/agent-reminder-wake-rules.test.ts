import { describe, expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { runReminderSchedule, runReminderUpdate } from './agent-reminder.ts';
import { runReminderLog } from './reminder-wake-rules.ts';

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

describe('Agent reminder CLI: wake rules and log', () => {
    test('schedules a script reminder with both wake rules', async () => {
        const requests: AgentApiRequest[] = [];
        const client = requester((_route, input) => {
            requests.push(input);
            return { reminder: { ...reminder, script: true } };
        });

        await runReminderSchedule(
            args(
                {
                    '--delay-seconds': '120',
                    '--fail-after': '3',
                    '--message-id': 'deadbeef',
                    '--script': 'check-disk.sh',
                    '--title': reminder.title,
                },
                { '--wake-on-change': true }
            ),
            { client, write: () => undefined }
        );

        expect(requests[0]?.body).toMatchObject({ failAfter: 3, wakeOnChange: true });
    });

    test('refuses wake rules on a reminder with no script, before any request', async () => {
        const routes: string[] = [];
        const client = requester((route) => {
            routes.push(route);
            return { reminder };
        });

        await expect(
            runReminderSchedule(
                args(
                    {
                        '--delay-seconds': '120',
                        '--message-id': 'deadbeef',
                        '--title': reminder.title,
                    },
                    { '--wake-on-change': true }
                ),
                { client, write: () => undefined }
            )
        ).rejects.toThrow('only apply to a script reminder');
        expect(routes).toEqual([]);
    });

    test('rejects a --fail-after outside 1-20', async () => {
        const client = requester(() => ({ reminder }));
        await expect(
            runReminderSchedule(
                args({
                    '--fail-after': '0',
                    '--message-id': 'deadbeef',
                    '--script': 'check-disk.sh',
                    '--title': reminder.title,
                }),
                { client, write: () => undefined }
            )
        ).rejects.toThrow('--fail-after must be an integer between 1 and 20');
    });

    test('updates --fail-after alone, and clears it with "none"', async () => {
        const mutations: AgentApiRequest[] = [];
        const client = requester((route, input) => {
            if (route === '/api/agent/reminders') {
                return { reminders: [{ ...reminder, script: true }] };
            }
            mutations.push(input);
            return { reminder: { ...reminder, script: true } };
        });
        const deps = { client, write: () => undefined };

        await runReminderUpdate(args({ '--fail-after': '5', '--id': reminder.id }), deps);
        await runReminderUpdate(args({ '--fail-after': 'none', '--id': reminder.id }), deps);

        expect(mutations.map((mutation) => mutation.body)).toMatchObject([
            { failAfter: 5 },
            { failAfter: null },
        ]);
    });

    test('updating --wake-on-change alone is the only field changed', async () => {
        const mutations: AgentApiRequest[] = [];
        const client = requester((route, input) => {
            if (route === '/api/agent/reminders') {
                return { reminders: [{ ...reminder, script: true }] };
            }
            mutations.push(input);
            return { reminder: { ...reminder, script: true } };
        });

        await runReminderUpdate(args({ '--id': reminder.id }, { '--wake-on-change': true }), {
            client,
            write: () => undefined,
        });

        expect(mutations[0]?.body).toMatchObject({ wakeOnChange: true });
        expect((mutations[0]?.body as { title?: string })?.title).toBeUndefined();
    });

    test('rejects an update that combines --fail-after with another field', async () => {
        const client = requester((route) =>
            route === '/api/agent/reminders'
                ? { reminders: [{ ...reminder, script: true }] }
                : { reminder }
        );
        await expect(
            runReminderUpdate(
                args({ '--fail-after': '2', '--id': reminder.id, '--title': 'New title' }),
                { client, write: () => undefined }
            )
        ).rejects.toThrow('Update one thing');
    });

    test('reminder log prints duration and the window summary', async () => {
        const lines: string[] = [];
        const client = requester(() => ({
            runs: [
                {
                    durationMs: 842,
                    firedAt: '2026-07-30T16:00:00.000Z',
                    id: 'rmf_1',
                    outcome: 'woke',
                    output: 'disk at 91%',
                    reminderId: reminder.id,
                    scriptExitCode: 0,
                },
            ],
            summary: {
                '24h': {
                    failed: 0,
                    quiet: 2,
                    recovered: 0,
                    runs: 3,
                    tokens: 140,
                    unchanged: 0,
                    woke: 1,
                },
                '7d': {
                    failed: 1,
                    quiet: 10,
                    recovered: 1,
                    runs: 14,
                    tokens: 980,
                    unchanged: 2,
                    woke: 2,
                },
                '30d': {
                    failed: 1,
                    quiet: 40,
                    recovered: 1,
                    runs: 56,
                    tokens: 980,
                    unchanged: 2,
                    woke: 14,
                },
            },
        }));

        await runReminderLog(args({}), { client, write: (text) => lines.push(text) });

        const output = lines.join('');
        expect(output).toContain(
            '24h: 3 runs (2 quiet, 0 unchanged, 1 woke, 0 failed, 0 recovered) · 140 tokens on wakes'
        );
        expect(output).toContain('842ms');
        expect(output).toContain('[woke]');
    });

    test('reminder log with no runs still shows the summary', async () => {
        const lines: string[] = [];
        const client = requester(() => ({
            runs: [],
            summary: {
                '24h': {
                    failed: 0,
                    quiet: 0,
                    recovered: 0,
                    runs: 0,
                    tokens: 0,
                    unchanged: 0,
                    woke: 0,
                },
                '7d': {
                    failed: 0,
                    quiet: 0,
                    recovered: 0,
                    runs: 0,
                    tokens: 0,
                    unchanged: 0,
                    woke: 0,
                },
                '30d': {
                    failed: 0,
                    quiet: 0,
                    recovered: 0,
                    runs: 0,
                    tokens: 0,
                    unchanged: 0,
                    woke: 0,
                },
            },
        }));

        await runReminderLog(args({}), { client, write: (text) => lines.push(text) });

        const output = lines.join('');
        expect(output).toContain('30d: 0 runs');
        expect(output).toContain('No reminder fires recorded yet.');
    });
});

function args(values: Record<string, string>, flags: Record<string, boolean> = {}): ParsedArgs {
    return { flags, help: false, positionals: [], values };
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

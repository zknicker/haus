import { describe, expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { runReminderLog } from './reminder-wake-rules.ts';

const reminderId = 'rem_test';

describe('Agent reminder CLI: reminder log', () => {
    test('reminder log prints duration and the window summary, with numbers formatted', async () => {
        const lines: string[] = [];
        const client = requester(() => ({
            runs: [
                {
                    durationMs: 842,
                    firedAt: '2026-07-30T16:00:00.000Z',
                    id: 'rmf_1',
                    outcome: 'woke',
                    output: 'disk at 91%',
                    reminderId,
                    scriptExitCode: 0,
                    wakeTotalTokens: 65_697,
                },
            ],
            summary: {
                '24h': {
                    failed: 0,
                    notReported: 0,
                    quiet: 2,
                    recovered: 0,
                    runs: 3,
                    tokens: 140,
                    unchanged: 0,
                    woke: 1,
                },
                '7d': {
                    failed: 1,
                    notReported: 1,
                    quiet: 10,
                    recovered: 1,
                    runs: 15,
                    tokens: 980,
                    unchanged: 2,
                    woke: 2,
                },
                '30d': {
                    failed: 1,
                    notReported: 1,
                    quiet: 40,
                    recovered: 1,
                    runs: 57,
                    tokens: 65_697,
                    unchanged: 2,
                    woke: 14,
                },
            },
        }));

        await runReminderLog(args({}), { client, write: (text) => lines.push(text) });

        const output = lines.join('');
        expect(output).toContain(
            '24h: 3 runs (2 quiet, 0 unchanged, 1 woke, 0 failed, 0 recovered, 0 not reported) · 140 tokens on wakes'
        );
        expect(output).toContain(
            '30d: 57 runs (40 quiet, 2 unchanged, 14 woke, 1 failed, 1 recovered, 1 not reported) · 65,697 tokens on wakes'
        );
        expect(output).toContain('0.8s');
        expect(output).toContain('[woke]');
        expect(output).toContain('65,697 tokens');
    });

    test('reminder log marks a failure-threshold wake as "woke · failing", and spells out "not reported"', async () => {
        const lines: string[] = [];
        const client = requester(() => ({
            runs: [
                {
                    durationMs: 1000,
                    firedAt: '2026-07-30T16:00:00.000Z',
                    id: 'rmf_2',
                    outcome: 'woke',
                    output: 'disk check failed',
                    reminderId,
                    scriptExitCode: 1,
                },
                {
                    durationMs: null,
                    firedAt: '2026-07-30T15:00:00.000Z',
                    id: 'rmf_3',
                    outcome: 'not_reported',
                    output: null,
                    reminderId,
                    scriptExitCode: null,
                },
            ],
        }));

        await runReminderLog(args({}), { client, write: (text) => lines.push(text) });

        const output = lines.join('');
        expect(output).toContain('[woke · failing] exit=1 1.0s');
        expect(output).not.toContain('[woke]');
        expect(output).toContain('[not reported]');
        expect(output).not.toContain('not_reported');
    });

    test('reminder log with no runs still shows the summary', async () => {
        const lines: string[] = [];
        const client = requester(() => ({
            runs: [],
            summary: {
                '24h': {
                    failed: 0,
                    notReported: 0,
                    quiet: 0,
                    recovered: 0,
                    runs: 0,
                    tokens: 0,
                    unchanged: 0,
                    woke: 0,
                },
                '7d': {
                    failed: 0,
                    notReported: 0,
                    quiet: 0,
                    recovered: 0,
                    runs: 0,
                    tokens: 0,
                    unchanged: 0,
                    woke: 0,
                },
                '30d': {
                    failed: 0,
                    notReported: 0,
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

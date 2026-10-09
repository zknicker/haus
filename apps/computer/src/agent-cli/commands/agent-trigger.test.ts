import { describe, expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    runTriggerCreate,
    runTriggerDelete,
    runTriggerList,
    runTriggerLog,
    runTriggerRotate,
    runTriggerShow,
    runTriggerStatus,
} from './agent-trigger.ts';

const trigger = {
    anchorChatId: 'cht_test',
    anchorMessageId: 'msg_test',
    anchorTarget: '#general',
    createdAt: '2026-09-01T10:00:00.000Z',
    createdByHandle: null,
    createdByUserId: null,
    disabledAt: null,
    fireCount: 0,
    id: 'trg_test',
    instruction: null,
    kind: 'webhook',
    lastFiredAt: null,
    ownerAgentId: 'agt_test',
    ownerHandle: 'blippy',
    status: 'armed',
    title: 'deploy finished',
    updatedAt: '2026-09-01T10:00:00.000Z',
    url: 'https://haus.example/api/triggers/trg_test',
    version: 1,
};

const secretResult = {
    curl: 'curl -X POST https://haus.example/api/triggers/trg_test -H "Authorization: Bearer grtt_secret" -H "Content-Type: application/json" -d \'{"hello":"world"}\'',
    secret: 'grtt_secret',
    trigger,
    url: trigger.url,
};

const fire = {
    contentType: 'application/json',
    dedupeKey: 'delivery-42',
    id: 'fir_test',
    payloadBytes: 17,
    receivedAt: '2026-09-02T08:30:00.000Z',
    triggerId: trigger.id,
};

describe('Agent trigger CLI', () => {
    test('creates a trigger and prints the secret exactly once', async () => {
        const calls: { input: AgentApiRequest; route: string }[] = [];
        const written: string[] = [];
        const client = requester((route, input) => {
            calls.push({ input, route });
            return secretResult;
        });

        await runTriggerCreate(
            args({
                '--instruction': 'Summarize the deploy in this thread.',
                '--message-id': 'deadbeef',
                '--title': 'deploy finished',
            }),
            { client, write: (text) => written.push(text) }
        );

        expect(calls).toEqual([
            {
                input: {
                    body: {
                        instruction: 'Summarize the deploy in this thread.',
                        kind: 'webhook',
                        messageId: 'deadbeef',
                        title: 'deploy finished',
                    },
                    method: 'POST',
                },
                route: '/api/agent/triggers',
            },
        ]);
        const output = written.join('');
        expect(output.match(/grtt_secret/gu)).toHaveLength(2); // the secret line and the curl line
        expect(output).toContain('Shown once and never again');
        expect(output).toContain('haus trigger rotate --id trg_test replaces it');
        expect(output).toContain(secretResult.curl);
        expect(output).toContain('trg_test [webhook · armed] "deploy finished"');
        expect(output).toContain(trigger.url);
    });

    test('defaults the kind to webhook and omits an unset instruction', async () => {
        const calls: AgentApiRequest[] = [];
        const client = requester((_route, input) => {
            calls.push(input);
            return secretResult;
        });

        await runTriggerCreate(args({ '--message-id': 'deadbeef', '--title': 'deploy finished' }), {
            client,
            write: () => undefined,
        });

        expect(calls[0]?.body).toEqual({
            kind: 'webhook',
            messageId: 'deadbeef',
            title: 'deploy finished',
        });
    });

    test('sends an explicit --kind and refuses one Haus does not have', async () => {
        const calls: AgentApiRequest[] = [];
        const client = requester((_route, input) => {
            calls.push(input);
            return secretResult;
        });
        const deps = { client, write: () => undefined };

        await runTriggerCreate(
            args({ '--kind': 'webhook', '--message-id': 'deadbeef', '--title': 'deploy finished' }),
            deps
        );
        const refused = await runTriggerCreate(
            args({ '--kind': 'schedule', '--message-id': 'deadbeef', '--title': 'nope' }),
            deps
        ).catch((cause: unknown) => cause);

        expect(calls[0]?.body).toMatchObject({ kind: 'webhook' });
        expect(calls).toHaveLength(1);
        expect(refused).toBeInstanceOf(AgentCliError);
        expect((refused as AgentCliError).code).toBe('INVALID_ARG');
        expect((refused as AgentCliError).message).toBe('--kind schedule is not a trigger kind.');
        expect((refused as AgentCliError).options.nextAction).toBe('Supported kinds: webhook.');
    });

    test('never prints a secret in list or show', async () => {
        const written: string[] = [];
        const routes: string[] = [];
        const client = requester((route) => {
            routes.push(route);
            return route === '/api/agent/triggers'
                ? {
                      triggers: [
                          { ...trigger, fireCount: 3, lastFiredAt: '2026-09-02T08:30:00.000Z' },
                      ],
                  }
                : { trigger: { ...trigger, instruction: 'Post a summary.' } };
        });
        const deps = { client, write: (text: string) => written.push(text) };

        await runTriggerList(args({}), deps);
        await runTriggerShow(args({ '--id': trigger.id }), deps);

        expect(routes).toEqual(['/api/agent/triggers', '/api/agent/triggers/trg_test']);
        const output = written.join('');
        expect(output).not.toContain('grtt_');
        expect(output).not.toContain('Secret');
        expect(output).toContain('[webhook · armed]');
        expect(output).toContain('3 fires, last ');
        expect(output).toContain('anchored in #general');
        expect(output).toContain('Instruction: Post a summary.');
    });

    test('reports an empty trigger list without failing', async () => {
        const written: string[] = [];
        const client = requester(() => ({ triggers: [] }));

        const code = await runTriggerList(args({}), {
            client,
            write: (text) => written.push(text),
        });

        expect(code).toBe(0);
        expect(written.join('')).toBe(
            'No triggers. Create one with haus trigger create when an outside event should reach you.\n'
        );
    });

    test('sends each lifecycle verb to its own route', async () => {
        const calls: { input: AgentApiRequest; route: string }[] = [];
        const written: string[] = [];
        const client = requester((route, input) => {
            calls.push({ input, route });
            if (route.endsWith('/rotate')) {
                return secretResult;
            }
            if (input.method === 'DELETE') {
                return { deleted: true, id: trigger.id };
            }
            return {
                trigger: { ...trigger, status: route.endsWith('/enable') ? 'armed' : 'disabled' },
            };
        });
        const deps = { client, write: (text: string) => written.push(text) };

        await runTriggerStatus(args({ '--id': trigger.id }), deps, 'disable');
        await runTriggerStatus(args({ '--id': trigger.id }), deps, 'enable');
        await runTriggerRotate(args({ '--id': trigger.id }), deps);
        await runTriggerDelete(args({ '--id': trigger.id }), deps);

        expect(calls).toEqual([
            { input: { method: 'POST' }, route: '/api/agent/triggers/trg_test/disable' },
            { input: { method: 'POST' }, route: '/api/agent/triggers/trg_test/enable' },
            { input: { method: 'POST' }, route: '/api/agent/triggers/trg_test/rotate' },
            { input: { method: 'DELETE' }, route: '/api/agent/triggers/trg_test' },
        ]);
        const output = written.join('');
        expect(output).toContain('Disabled. trg_test [webhook · disabled]');
        expect(output).toContain('Armed. trg_test [webhook · armed]');
        expect(output).toContain('Rotated. The previous secret no longer works.');
        expect(output).toContain('Recent fire history stays in the Agent profile for 30 days');
    });

    test('lists fires without payloads and reads one fire verbatim', async () => {
        const requests: { input: AgentApiRequest; route: string }[] = [];
        const listed: string[] = [];
        const detailed: string[] = [];
        const client = requester((route, input) => {
            requests.push({ input, route });
            return input.query?.fire
                ? { fire: { ...fire, payload: '{"status":"ok"}' }, kind: 'fire' }
                : { fires: [fire], kind: 'fires' };
        });

        await runTriggerLog(args({ '--id': trigger.id }), {
            client,
            write: (text) => listed.push(text),
        });
        await runTriggerLog(args({ '--fire': fire.id, '--id': trigger.id }), {
            client,
            write: (text) => detailed.push(text),
        });

        expect(requests.map(({ route }) => route)).toEqual([
            '/api/agent/triggers/trg_test/log',
            '/api/agent/triggers/trg_test/log',
        ]);
        expect(requests[0]?.input.query).toEqual({ fire: undefined, limit: undefined });
        expect(requests[1]?.input.query).toEqual({ fire: 'fir_test', limit: undefined });
        expect(listed.join('')).toMatch(
            /^2026-09-02 08:30:00 UTC fir_test 17B dedupe=delivery-42\nRead one payload: haus trigger log --id trg_test --fire <fireId>\n$/u
        );
        expect(listed.join('')).not.toContain('status');
        expect(detailed.join('')).toMatch(
            /fir_test 17B dedupe=delivery-42 type=application\/json\n\n\{"status":"ok"\}\n$/u
        );
    });

    test('asks for a bounded page of fires and refuses a limit outside it', async () => {
        const requests: { input: AgentApiRequest; route: string }[] = [];
        const client = requester((route, input) => {
            requests.push({ input, route });
            return { fires: [fire], kind: 'fires' };
        });
        const deps = { client, write: () => undefined };

        await runTriggerLog(args({ '--id': trigger.id, '--limit': '10' }), deps);

        expect(requests[0]?.input.query).toEqual({ fire: undefined, limit: 10 });
        for (const limit of ['0', '101', 'ten', '2.5']) {
            await expect(
                runTriggerLog(args({ '--id': trigger.id, '--limit': limit }), deps)
            ).rejects.toThrow('--limit must be a whole number between 1 and 100.');
        }
        expect(requests).toHaveLength(1);
    });

    test('reports an empty fire log', async () => {
        const written: string[] = [];
        const client = requester(() => ({ fires: [], kind: 'fires' }));

        await runTriggerLog(args({ '--id': trigger.id }), {
            client,
            write: (text) => written.push(text),
        });

        expect(written.join('')).toBe('No fires recorded for trg_test yet.\n');
    });

    test('rejects invalid flags before reaching the Server', async () => {
        const client = requester(() => {
            throw new Error('the CLI must not call the Server for invalid flags');
        });
        const deps = { client, write: () => undefined };

        await expect(runTriggerCreate(args({ '--message-id': 'deadbeef' }), deps)).rejects.toThrow(
            'Provide --title with what the outside event means.'
        );
        await expect(runTriggerCreate(args({ '--title': 'ok' }), deps)).rejects.toThrow(
            'Provide --message-id with the anchor message.'
        );
        await expect(
            runTriggerCreate(args({ '--message-id': 'deadbeef', '--title': 'a'.repeat(201) }), deps)
        ).rejects.toThrow('--title is 201 characters; the limit is 200.');
        await expect(
            runTriggerCreate(
                args({
                    '--instruction': 'é'.repeat(2049),
                    '--message-id': 'deadbeef',
                    '--title': 'ok',
                }),
                deps
            )
        ).rejects.toThrow('--instruction is 4098 bytes; the limit is 4096.');
        await expect(runTriggerShow(args({}), deps)).rejects.toThrow(
            'Provide --id with the trigger id.'
        );
    });

    test('points a missing --id at the list command', async () => {
        const client = requester(() => ({ triggers: [] }));
        const error = await runTriggerLog(args({}), { client, write: () => undefined }).catch(
            (cause: unknown) => cause
        );

        expect(error).toBeInstanceOf(AgentCliError);
        expect((error as AgentCliError).code).toBe('INVALID_ARG');
        expect((error as AgentCliError).options.nextAction).toBe(
            'Run haus trigger list to see your triggers and their ids.'
        );
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

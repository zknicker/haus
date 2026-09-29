import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { CHANNEL_SUBCOMMANDS, runChannelAdd, runServerInfo } from './agent-directory.ts';

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], valueLists: {}, values };
}

function requester(
    seen: AgentApiRequest[],
    response: unknown,
    routes: string[] = []
): AgentApiRequester {
    return {
        request(path, schema, input) {
            routes.push(path);
            seen.push(input ?? {});
            return Promise.resolve(schema.parse(response));
        },
    };
}

test('channel add posts one membership change and confirms it', async () => {
    const seen: AgentApiRequest[] = [];
    const routes: string[] = [];
    const output: string[] = [];

    const exitCode = await runChannelAdd(args({ '--agent': '@orbit', '--target': '#product' }), {
        client: requester(seen, { added: true, handle: 'orbit', target: '#product' }, routes),
        write: (text) => output.push(text),
    });

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/channels/add']);
    expect(seen[0]?.body).toEqual({ agent: '@orbit', target: '#product' });
    expect(seen[0]?.method).toBe('POST');
    expect(output.join('')).toBe('Added @orbit to #product.\n');
});

// The add is idempotent, so a repeat has to read as a no-op, not a success.
test('an Agent already in the channel is reported as already there', async () => {
    const output: string[] = [];

    await runChannelAdd(args({ '--agent': 'orbit', '--target': '#product' }), {
        client: requester([], { added: false, handle: 'orbit', target: '#product' }),
        write: (text) => output.push(text),
    });

    expect(output.join('')).toBe('@orbit was already in #product.\n');
});

test('channel add refuses a bad channel or handle before spending a request', async () => {
    const seen: AgentApiRequest[] = [];
    const deps = {
        client: requester(seen, { added: true, handle: 'orbit', target: '#product' }),
        write: () => undefined,
    };

    await expect(
        runChannelAdd(args({ '--agent': '@orbit', '--target': 'product' }), deps)
    ).rejects.toThrow(/A #channel target is required/u);
    await expect(
        runChannelAdd(args({ '--agent': 'Orbit Lane', '--target': '#product' }), deps)
    ).rejects.toThrow(/--agent must name one Agent as @handle/u);
    expect(seen).toHaveLength(0);
});

test('the channel family advertises add alongside join and leave', () => {
    expect(CHANNEL_SUBCOMMANDS.map((command) => command.name)).toEqual([
        'info',
        'members',
        'add',
        'join',
        'leave',
        'mute',
        'unmute',
    ]);
});

test('server directory gives copyable ID-backed references for people and agents', async () => {
    const output: string[] = [];
    await runServerInfo(args({}), {
        client: requester([], {
            agents: [{ description: 'Ads', handle: 'beacon', id: 'agt_beacon' }],
            channels: [],
            hasMore: { agents: false, channels: false, humans: false },
            humans: [{ description: 'Owner', handle: 'knicker', id: 'usr_zach' }],
            limit: 50,
            offset: 0,
            total: { agents: 1, channels: 0, humans: 1 },
        }),
        write: (text) => output.push(text),
    });

    expect(output.join('')).toContain('[@beacon](agent://agt_beacon) — Ads');
    expect(output.join('')).toContain('[@knicker](user://usr_zach) — Owner');
    expect(output.join('')).toContain('keep its identity across handle changes');
});

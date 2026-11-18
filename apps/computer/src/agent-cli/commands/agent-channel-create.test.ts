import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { runChannelCreate } from './agent-channel-create.ts';

function args(values: Record<string, string>, humans: string[] = []): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: humans.length > 0 ? { '--human': humans } : {},
        values: humans.length > 0 ? { ...values, '--human': humans.at(-1) ?? '' } : values,
    };
}

function requester(seen: { input: AgentApiRequest; path: string }[], response: unknown) {
    return {
        request(path, schema, input) {
            seen.push({ input: input ?? {}, path });
            return Promise.resolve(schema.parse(response));
        },
    } satisfies AgentApiRequester;
}

test('channel create posts the name, humans, and description and names the new channel', async () => {
    const seen: { input: AgentApiRequest; path: string }[] = [];
    const output: string[] = [];

    const exitCode = await runChannelCreate(
        args({ '--description': ' Sentry and uptime alerts ', '--name': '#alerts' }, ['@zach']),
        {
            client: requester(seen, {
                description: 'Sentry and uptime alerts',
                humans: ['zach'],
                target: '#alerts',
            }),
            write: (text) => output.push(text),
        }
    );

    expect(exitCode).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe('/api/agent/channels/create');
    expect(seen[0]?.input.method).toBe('POST');
    expect(seen[0]?.input.body).toEqual({
        description: 'Sentry and uptime alerts',
        humans: ['@zach'],
        name: 'alerts',
    });
    expect(output.join('')).toBe(
        'Created #alerts. You and @zach are in it.\n' +
            'Next: post there with haus message send --target "#alerts", or add an Agent with haus channel add --target "#alerts" --agent @handle.\n'
    );
});

test('every repeated --human is sent, and the receipt names each one', async () => {
    const seen: { input: AgentApiRequest; path: string }[] = [];
    const output: string[] = [];

    await runChannelCreate(args({ '--name': 'ops' }, ['@zach', 'kai']), {
        client: requester(seen, { description: null, humans: ['kai', 'zach'], target: '#ops' }),
        write: (text) => output.push(text),
    });

    expect(seen[0]?.input.body).toEqual({ humans: ['@zach', 'kai'], name: 'ops' });
    expect(output.join('')).toStartWith('Created #ops. You and @kai, @zach are in it.\n');
});

test('channel create refuses a bad name or a missing human before spending a request', async () => {
    const seen: { input: AgentApiRequest; path: string }[] = [];
    const deps = {
        client: requester(seen, { description: null, humans: ['zach'], target: '#alerts' }),
        write: () => undefined,
    };

    await expect(runChannelCreate(args({}, ['@zach']), deps)).rejects.toThrow(
        /--name must be 1-32 letters/u
    );
    await expect(
        runChannelCreate(args({ '--name': 'alerts feed' }, ['@zach']), deps)
    ).rejects.toThrow(/--name must be 1-32 letters/u);
    await expect(runChannelCreate(args({ '--name': 'alerts' }), deps)).rejects.toThrow(
        /Name at least one human with --human @handle/u
    );
    await expect(
        runChannelCreate(args({ '--name': 'alerts' }, ['Zach Knickerbocker']), deps)
    ).rejects.toThrow(/--human must name one human as @handle/u);
    expect(seen).toHaveLength(0);
});

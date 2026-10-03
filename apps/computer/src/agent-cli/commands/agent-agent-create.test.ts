import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { type AgentAgentDeps, runAgentCreate } from './agent-agent.ts';
import { deriveAgentCreateNonce } from './agent-create-request.ts';

const createdAgent = {
    agentId: 'agt_orbit',
    avatarUrl: null,
    description: 'Keeps release notes current.',
    displayName: 'Orbit',
    handle: 'orbit',
    retired: false,
};

const createReceipt = {
    agent: createdAgent,
    avatar: { byteSize: 4096, status: 'generated' },
    channels: ['#all', '#product'],
    chatId: 'cht_product',
    computerId: 'cmp_studio',
    idempotent: false,
    messageId: 'msg_1a2b3c4d5e6f7890',
    modelId: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    runtimeId: 'codex',
    sequence: 7,
    target: '#product',
};

function args(overrides: Record<string, string> = {}): ParsedArgs {
    return {
        flags: {},
        help: false,
        positionals: [],
        valueLists: {},
        values: {
            '--description': 'Keeps release notes current.',
            '--name': 'Orbit',
            '--say': '@orbit is on the team now; I asked them to own release notes.',
            '--target': '#product',
            ...overrides,
        },
    };
}

function requester(
    seen: AgentApiRequest[],
    routes: string[] = [],
    receipts: Record<string, unknown> = {}
): AgentApiRequester {
    return {
        request(path, schema, input) {
            routes.push(path);
            seen.push(input ?? {});
            const response =
                receipts[path] ??
                (path.endsWith('/update')
                    ? { agent: createdAgent }
                    : path.endsWith('/avatar')
                      ? {
                            agent: createdAgent,
                            avatar: {
                                byteSize: 4096,
                                height: 512,
                                mediaType: 'image/png',
                                width: 512,
                            },
                        }
                      : createReceipt);
            return Promise.resolve(schema.parse(response));
        },
    };
}

function deps(overrides: Partial<AgentAgentDeps> = {}): AgentAgentDeps {
    return {
        callerAgentId: 'agt_caller',
        client: requester([]),
        write: () => undefined,
        ...overrides,
    };
}

test('create posts the whole Agent and its authored message in one request', async () => {
    const seen: AgentApiRequest[] = [];
    const routes: string[] = [];
    const output: string[] = [];

    const exitCode = await runAgentCreate(args({ '--avatar-concept': 'a moonlit raccoon' }), {
        callerAgentId: 'agt_caller',
        client: requester(seen, routes),
        write: (text) => output.push(text),
    });

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/agents']);
    expect(seen[0]?.body).toEqual({
        avatarConcept: 'a moonlit raccoon',
        brief: null,
        channels: [],
        content: '@orbit is on the team now; I asked them to own release notes.',
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        nonce: deriveAgentCreateNonce('agt_caller', {
            avatarConcept: 'a moonlit raccoon',
            brief: null,
            channels: [],
            content: '@orbit is on the team now; I asked them to own release notes.',
            description: 'Keeps release notes current.',
            displayName: 'Orbit',
            target: '#product',
        }),
        target: '#product',
    });
    // Avatar generation alone takes up to 75 s, so the request must outwait it.
    expect(seen[0]?.timeoutMs).toBe(120_000);

    const printed = output.join('');
    expect(printed).toContain('Created @orbit (Orbit). Agent ID: agt_orbit');
    expect(printed).toContain(
        'Runtime codex · model gpt-5.6-sol · reasoning medium · Computer cmp_studio — inherited from you.'
    );
    expect(printed).toContain('Posted to #product. Message ID: msg_1a2b3c4d5e6f7890');
    expect(printed).toContain('In #all, #product.');
    expect(printed).toContain('target "#product:1a2b3c4d"');
});

test('the brief and repeated channels ride the create, and the receipt says so', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];

    await runAgentCreate(
        {
            ...args(),
            valueLists: { '--channel': ['#product', '#product', '#design'] },
            values: {
                ...args().values,
                '--brief': '  Own release notes. Post a Friday digest in #product.  ',
                '--channel': '#design',
            },
        },
        deps({ client: requester(seen), write: (text) => output.push(text) })
    );

    const body = seen[0]?.body as { brief: string; channels: string[] };
    expect(body.brief).toBe('Own release notes. Post a Friday digest in #product.');
    // Repeats collapse; #all is the Server's business, not a flag.
    expect(body.channels).toEqual(['#product', '#design']);
    expect(output.join('')).toContain('Its brief is in its memory');
});

test('a create with no brief says so rather than staying silent about it', async () => {
    const output: string[] = [];
    await runAgentCreate(args(), deps({ write: (text) => output.push(text) }));

    expect(output.join('')).toContain('No brief: it wakes without standing instructions');
});

test('a create without an avatar concept sends null and keeps the ordinary timeout', async () => {
    const seen: AgentApiRequest[] = [];
    await runAgentCreate(args(), deps({ client: requester(seen) }));

    expect((seen[0]?.body as { avatarConcept: string | null }).avatarConcept).toBeNull();
    expect(seen[0]?.timeoutMs).toBeUndefined();
});

test('create names a thread target as itself rather than inventing a child thread', async () => {
    const output: string[] = [];
    await runAgentCreate(
        args({ '--target': '#product:1a2b3c4d' }),
        deps({
            client: requester([], [], {
                '/api/agent/agents': { ...createReceipt, target: '#product:1a2b3c4d' },
            }),
            write: (text) => output.push(text),
        })
    );

    expect(output.join('')).toContain('(discussion continues in "#product:1a2b3c4d")');
});

test('an unavailable avatar provider is stated on the receipt, not hidden', async () => {
    const output: string[] = [];
    await runAgentCreate(
        args({ '--avatar-concept': 'a moonlit raccoon' }),
        deps({
            client: requester([], [], {
                '/api/agent/agents': {
                    ...createReceipt,
                    avatar: {
                        code: 'AVATAR_PROVIDER_UNAVAILABLE',
                        note: 'avatar generation is not configured on this Server.',
                        status: 'unavailable',
                    },
                },
            }),
            write: (text) => output.push(text),
        })
    );

    expect(output.join('')).toContain(
        'No avatar: avatar generation is not configured on this Server.'
    );
});

test('create refuses locally before spending a request on a bad flag', async () => {
    const seen: AgentApiRequest[] = [];
    const client = requester(seen);
    const cases: [Record<string, string>, RegExp][] = [
        [{ '--say': '' }, /--say is required/u],
        [{ '--name': '' }, /--name is required/u],
        [{ '--description': '' }, /--description is required/u],
        [{ '--target': 'product' }, /Invalid target/u],
        [{ '--name': 'x'.repeat(81) }, /--name must be 80 characters or fewer/u],
        [{ '--description': 'x'.repeat(281) }, /--description must be 280 characters/u],
        [{ '--say': 'x'.repeat(4001) }, /--say must be 4000 characters/u],
        [{ '--avatar-concept': 'x'.repeat(281) }, /--avatar-concept must be 280 characters/u],
        [{ '--brief': 'x'.repeat(4001) }, /--brief must be 4000 characters/u],
        [{ '--channel': 'product' }, /Invalid channel "product"/u],
    ];
    for (const [overrides, expected] of cases) {
        await expect(runAgentCreate(args(overrides), deps({ client }))).rejects.toThrow(expected);
    }
    expect(seen).toHaveLength(0);
});

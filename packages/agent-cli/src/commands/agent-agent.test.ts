import { expect, test } from 'bun:test';
import {
    type AgentApiRequest,
    type AgentApiRequester,
    AgentApiTransportError,
} from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    AGENT_SUBCOMMANDS,
    type AgentAgentDeps,
    runAgentAvatar,
    runAgentCreate,
    runAgentUpdate,
} from './agent-agent.ts';
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
    modelId: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    runtimeId: 'codex',
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
            '--brief': 'Own release notes and report verified results in #product.',
            '--name': 'Orbit',
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

test('update replaces one description and reads the stored profile back', async () => {
    const seen: AgentApiRequest[] = [];
    const routes: string[] = [];
    const output: string[] = [];

    const exitCode = await runAgentUpdate(
        {
            flags: {},
            help: false,
            positionals: [],
            valueLists: {},
            values: { '--agent': '@orbit', '--description': 'Owns release notes.' },
        },
        deps({ client: requester(seen, routes), write: (text) => output.push(text) })
    );

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/agents/update']);
    expect(seen[0]?.body).toEqual({ agent: '@orbit', description: 'Owns release notes.' });
    expect(output.join('')).toContain('Updated @orbit (Orbit).');
});

test('avatar generation states the stored image and waits out the provider', async () => {
    const seen: AgentApiRequest[] = [];
    const routes: string[] = [];
    const output: string[] = [];

    await runAgentAvatar(
        {
            flags: {},
            help: false,
            positionals: [],
            valueLists: {},
            values: { '--agent': 'orbit', '--concept': 'a moonlit raccoon cartographer' },
        },
        deps({ client: requester(seen, routes), write: (text) => output.push(text) })
    );

    expect(routes).toEqual(['/api/agent/agents/avatar']);
    expect(seen[0]?.body).toEqual({
        agent: 'orbit',
        concept: 'a moonlit raccoon cartographer',
    });
    expect(seen[0]?.timeoutMs).toBe(75_000);
    expect(output.join('')).toContain('New avatar for @orbit (image/png, 512x512, 4096 bytes)');
});

test('an unusable --agent never reaches the Server', async () => {
    const seen: AgentApiRequest[] = [];
    const client = requester(seen);
    for (const agent of ['Orbit', '@orbit!', '@o', '']) {
        await expect(
            runAgentUpdate(
                {
                    flags: {},
                    help: false,
                    positionals: [],
                    valueLists: {},
                    values: { '--agent': agent, '--description': 'Owns release notes.' },
                },
                deps({ client })
            )
        ).rejects.toBeInstanceOf(AgentCliError);
    }
    expect(seen).toHaveLength(0);
});

test('a Server refusal reaches the Agent with its own code and next action', async () => {
    const failing: AgentApiRequester = {
        request() {
            return Promise.reject(
                new AgentCliError('CHAT_VIEW_STALE', 'New messages arrived in #product.', {
                    nextAction: 'Run haus message read --target "#product" before creating again.',
                })
            );
        },
    };
    await expect(runAgentCreate(args(), deps({ client: failing }))).rejects.toMatchObject({
        code: 'CHAT_VIEW_STALE',
    });

    for (const code of [
        'AGENT_CREATE_IDEMPOTENCY_CONFLICT',
        'AGENT_CREATE_REFUSED',
        'AGENT_NO_COMPUTER',
        'AGENT_NOT_FOUND',
        'AGENT_IDENTITY_PROTECTED',
        'AVATAR_GENERATION_BUSY',
        'AVATAR_PROVIDER_FAILED',
        'AVATAR_OUTPUT_INVALID',
    ]) {
        const client: AgentApiRequester = {
            request: () => Promise.reject(new AgentCliError(code, 'Refused.')),
        };
        await expect(runAgentCreate(args(), deps({ client }))).rejects.toMatchObject({ code });
    }
});

test('the group exposes exactly the three Agent verbs', () => {
    expect(AGENT_SUBCOMMANDS.map((command) => command.name)).toEqual([
        'create',
        'update',
        'avatar',
    ]);
});

test('the create nonce is the request itself, so an identical re-issue replays', () => {
    const request = {
        avatarConcept: 'a moonlit raccoon',
        brief: 'Own release notes.',
        channels: ['#product', '#design'],
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        signatureEmoji: null,
        target: '#product',
    };
    const nonce = deriveAgentCreateNonce('agt_caller', request);

    expect(nonce).toMatch(/^agent-create-[0-9a-f]{64}$/u);
    expect(deriveAgentCreateNonce('agt_caller', { ...request })).toBe(nonce);
    // Channel order and repeats say nothing about which Agent this is.
    expect(
        deriveAgentCreateNonce('agt_caller', {
            ...request,
            channels: ['#design', '#product', '#product'],
        })
    ).toBe(nonce);

    const changed = [
        { ...request, avatarConcept: 'a brass compass' },
        { ...request, avatarConcept: null },
        { ...request, brief: 'Own the changelog.' },
        { ...request, brief: 'Own a different lane.' },
        { ...request, channels: ['#product'] },
        { ...request, description: 'Keeps the changelog current.' },
        { ...request, displayName: 'Orbit II' },
        { ...request, signatureEmoji: '🦊' },
        { ...request, target: '#all' },
    ];
    for (const request_ of changed) {
        expect(deriveAgentCreateNonce('agt_caller', request_)).not.toBe(nonce);
    }
    // Nonces are scoped to the Chat, not the Agent, so two Agents announcing the
    // same teammate in one Chat must not collide.
    expect(deriveAgentCreateNonce('agt_other', request)).not.toBe(nonce);
});

test('a create that got no answer is retried once with the identical body', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];
    const inner = requester(seen, [], {
        '/api/agent/agents': { ...createReceipt, idempotent: true },
    });
    let attempts = 0;
    const dropping: AgentApiRequester = {
        request(path, schema, input) {
            attempts += 1;
            if (attempts === 1) {
                seen.push(input ?? {});
                return Promise.reject(
                    new AgentApiTransportError('SERVER_5XX', 'The Haus server is unavailable.')
                );
            }
            return inner.request(path, schema, input);
        },
    };

    const exitCode = await runAgentCreate(
        args(),
        deps({ client: dropping, write: (text) => output.push(text) })
    );

    expect(exitCode).toBe(0);
    expect(attempts).toBe(2);
    // The same nonce is what makes the retry a replay rather than a second Agent.
    expect(seen[1]?.body).toEqual(seen[0]?.body as Record<string, unknown>);
    expect(output.join('')).toContain('This request repeated an earlier one');
});

test('an answered refusal is never retried', async () => {
    let attempts = 0;
    const refusing: AgentApiRequester = {
        request() {
            attempts += 1;
            return Promise.reject(new AgentCliError('CHAT_VIEW_STALE', 'New messages arrived.'));
        },
    };

    await expect(runAgentCreate(args(), deps({ client: refusing }))).rejects.toMatchObject({
        code: 'CHAT_VIEW_STALE',
    });
    expect(attempts).toBe(1);
});

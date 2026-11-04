import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runCloudAgentStart } from './agent-cloud-agent.ts';
import { args, requester } from './agent-cloud-agent-fixture.ts';

test('starts one Cloud Agent with the stdin instructions and the Agent’s own words', async () => {
    const seen: AgentApiRequest[] = [];
    const routes: string[] = [];
    const output: string[] = [];

    const exitCode = await runCloudAgentStart(args(), {
        client: requester(seen, routes),
        mintNonce: () => 'cloud-agent-nonce',
        readStdin: () => Promise.resolve('Reproduce the flake and open a pull request.\n'),
        stdinIsTty: false,
        write: (text) => output.push(text),
    });

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/cloud-agents']);
    expect(seen[0]?.body).toEqual({
        content: 'Handing the flaky delivery test to a cloud agent.',
        instructions: 'Reproduce the flake and open a pull request.',
        nonce: 'cloud-agent-nonce',
        repository: 'haus/haus',
        startingRef: 'main',
        target: '#product',
        title: 'Fix the flaky delivery test',
    });
    const printed = output.join('');
    expect(printed).toContain('Work ID: caw_1234567890abcdef');
    expect(printed).toContain('Work thread: "#product:1a2b3c4d"');
    expect(printed).toContain('reaches your inbox');
});

test('starts a cloud card as an inline reply without changing its channel', async () => {
    const seen: AgentApiRequest[] = [];
    await runCloudAgentStart(args({ '--reply-to': '1a2b3c4d' }), {
        client: requester(seen),
        mintNonce: () => 'inline-cloud-nonce',
        readStdin: () => Promise.resolve('Fix the reported failure.'),
        stdinIsTty: false,
        write: () => undefined,
    });
    expect(seen[0]?.body).toMatchObject({
        replyToMessageId: '1a2b3c4d',
        target: '#product',
    });
});

test('--cause rides the --say post as on haus message send, and a blank one is refused', async () => {
    const seen: AgentApiRequest[] = [];
    const deps = {
        client: requester(seen),
        mintNonce: () => 'caused-cloud-nonce',
        readStdin: () => Promise.resolve('Fold the dependency PRs into one.'),
        stdinIsTty: false,
        write: () => undefined,
    };
    await runCloudAgentStart(args({ '--cause': ' rmf_9a8b7c6d ' }), deps);
    expect(seen[0]?.body).toMatchObject({ cause: 'rmf_9a8b7c6d' });
    await expect(runCloudAgentStart(args({ '--cause': ' ' }), deps)).rejects.toThrow('fire id');
    expect(seen).toHaveLength(1);
});

test('a held start shows the newer messages and says nothing was launched', async () => {
    const output: string[] = [];
    const newer = {
        attachments: [],
        author: { id: 'usr_zach', kind: 'user', label: 'Zach', metadata: {} },
        body_kind: 'text',
        chat_id: 'cht_product',
        content: 'own it in tech ops though not here',
        created_at: '2026-09-04T12:00:07.000Z',
        deleted_at: null,
        delivery_id: null,
        id: 'msg_newer1234567890',
        metadata: {},
        nonce: null,
        role: 'user',
        sender: { description: null, handle: 'zach', type: 'human' },
        sequence: 107,
    };
    const exitCode = await runCloudAgentStart(args(), {
        client: {
            request: (_path, schema) =>
                Promise.resolve(
                    schema.parse({
                        formalMentionCount: 0,
                        newMessageCount: 1,
                        omittedMessageCount: 0,
                        shownMessages: [newer],
                        state: 'held',
                    })
                ),
        },
        mintNonce: () => 'cloud-agent-nonce',
        readStdin: () => Promise.resolve('Do the work.'),
        stdinIsTty: false,
        write: (text) => output.push(text),
    });

    expect(exitCode).toBe(0);
    const printed = output.join('');
    expect(printed).toContain('Freshness hold: showing latest 1 of 1 newer messages.');
    expect(printed).toContain('The cloud agent was not started');
    expect(printed).toContain('own it in tech ops though not here');
    expect(printed).toContain('run the same haus cloud-agent start command again');
    expect(printed).not.toContain('Work ID');
});

test('a start with no instructions, a bad repository, or no ref fails or omits truthfully', async () => {
    const deps = {
        client: requester([]),
        mintNonce: () => 'cloud-agent-nonce',
        readStdin: () => Promise.resolve('   '),
        stdinIsTty: false,
        write: () => undefined,
    };
    await expect(runCloudAgentStart(args(), deps)).rejects.toThrow(AgentCliError);

    const seen: AgentApiRequest[] = [];
    await expect(
        runCloudAgentStart(args({ '--repo': 'haus' }), {
            ...deps,
            client: requester(seen),
            readStdin: () => Promise.resolve('Do the work.'),
        })
    ).rejects.toThrow(/Invalid repository/);
    expect(seen).toHaveLength(0);

    const withoutRef: ParsedArgs = args();
    withoutRef.values['--ref'] = '';
    await runCloudAgentStart(withoutRef, {
        ...deps,
        client: requester(seen),
        readStdin: () => Promise.resolve('Do the work.'),
    });
    expect((seen[0]?.body as { startingRef: string | null }).startingRef).toBeNull();
});

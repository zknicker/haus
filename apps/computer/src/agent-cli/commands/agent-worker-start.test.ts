import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { args, requester } from './agent-worker-fixture.ts';
import { runWorkerStart } from './agent-worker.ts';

test('starts one Worker with the stdin instructions and the Agent’s own words', async () => {
    const seen: AgentApiRequest[] = [];
    const routes: string[] = [];
    const output: string[] = [];

    const exitCode = await runWorkerStart(args(), {
        client: requester(seen, routes),
        mintNonce: () => 'worker-nonce',
        readStdin: () => Promise.resolve('Reproduce the flake and open a pull request.\n'),
        stdinIsTty: false,
        write: (text) => output.push(text),
    });

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/workers']);
    expect(seen[0]?.body).toEqual({
        content: 'Handing the flaky delivery test to a Worker.',
        instructions: 'Reproduce the flake and open a pull request.',
        nonce: 'worker-nonce',
        repository: 'haus/haus',
        startingRef: 'main',
        target: 'task:SEC-12',
        task: 'SEC-12',
        title: 'Fix the flaky delivery test',
    });
    const printed = output.join('');
    expect(printed).toContain('Work ID: caw_1234567890abcdef');
    expect(printed).toContain('Posted to task:SEC-12.');
    expect(printed).toContain('Haus wakes you on task:SEC-12 when the run settles');
    expect(printed).toContain('when its pull request becomes ready or its checks finish');
    expect(printed).not.toContain('Work thread');
});

test('a launch with no Task is refused before anything is sent, naming the next step', async () => {
    const seen: AgentApiRequest[] = [];
    await expect(
        runWorkerStart(args({ '--task': '' }), {
            client: requester(seen),
            mintNonce: () => 'no-task-nonce',
            readStdin: () => Promise.resolve('Fix the reported failure.'),
            stdinIsTty: false,
            write: () => undefined,
        })
    ).rejects.toMatchObject({
        code: 'WORKER_TASK_REQUIRED',
        options: { nextAction: expect.stringContaining('haus task start') },
    });
    expect(seen).toHaveLength(0);
});

test('a Server WORKER_TASK_REQUIRED refusal gains the start-a-Task step', async () => {
    await expect(
        runWorkerStart(args(), {
            client: {
                request: () =>
                    Promise.reject(
                        new AgentCliError('WORKER_TASK_REQUIRED', 'Cloud work needs a Task.')
                    ),
            },
            mintNonce: () => 'refused-nonce',
            readStdin: () => Promise.resolve('Fix the reported failure.'),
            stdinIsTty: false,
            write: () => undefined,
        })
    ).rejects.toMatchObject({
        code: 'WORKER_TASK_REQUIRED',
        message: 'Cloud work needs a Task.',
        options: { nextAction: expect.stringContaining('--task <KEY-n>') },
    });
});

test('--task accepts the Task target form too', async () => {
    const seen: AgentApiRequest[] = [];
    await runWorkerStart(args({ '--task': 'task:SEC-12' }), {
        client: requester(seen),
        mintNonce: () => 'target-form-nonce',
        readStdin: () => Promise.resolve('Fix the reported failure.'),
        stdinIsTty: false,
        write: () => undefined,
    });
    expect(seen[0]?.body).toMatchObject({ target: 'task:SEC-12', task: 'SEC-12' });
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
    await runWorkerStart(args({ '--cause': ' rmf_9a8b7c6d ' }), deps);
    expect(seen[0]?.body).toMatchObject({ cause: 'rmf_9a8b7c6d' });
    await expect(runWorkerStart(args({ '--cause': ' ' }), deps)).rejects.toThrow('fire id');
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
    const exitCode = await runWorkerStart(args(), {
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
        mintNonce: () => 'worker-nonce',
        readStdin: () => Promise.resolve('Do the work.'),
        stdinIsTty: false,
        write: (text) => output.push(text),
    });

    expect(exitCode).toBe(0);
    const printed = output.join('');
    expect(printed).toContain('Freshness hold: showing latest 1 of 1 newer messages.');
    expect(printed).toContain('The Worker was not started');
    expect(printed).toContain('own it in tech ops though not here');
    expect(printed).toContain('run the same haus worker start command again');
    expect(printed).not.toContain('Work ID');
});

test('a start with no instructions, a bad repository, or no ref fails or omits truthfully', async () => {
    const deps = {
        client: requester([]),
        mintNonce: () => 'worker-nonce',
        readStdin: () => Promise.resolve('   '),
        stdinIsTty: false,
        write: () => undefined,
    };
    await expect(runWorkerStart(args(), deps)).rejects.toThrow(AgentCliError);

    const seen: AgentApiRequest[] = [];
    await expect(
        runWorkerStart(args({ '--repo': 'haus' }), {
            ...deps,
            client: requester(seen),
            readStdin: () => Promise.resolve('Do the work.'),
        })
    ).rejects.toThrow(/Invalid repository/);
    expect(seen).toHaveLength(0);

    const withoutRef: ParsedArgs = args();
    withoutRef.values['--ref'] = '';
    await runWorkerStart(withoutRef, {
        ...deps,
        client: requester(seen),
        readStdin: () => Promise.resolve('Do the work.'),
    });
    expect((seen[0]?.body as { startingRef: string | null }).startingRef).toBeNull();
});

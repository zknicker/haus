import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { args, requester, work } from './agent-worker-fixture.ts';
import { runWorkerStart } from './agent-worker.ts';

const brief = 'Reproduce the flake and open a pull request.\n';

function deps(seen: AgentApiRequest[], output: string[] = [], stdin = brief) {
    return {
        client: requester(seen),
        mintNonce: () => 'worker-nonce',
        readStdin: () => Promise.resolve(stdin),
        stdinIsTty: false,
        write: (text: string) => output.push(text),
    };
}

test('starts one Worker on a Task with the stdin brief and posts nothing', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];

    expect(await runWorkerStart(args(), deps(seen, output))).toBe(0);
    expect(seen[0]?.body).toEqual({
        brief: 'Reproduce the flake and open a pull request.',
        nonce: 'worker-nonce',
        place: 'cursor',
        repository: 'haus/haus',
        startingRef: 'main',
        task: 'k3mq7xta',
        title: 'Fix the flaky delivery test',
    });
    expect(output.join('')).toBe(
        [
            `Worker ${work.id} started on cursor for k3mq7xta: Fix the flaky delivery test (haus/haus@main).`,
            'Its report posts in k3mq7xta and reaches you as an inbox item when the turn ends; a launch that fails reaches you the same way.',
            `Follow up with haus worker send --worker ${work.id}; stop it with haus worker stop --worker ${work.id}.`,
            '',
        ].join('\n')
    );
});

test('a queued start says it waits for a free slot on its place', async () => {
    const output: string[] = [];
    await runWorkerStart(args(), {
        ...deps([], output),
        client: {
            request: (_path, schema) =>
                Promise.resolve(schema.parse({ state: 'queued', worker: work })),
        },
    });
    expect(output.join('')).toStartWith(
        `Worker ${work.id} queued on cursor for k3mq7xta: Fix the flaky delivery test (haus/haus@main). It starts when cursor has a free slot.\n`
    );
});

test('a start with no Task is refused before anything is sent, naming the next step', async () => {
    const seen: AgentApiRequest[] = [];
    await expect(runWorkerStart(args({ '--task': '' }), deps(seen))).rejects.toMatchObject({
        code: 'WORKER_TASK_REQUIRED',
        options: { nextAction: expect.stringContaining('haus task start') },
    });
    expect(seen).toHaveLength(0);
});

test('a start without --on leaves the place to the Server, which lists the ready ones', async () => {
    const seen: AgentApiRequest[] = [];
    await runWorkerStart(args({ '--on': '' }), deps(seen));
    expect(seen[0]?.body).not.toHaveProperty('place');
});

test('--on passes any place string through, since only the Server resolves a Computer name', async () => {
    const seen: AgentApiRequest[] = [];
    await runWorkerStart(args({ '--on': ' mini ' }), deps(seen));
    expect(seen[0]?.body).toMatchObject({ place: 'mini' });
});

test('a Server WORKER_TASK_REQUIRED refusal gains the start-a-Task step', async () => {
    await expect(
        runWorkerStart(args(), {
            ...deps([]),
            client: {
                request: () =>
                    Promise.reject(
                        new AgentCliError('WORKER_TASK_REQUIRED', 'A Worker needs a Task.')
                    ),
            },
        })
    ).rejects.toMatchObject({
        code: 'WORKER_TASK_REQUIRED',
        message: 'A Worker needs a Task.',
        options: { nextAction: expect.stringContaining('--task <id>') },
    });
});

test('--task accepts the Task target form too', async () => {
    const seen: AgentApiRequest[] = [];
    await runWorkerStart(args({ '--task': 'task:k3mq7xta' }), deps(seen));
    expect(seen[0]?.body).toMatchObject({ task: 'k3mq7xta' });
});

test('a held start shows the newer messages and says nothing was recorded', async () => {
    const output: string[] = [];
    const newer = {
        attachments: [],
        author: { id: 'usr_zach', kind: 'user', label: 'Zach', metadata: {} },
        body_kind: 'text',
        chat_id: 'cht_task',
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
    await runWorkerStart(args(), {
        ...deps([], output),
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
    });

    const printed = output.join('');
    expect(printed).toContain('Freshness hold: showing latest 1 of 1 newer messages.');
    expect(printed).toContain('The Worker was not started: nothing was recorded.');
    expect(printed).toContain('own it in tech ops though not here');
    expect(printed).toContain('run the same haus worker start command again');
});

test('a start with no brief or a bad repository fails before asking, and no ref sends none', async () => {
    const seen: AgentApiRequest[] = [];
    await expect(runWorkerStart(args(), deps(seen, [], '   '))).rejects.toThrow(
        'The brief for the Worker is required on stdin.'
    );
    await expect(runWorkerStart(args({ '--repo': 'haus' }), deps(seen))).rejects.toThrow(
        /Invalid repository/
    );
    expect(seen).toHaveLength(0);

    const withoutRef: ParsedArgs = args();
    withoutRef.values['--ref'] = '';
    await runWorkerStart(withoutRef, deps(seen));
    expect((seen[0]?.body as { startingRef: string | null }).startingRef).toBeNull();
});

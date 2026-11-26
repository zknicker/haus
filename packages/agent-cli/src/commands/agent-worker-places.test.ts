import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { UsageError } from '../parse.ts';
import { args, requester, work } from './agent-worker-fixture.ts';
import { runWorkerPlaces } from './agent-worker-places.ts';
import { runWorkerStart } from './agent-worker.ts';

const brief = 'Write the migration plan.\n';
const onMini = {
    ...work,
    place: { computerId: 'cmp_1234567890abcdef', computerName: 'mini', kind: 'computer' },
    runtime: 'codex',
};

function deps(seen: AgentApiRequest[], output: string[] = []) {
    return {
        client: requester(seen, [], onMini),
        mintNonce: () => 'worker-nonce',
        readStdin: () => Promise.resolve(brief),
        stdinIsTty: false,
        write: (text: string) => output.push(text),
    };
}

test('a Computer start sends its place, runtime, model, and repo', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];
    const startArgs = args({
        '--model': 'gpt-5.6-sol',
        '--on': 'computer:mini',
        '--repo': 'Haus/Haus',
        '--runtime': 'codex',
    });

    expect(await runWorkerStart(startArgs, deps(seen, output))).toBe(0);
    expect(seen[0]?.body).toEqual({
        brief: 'Write the migration plan.',
        model: 'gpt-5.6-sol',
        nonce: 'worker-nonce',
        place: 'computer:mini',
        repository: 'haus/haus',
        runtime: 'codex',
        startingRef: 'main',
        task: 'k3mq7xta',
        title: 'Fix the flaky delivery test',
    });
    expect(output.join('').split('\n')[0]).toBe(
        `Worker ${work.id} started on mini (computer:cmp_1234567890abcdef) in codex for k3mq7xta: Fix the flaky delivery test (haus/haus@main).`
    );
});

test('a start with no --repo is a usage error and sends nothing', async () => {
    const seen: AgentApiRequest[] = [];
    const startArgs = args();
    delete startArgs.values['--repo'];

    const refused = runWorkerStart(startArgs, deps(seen));

    await expect(refused).rejects.toBeInstanceOf(UsageError);
    await expect(refused).rejects.toThrow(
        '--repo is required. Name the repository as owner/name, for example --repo haus/haus.'
    );
    expect(seen).toEqual([]);
});

test('an unknown runtime fails before anything is sent', async () => {
    const seen: AgentApiRequest[] = [];
    await expect(runWorkerStart(args({ '--runtime': 'grok' }), deps(seen))).rejects.toMatchObject({
        code: 'INVALID_ARG',
        message: 'Invalid runtime "grok".',
    });
    expect(seen).toEqual([]);
});

test('a place refusal gains the step to list places', async () => {
    const refused = runWorkerStart(args({ '--on': 'mini' }), {
        ...deps([]),
        client: {
            request: () =>
                Promise.reject(
                    new AgentCliError('WORKER_PLACE_OFF', 'Workers cannot run on mini.')
                ),
        },
    });
    await expect(refused).rejects.toMatchObject({
        code: 'WORKER_PLACE_OFF',
        message: 'Workers cannot run on mini.',
        options: {
            nextAction:
                'Run haus worker places --task <id> to see where Workers can run, then pick another place or ask a person to turn on Run Workers here for that Computer.',
        },
    });
});

test('places lists every place with its access, switch, runtimes, repo folders, slots, and the default', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];
    const response = {
        places: [
            {
                allowed: true,
                computerId: 'cmp_1234567890abcdef',
                freeSlots: 3,
                kind: 'computer',
                limit: 4,
                repoFolders: ['acme/app', 'acme/site'],
                name: 'mini',
                online: true,
                projectDefault: true,
                ready: true,
                runtimes: [
                    { detail: null, ready: true, runtime: 'claude-code' },
                    {
                        detail: 'Codex has no login on this Computer. Run codex login.',
                        ready: false,
                        runtime: 'codex',
                    },
                ],
                workersEnabled: true,
            },
            {
                allowed: true,
                computerId: 'cmp_abcdef1234567890',
                freeSlots: 4,
                kind: 'computer',
                limit: 4,
                repoFolders: [],
                name: 'laptop',
                online: true,
                projectDefault: false,
                ready: false,
                runtimes: [],
                workersEnabled: false,
            },
            {
                allowed: false,
                computerId: 'cmp_0000studio000000',
                freeSlots: 4,
                kind: 'computer',
                limit: 4,
                repoFolders: [],
                name: 'studio',
                online: true,
                projectDefault: false,
                ready: true,
                runtimes: [],
                workersEnabled: true,
            },
            { freeSlots: 10, kind: 'cursor', limit: 10, projectDefault: false, ready: true },
        ],
        task: 'k3mq7xta',
    };
    await runWorkerPlaces(
        { flags: {}, help: false, positionals: [], valueLists: {}, values: { '--task': 'k3mq7xta' } },
        {
            ...deps(seen, output),
            client: {
                request: (path, schema, input) => {
                    seen.push({ ...input, query: { ...input?.query, path } });
                    return Promise.resolve(schema.parse(response));
                },
            },
        }
    );

    expect(seen[0]?.query).toEqual({ path: '/api/agent/workers/places', task: 'k3mq7xta' });
    expect(output.join('')).toBe(
        [
            'Places for k3mq7xta:',
            'computer:cmp_1234567890abcdef mini: ready, 3 of 4 slots free; runtimes claude-code, codex (Codex has no login on this Computer. Run codex login.); repo folders acme/app, acme/site [Project default]',
            'computer:cmp_abcdef1234567890 laptop: Run Workers here is Off',
            'computer:cmp_0000studio000000 studio: you have no access there',
            'cursor: ready, 10 of 10 slots free',
            '',
            'Start one with haus worker start --task k3mq7xta --on <place> --title <text>.',
            '',
        ].join('\n')
    );
});

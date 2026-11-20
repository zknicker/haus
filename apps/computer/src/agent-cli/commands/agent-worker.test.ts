import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-error.ts';
import { args, requester, work } from './agent-worker-fixture.ts';
import {
    runWorkerInspect,
    runWorkerSend,
    runWorkerStop,
    WORKER_SUBCOMMANDS,
} from './agent-worker.ts';

const deps = (seen: AgentApiRequest[], routes: string[], output: string[], stdin = '') => ({
    client: requester(seen, routes),
    mintNonce: () => 'follow-up-nonce',
    readStdin: () => Promise.resolve(stdin),
    stdinIsTty: stdin === '',
    write: (text: string) => output.push(text),
});

test('stop names the Worker and says what settles', async () => {
    const routes: string[] = [];
    const output: string[] = [];
    const exitCode = await runWorkerStop(args({ '--worker': work.id }), deps([], routes, output));

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/workers/stop']);
    expect(output.join('')).toBe(
        [
            `Stop requested for Fix the flaky delivery test (${work.id}).`,
            'Its working or queued turn settles as stopped, and queued follow-ups are dropped. Nothing posts in the Task.',
            `It takes later follow-ups: haus worker send --worker ${work.id}`,
            '',
        ].join('\n')
    );
});

test('send queues the stdin follow-up, and --interrupt stops the working turn first', async () => {
    for (const interrupt of [false, true]) {
        const seen: AgentApiRequest[] = [];
        const routes: string[] = [];
        const output: string[] = [];
        const input = args({ '--worker': work.id });
        input.flags['--interrupt'] = interrupt;
        await runWorkerSend(input, deps(seen, routes, output, 'Address the review comments.\n'));
        expect(routes).toEqual(['/api/agent/workers/send']);
        expect(seen[0]?.body).toEqual({
            interrupt,
            nonce: 'follow-up-nonce',
            text: 'Address the review comments.',
            workerId: work.id,
        });
        expect(output.join('')).toBe(
            [
                `Follow-up queued for Fix the flaky delivery test (${work.id}) as turn wkt_followup12345678.`,
                interrupt
                    ? 'The working turn is stopping and older queued follow-ups were dropped; this one runs next.'
                    : 'It runs when the working turn ends, or now if the Worker is idle.',
                'Its report posts in the Task and reaches you as an inbox item.',
                '',
            ].join('\n')
        );
    }
});

test('send refuses an empty follow-up before asking the Server', async () => {
    const seen: AgentApiRequest[] = [];
    await expect(
        runWorkerSend(args({ '--worker': work.id }), deps(seen, [], [], ' '))
    ).rejects.toThrow(/required on stdin/);
    expect(seen).toHaveLength(0);
});

test('inspect lists the Agent’s Workers or shows one in full', async () => {
    const listed: string[] = [];
    await runWorkerInspect(args(), deps([], [], listed));
    expect(listed.join('')).toBe(
        `${work.id} [queued] on cursor Fix the flaky delivery test (haus/haus)\n`
    );

    const seen: AgentApiRequest[] = [];
    const detail: string[] = [];
    await runWorkerInspect(args({ '--worker': work.id }), deps(seen, [], detail));
    expect(seen[0]?.query).toEqual({ workerId: work.id });
    expect(JSON.parse(detail.join(''))).toEqual([work]);
    expect(WORKER_SUBCOMMANDS.map((command) => command.name)).toEqual([
        'start',
        'send',
        'inspect',
        'stop',
    ]);
});

test('--report requires --worker, with a clear usage error otherwise', async () => {
    const input = args();
    input.flags['--report'] = true;
    await expect(runWorkerInspect(input, deps([], [], []))).rejects.toThrow(
        /--report only works alongside --worker/
    );
});

test('--report prints the newest turn’s full provider result, with a clip marker only when clipped', async () => {
    const turn = {
        acknowledgedAt: work.createdAt,
        branches: [],
        createdAt: work.createdAt,
        dispatchedAt: work.createdAt,
        errorCode: null,
        input: [],
        model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
        outcome: null,
        providerRunId: 'run_abc',
        rawStatus: 'FINISHED',
        report: { clipped: true, text: 'Opened a pull request.' },
        stall: null,
        startedAt: work.createdAt,
        status: 'completed',
        stopRequestedAt: null,
        stopRequestedBy: null,
        summary: 'Opened a pull request.',
        terminalAt: work.createdAt,
        turnId: 'wkt_1234567890abcdef',
        usage: null,
    };
    const output: string[] = [];
    const input = args({ '--worker': work.id });
    input.flags['--report'] = true;
    await runWorkerInspect(input, {
        ...deps([], [], output),
        client: requester([], [], { ...work, turns: [turn] }),
    });
    expect(output.join('')).toBe('Opened a pull request.\n[clipped at 64 KiB]\n');

    await expect(
        runWorkerInspect(input, {
            ...deps([], [], []),
            client: requester([], [], { ...work, turns: [{ ...turn, report: null }] }),
        })
    ).rejects.toThrow(`Worker ${work.id} has no turn with a recorded provider result.`);
});

test('a newer Server field on the Worker is tolerated by send and inspect', async () => {
    const newer = { ...work, aFieldThisBuildPredates: 'added later' };
    const output: string[] = [];
    await runWorkerSend(args({ '--worker': work.id }), {
        ...deps([], [], output, 'Address the review comments.'),
        client: requester([], [], newer),
    });
    expect(output.join('')).toContain(work.id);
});

test('a WORKER_ refusal from the Server renders plainly with its code', () => {
    expect(
        renderAgentCliError(
            new AgentCliError(
                'WORKER_PLACE_UNAVAILABLE',
                'No online Computer has claude ready. Ready places: cursor.'
            )
        )
    ).toBe(
        'Error: No online Computer has claude ready. Ready places: cursor.\nCode: WORKER_PLACE_UNAVAILABLE\n'
    );
});

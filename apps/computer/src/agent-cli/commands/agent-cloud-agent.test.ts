import { expect, test } from 'bun:test';

import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { args, requester, work } from './agent-cloud-agent-fixture.ts';
import {
    CLOUD_AGENT_SUBCOMMANDS,
    runCloudAgentCancel,
    runCloudAgentInspect,
    runCloudAgentSend,
} from './agent-cloud-agent.ts';

test('cancel names the work it asked the provider to stop', async () => {
    const routes: string[] = [];
    const output: string[] = [];
    const exitCode = await runCloudAgentCancel(
        { flags: {}, help: false, positionals: [], valueLists: {}, values: { '--work': work.id } },
        {
            client: requester([], routes),
            mintNonce: () => 'unused',
            readStdin: () => Promise.resolve(''),
            stdinIsTty: true,
            write: (text) => output.push(text),
        }
    );

    expect(exitCode).toBe(0);
    expect(routes).toEqual(['/api/agent/cloud-agents/cancel']);
    expect(output.join('')).toContain('Cancel requested for Fix the flaky delivery test');
});

test('send reuses the work identity and defaults to queued delivery with optional interruption', async () => {
    for (const interrupt of [false, true]) {
        const seen: AgentApiRequest[] = [];
        const routes: string[] = [];
        const output: string[] = [];
        const input = args({ '--work': work.id });
        input.flags['--interrupt'] = interrupt;
        await runCloudAgentSend(input, {
            client: requester(seen, routes),
            mintNonce: () => 'follow-up-nonce',
            readStdin: () => Promise.resolve('Address the review comments.\n'),
            stdinIsTty: false,
            write: (text) => output.push(text),
        });
        expect(routes).toEqual(['/api/agent/cloud-agents/send']);
        expect(seen[0]?.body).toEqual({
            workId: work.id,
            instructions: 'Address the review comments.',
            interrupt,
            nonce: 'follow-up-nonce',
        });
        expect(output.join('')).toContain(`Work ID: ${work.id}`);
        expect(output.join('')).toContain('reaches your inbox');
    }
});

test('send rejects missing instructions before accepting work', async () => {
    const seen: AgentApiRequest[] = [];
    await expect(
        runCloudAgentSend(args({ '--work': work.id }), {
            client: requester(seen),
            mintNonce: () => 'unused',
            readStdin: () => Promise.resolve(' '),
            stdinIsTty: false,
            write: () => undefined,
        })
    ).rejects.toThrow(/required on stdin/);
    expect(seen).toHaveLength(0);
});

test('inspect lists owned work or requests recorded details for one work', async () => {
    for (const workId of [undefined, work.id]) {
        const seen: AgentApiRequest[] = [];
        const output: string[] = [];
        await runCloudAgentInspect(args(workId ? { '--work': workId } : {}), {
            client: requester(seen),
            mintNonce: () => 'unused',
            readStdin: () => Promise.resolve(''),
            stdinIsTty: true,
            write: (text) => output.push(text),
        });
        expect(seen[0]?.query).toEqual({ workId });
        expect(output.join('')).toContain(work.id);
        expect(output.join('')).toContain(work.title);
    }
    expect(CLOUD_AGENT_SUBCOMMANDS.map((command) => command.name)).toEqual([
        'start',
        'send',
        'inspect',
        'stop',
        'cancel',
    ]);
});

test('--report requires --work, with a clear usage error otherwise', async () => {
    const input = args();
    input.flags['--report'] = true;
    await expect(
        runCloudAgentInspect(input, {
            client: requester([]),
            mintNonce: () => 'unused',
            readStdin: () => Promise.resolve(''),
            stdinIsTty: true,
            write: () => undefined,
        })
    ).rejects.toThrow(/--report only works alongside --work/);
});

/** A work carrying one Run with a full report, for the `--report` tests below. */
function requesterWithReport(report: { clipped: boolean; text: string } | null): AgentApiRequester {
    const workWithReport = {
        ...work,
        runs: [
            {
                branches: [],
                createdAt: work.createdAt,
                errorCode: null,
                model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
                providerRunId: 'run_abc',
                rawStatus: 'FINISHED',
                report,
                runId: 'car_1234567890abcdef',
                stall: null,
                startedAt: work.createdAt,
                status: 'completed',
                summary: 'Opened a pull request.',
                terminalAt: work.createdAt,
                usage: null,
            },
        ],
    };
    return {
        request(_path, schema) {
            return Promise.resolve(schema.parse({ works: [workWithReport] }));
        },
    };
}

test('--report prints the full report text, with a clip marker only when clipped', async () => {
    const output: string[] = [];
    const input = args({ '--work': work.id });
    input.flags['--report'] = true;
    await runCloudAgentInspect(input, {
        client: requesterWithReport({ clipped: true, text: 'Opened a pull request.' }),
        mintNonce: () => 'unused',
        readStdin: () => Promise.resolve(''),
        stdinIsTty: true,
        write: (text) => output.push(text),
    });
    expect(output.join('')).toBe('Opened a pull request.\n[clipped at 64 KiB]\n');
});

test('--report fails clearly when the work has no Run carrying a report', async () => {
    const input = args({ '--work': work.id });
    input.flags['--report'] = true;
    await expect(
        runCloudAgentInspect(input, {
            client: requesterWithReport(null),
            mintNonce: () => 'unused',
            readStdin: () => Promise.resolve(''),
            stdinIsTty: true,
            write: () => undefined,
        })
    ).rejects.toThrow(/has no Run with a recorded report/);
});

/** A newer Server's `work`, carrying a field this Computer build predates. */
function requesterFromNewerServer(): AgentApiRequester {
    const workFromNewerServer = { ...work, aFieldThisBuildPredates: 'added by a later release' };
    return {
        request(path, schema, input) {
            const response =
                input?.method !== 'POST'
                    ? { works: [workFromNewerServer] }
                    : path.endsWith('/send')
                      ? {
                            work: workFromNewerServer,
                            runId: 'car_follow_up',
                            idempotent: false,
                            predecessors: [],
                        }
                      : { work: workFromNewerServer };
            return Promise.resolve(schema.parse(response));
        },
    };
}

test('inspect and send read a newer Server response carrying a field this Computer build predates', async () => {
    const inspectOutput: string[] = [];
    await runCloudAgentInspect(args({ '--work': work.id }), {
        client: requesterFromNewerServer(),
        mintNonce: () => 'unused',
        readStdin: () => Promise.resolve(''),
        stdinIsTty: true,
        write: (text) => inspectOutput.push(text),
    });
    expect(inspectOutput.join('')).toContain(work.id);

    const sendOutput: string[] = [];
    await runCloudAgentSend(args({ '--work': work.id }), {
        client: requesterFromNewerServer(),
        mintNonce: () => 'unused',
        readStdin: () => Promise.resolve('Address the review comments.\n'),
        stdinIsTty: false,
        write: (text) => sendOutput.push(text),
    });
    expect(sendOutput.join('')).toContain(`Work ID: ${work.id}`);
});

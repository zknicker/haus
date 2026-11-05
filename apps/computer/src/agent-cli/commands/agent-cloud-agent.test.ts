import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import {
    CLOUD_AGENT_SUBCOMMANDS,
    runCloudAgentCancel,
    runCloudAgentInspect,
    runCloudAgentSend,
} from './agent-cloud-agent.ts';
import { args, requester, work } from './agent-cloud-agent-fixture.ts';

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

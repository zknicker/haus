import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudLaunchJournal } from './launch-journal.ts';
import type { CloudAgentRunRef } from './provider.ts';
import { sendCloudAgentWork } from './send-work.ts';

const work = {
    id: 'caw_1234567890abcdef',
    job: { followUp: null, startedAt: null, state: 'working' },
    agentId: 'agt_test',
    computerId: 'cmp_test',
    chatId: 'cht_test',
    messageId: 'msg_1234567890abcdef',
    provider: 'cursor',
    providerAgentId: 'bc_same',
    providerUrl: null,
    repository: 'zknicker/haus',
    startingRef: 'main',
    title: 'Existing work',
    status: 'queued',
    activity: null,
    runs: [],
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    startedAt: null,
    terminalAt: null,
    createdAt: '2026-09-06T12:00:00.000Z',
    updatedAt: '2026-09-06T12:00:00.000Z',
};

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});

async function fixture(status = 200) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-send-work-'));
    const requests: unknown[] = [];
    const watched: CloudAgentRunRef[] = [];
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            requests.push(await request.json());
            return Response.json(
                status === 200
                    ? { work, runId: 'car_followup12345678', idempotent: false, predecessors: [] }
                    : {
                          code: 'CLOUD_AGENT_NOT_LAUNCHED',
                          message: 'Wait for launch confirmation.',
                      },
                { status }
            );
        },
    });
    cleanup.push(async () => {
        await server.stop(true);
        await rm(dataRoot, { recursive: true, force: true });
    });
    const input = {
        dataRoot,
        runnerToken: 'test-runner',
        serverId: 'srv_test',
        serverOrigin: server.url.origin,
        supervisor: { watch: (ref: CloudAgentRunRef) => watched.push(ref) },
        request: {
            workId: work.id,
            nonce: 'followup',
            instructions: 'Change the same implementation',
            interrupt: false,
        },
    };
    return { input, requests, watched };
}

test('send persists the private prompt before starting its monitor and keeps it off Server', async () => {
    const f = await fixture();
    const receipt = await sendCloudAgentWork(f.input);
    expect(f.requests).toEqual([{ workId: work.id, nonce: 'followup' }]);
    expect(f.watched).toHaveLength(1);
    expect(
        await new CloudLaunchJournal(f.input.dataRoot).read(f.input.serverId, {
            runId: receipt.runId,
            workId: work.id,
            providerAgentId: work.providerAgentId,
            providerRunId: null,
        })
    ).toMatchObject({ phase: 'pending', instructions: f.input.request.instructions });
});

test('send retains the Server rejection code and never starts a monitor', async () => {
    const f = await fixture(409);
    await expect(sendCloudAgentWork(f.input)).rejects.toMatchObject({
        code: 'CLOUD_AGENT_NOT_LAUNCHED',
        message: 'Wait for launch confirmation.',
    });
    expect(f.watched).toEqual([]);
});

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import {
    type AgentExecutionJournalRecordsFrame,
    type RunnerModelConnection,
    type RunnerUpFrame,
    replayExecutionJournalUpload,
} from '@haus/api';
import { connectedRunner } from '../model-connections/connection-test-host.ts';
import { fauxProviderAs } from '../pi/pi-faux-run.ts';
import { cleanups, drainCleanups, type ServerStandIn } from '../runner-test-server.ts';
import { listUnsyncedJournals } from './execution-journal/journal-upload-ledger.ts';

afterEach(drainCleanups);

const xaiKey: RunnerModelConnection = {
    credential: { key: 'xai-connection-key', kind: 'api-key' },
    credentialVersion: 1,
    id: 'mc_xai',
    label: 'xAI key',
    provider: 'xai',
    serverId: 'srv_1',
    webSearch: true,
};

describe('runner execution journal', () => {
    test('a turn journals its tool call and result and settles once the Server stores every frame', async () => {
        const runner = await runnerWithListingTurn();
        await listingTurn(runner.server);

        const frames = journalFrames(runner.server);
        expect(frames.every((frame) => frame.agentId === 'agt_1' && frame.runId === 'run_1')).toBe(
            true
        );
        const document = replayExecutionJournalUpload(
            frames.flatMap((frame) => frame.records.map(({ record }) => record))
        );
        expect(document).toMatchObject({ runId: 'run_1', status: 'completed' });
        expect(document?.tools).toMatchObject([
            {
                final: { output: 'README.md' },
                input: { command: 'ls' },
                status: 'completed',
                toolCallId: 'call_1',
                toolName: 'bash',
            },
        ]);
        expect(frames.at(-1)?.outline).toMatchObject({ runId: 'run_1', status: 'completed' });
        expect(await unsynced(runner.dataDir)).toEqual(['run_1']);

        acknowledge(runner.server, frames);
        runner.server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux' });
        await runner.server.frame('ack');
        await runner.server.frame('ack');
        await runner.journal.drained();
        expect(await unsynced(runner.dataDir)).toEqual([]);
    });

    test('a run the Server never acknowledged uploads whole from disk after a runner restart', async () => {
        const dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-journal-'));
        cleanups.push(() => rm(dataDir, { force: true, recursive: true }));
        const first = await runnerWithListingTurn(dataDir);
        await listingTurn(first.server);
        await first.close();

        const restarted = await connectedRunner(
            fauxProviderAs('xai', xaiProvider().auth, ['grok-faux']).provider,
            { dataDir }
        );
        const resent = await restarted.server.frame('agent-execution-journal-records');
        if (!isJournalFrame(resent)) {
            throw new Error('Expected a journal frame.');
        }
        expect(resent.records[0]?.record).toMatchObject({
            document: { runId: 'run_1', status: 'completed' },
            type: 'open',
        });
        expect(
            replayExecutionJournalUpload(resent.records.map(({ record }) => record))
        ).toMatchObject({
            status: 'completed',
            tools: [{ status: 'completed', toolCallId: 'call_1' }],
        });
        expect(resent.outline).toMatchObject({ runId: 'run_1', status: 'completed' });
    });
});

async function runnerWithListingTurn(dataDir?: string) {
    const faux = fauxProviderAs('xai', xaiProvider().auth, ['grok-faux']);
    faux.core.setResponses([
        fauxAssistantMessage([fauxToolCall('bash', { command: 'ls' }, { id: 'call_1' })], {
            stopReason: 'toolUse',
        }),
        fauxAssistantMessage([fauxText('Listed.')]),
    ]);
    const runner = await connectedRunner(faux.provider, dataDir ? { dataDir } : {});
    runner.server.send({ connections: [xaiKey], type: 'runner-model-connections' });
    return runner;
}

async function listingTurn(server: ServerStandIn) {
    server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux' });
    expect(await server.frame('invocation-request')).toMatchObject({ toolCallId: 'call_1' });
    server.answer({
        outcome: 'completed',
        output: { kind: 'text', text: 'README.md' },
        runId: 'run_1',
        seq: 0,
        toolCallId: 'call_1',
    });
    expect(await server.frame('turn')).toMatchObject({ runId: 'run_1', status: 'completed' });
}

function journalFrames(server: ServerStandIn) {
    return server.received.filter(isJournalFrame);
}

function isJournalFrame(frame: RunnerUpFrame): frame is AgentExecutionJournalRecordsFrame {
    return frame.type === 'agent-execution-journal-records';
}

function acknowledge(server: ServerStandIn, frames: readonly AgentExecutionJournalRecordsFrame[]) {
    for (const frame of frames) {
        server.send({
            agentId: frame.agentId,
            runId: frame.runId,
            status: 'stored',
            throughSequence: frame.records.at(-1)?.sequence ?? 0,
            type: 'agent-execution-journal-ack',
        });
    }
}

async function unsynced(dataDir: string) {
    const journals = await listUnsyncedJournals({ agentsDir: join(dataDir, 'agents'), since: 0 });
    return journals.map((journal) => journal.runId);
}

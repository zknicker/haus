import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentExecutionJournalRecordsFrame, replayExecutionJournalUpload } from '@haus/api';
import { createComputerExecutionJournal } from '@haus/computer/src/harness/execution-journal.ts';
import { openDispatchLedger } from '../dispatch/ledger.ts';
import { createJournalUploads } from '../journal/journal-uploads.ts';
import { unknownDispatchMessage } from '../journal/recovered-journal.ts';
import { createConnectionBook } from '../model-connections/connection-book.ts';
import type { RunnerLink } from '../run-context.ts';
import {
    cleanups,
    drainCleanups,
    runnerToken,
    type ServerStandIn,
    serverStandIn,
} from '../runner-test-server.ts';
import { openServerLink } from '../server-link.ts';
import { runRecords } from './run-records.ts';
import { createTurnHost } from './turn-host.ts';

afterEach(drainCleanups);

const heldRelaunch = { '/api/agent/profile': () => new Promise<Response>(() => undefined) };

describe('runner crash recovery', () => {
    test('a run a crashed runner left accepted settles failed, counts its dispatch as output, and never relaunches', async () => {
        const server = serverStandIn(heldRelaunch);
        const dataDir = await crashedRunner([{ runId: 'run_1', seq: 0, toolCallId: 'toolu_1' }]);
        await restartRunner(server, dataDir);

        server.start();

        expect(await server.frame('ack')).toEqual({
            agentId: 'agt_1',
            runId: 'run_1',
            type: 'ack',
        });
        expect(await server.frame('turn')).toMatchObject({
            failureCode: 'runner-crashed',
            failureKind: 'unknown',
            messageCount: 0,
            outputProduced: true,
            runId: 'run_1',
            status: 'failed',
            summary: 'The Agent turn did not complete.',
        });
        expect(server.requests).toEqual([]);
        const settledAt = Date.now();
        const later = (hours: number) =>
            openDispatchLedger(dataDir, () => new Date(settledAt + hours * 60 * 60 * 1000));
        expect(await later(23).prune()).toBe(0);
        expect(await later(25).prune()).toBe(1);
    });

    test('a crashed run with no dispatch reports no output so the Server requeues its inbox', async () => {
        const server = serverStandIn(heldRelaunch);
        const dataDir = await crashedRunner([]);
        await restartRunner(server, dataDir);

        server.start();

        expect(await server.frame('turn')).toMatchObject({
            failureCode: 'runner-crashed',
            outputProduced: false,
            runId: 'run_1',
            status: 'failed',
        });
        expect(server.requests).toEqual([]);
    });

    test('a dispatch left accepted is journaled unknown on its tool call and uploaded on connect', async () => {
        const server = serverStandIn(heldRelaunch);
        const dataDir = await crashedRunner([{ runId: 'run_1', seq: 0, toolCallId: 'toolu_1' }]);
        const midTurn = await createComputerExecutionJournal({
            agentRoot: join(dataDir, 'agents', 'agt_1'),
            runId: 'run_1',
        });
        await midTurn.recordToolCall({
            input: { command: 'haus message send hi' },
            toolCallId: 'toolu_1',
            toolName: 'bash',
        });
        await restartRunner(server, dataDir);

        server.start();
        expect(await server.frame('turn')).toMatchObject({ failureCode: 'runner-crashed' });

        const records = server.received
            .filter(
                (frame): frame is AgentExecutionJournalRecordsFrame =>
                    frame.type === 'agent-execution-journal-records'
            )
            .flatMap((frame) => frame.records.map(({ record }) => record));
        const document = replayExecutionJournalUpload(records);
        expect(document).toMatchObject({
            error: { message: 'The runner stopped while the turn was running.' },
            runId: 'run_1',
            status: 'failed',
        });
        expect(document?.tools).toMatchObject([
            {
                error: {
                    dispatches: ['run_1:toolu_1:0'],
                    message: unknownDispatchMessage,
                    outcome: 'unknown',
                },
                status: 'failed',
                toolCallId: 'toolu_1',
                toolName: 'bash',
            },
        ]);
    });
});

async function crashedRunner(dispatches: { runId: string; seq: number; toolCallId: string }[]) {
    const dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-crash-'));
    cleanups.push(() => rm(dataDir, { force: true, recursive: true }));
    await runRecords(join(dataDir, 'agents', 'agt_1', 'runtime'), 'run_1').accepted();
    const ledger = openDispatchLedger(dataDir);
    for (const key of dispatches) {
        await ledger.accept('agt_1', key, 'agent-api');
    }
    return dataDir;
}

async function restartRunner(server: ServerStandIn, dataDir: string) {
    const ledger = openDispatchLedger(dataDir);
    let attached: ReturnType<typeof openServerLink> | null = null;
    const link: RunnerLink = { send: (frame) => attached?.link.send(frame) };
    const book = createConnectionBook();
    const journal = createJournalUploads({
        dataDir,
        environment: {},
        log: () => undefined,
        runnerToken,
    });
    const turnHost = createTurnHost({
        book,
        config: { dataDir, maxWarm: 1 },
        journal,
        ledger,
        link,
        log: () => undefined,
    });
    await turnHost.recover(await ledger.recover());
    attached = openServerLink({
        book,
        config: { runnerToken, serverUrl: server.url },
        journal,
        ledger,
        log: () => undefined,
        turnHost,
    });
    cleanups.push(() => {
        attached?.close();
        turnHost.close();
    });
    await attached.ready;
    await server.frame('runner-inventory');
}

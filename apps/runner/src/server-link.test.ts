import { afterEach, describe, expect, test } from 'bun:test';
import { invocationGraceMs, invocationRunnerMarginMs } from '@haus/api';
import { openDispatchLedger } from './dispatch/ledger.ts';
import { manualClock } from './manual-clock.ts';
import { runnerModelCatalog } from './model-catalog.ts';
import {
    attachRunner,
    drainCleanups,
    live,
    runCredential,
    serverStandIn,
} from './runner-test-server.ts';

afterEach(drainCleanups);

describe('runner server link', () => {
    test('attaches, reports its harnesses, and runs a start through machine, refused, and lone haus tools', async () => {
        const server = serverStandIn();
        const runner = await attachRunner(server);
        expect(await server.frame('runner-inventory')).toEqual({
            harnesses: ['claude-agent-sdk', 'pi-durable'],
            runtimes: runnerModelCatalog(),
            type: 'runner-inventory',
        });
        server.start({ modelConnectionId: 'mc_claude', reasoningEffort: 'xhigh' });
        const run = await runner.host.started;
        expect(run.authority).toEqual({
            agentId: 'agt_1',
            runCredential,
            runId: 'run_1',
            serverUrl: server.url,
            traceparent: run.trace.traceparent,
        });
        expect(run.reasoningEffort).toBe('xhigh');
        expect(run.modelConnectionId).toBe('mc_claude');

        const machine = run.tools.bash('toolu_1', { command: 'ls -la', timeout: 900_000 }, live());
        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { command: 'ls -la', kind: 'bash' },
            runId: 'run_1',
            seq: 0,
            timeoutMs: 600_000,
            toolCallId: 'toolu_1',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'offline', runId: 'run_1', seq: 0, toolCallId: 'toolu_1' });
        expect(await machine).toEqual({
            content: [
                {
                    text: 'The machine is offline. Nothing ran. `haus` and `execute` still work.\nThe timeout was clamped to the 600 s maximum.',
                    type: 'text',
                },
            ],
            invocation: 'offline',
            isError: true,
        });

        expect(
            await run.tools.bash('toolu_2', { command: 'haus message check | head' }, live())
        ).toEqual({
            content: [
                {
                    text: 'Error: haus must run as its own command, not inside a pipeline, list, substitution, or redirection, and with literal arguments.\nCode: HAUS_NOT_ALONE\nNext action: run `haus` as its own command.',
                    type: 'text',
                },
            ],
            isError: true,
        });

        const sent = await run.tools.bash(
            'toolu_3',
            { command: "haus message send --target '#all' <<'EOF'\nShip it at $5\nEOF" },
            live()
        );
        expect(server.requests).toEqual([
            {
                authorization: `Bearer ${runCredential}`,
                body: { content: 'Ship it at $5\n', target: '#all' },
                dispatchId: 'run_1:toolu_3:0',
                method: 'POST',
                path: '/api/agent/messages/send',
            },
        ]);
        expect(sent).toEqual({
            content: [
                {
                    text: 'Message sent to #all. Message ID: msg_sent\nPosted at the top of #all; members see it in the channel.\n\n--- New messages you may have missed ---\n[target=#all msg=new time=2026-11-19 12:00:00 UTC type=human] operator: body-msg_new',
                    type: 'text',
                },
            ],
            isError: false,
        });
        expect(await run.tools.settle()).toEqual({
            sendCount: 1,
            sends: [{ atMs: expect.any(Number), chatId: 'chat_messages', done: false }],
            servedAutomationIds: [],
            visibleMessages: [{ chatId: 'chat_messages', id: 'msg_new', sequence: 8 }],
        });
        expect(server.attested).toEqual([
            [{ chatId: 'chat_messages', id: 'msg_new', sequence: 8 }],
        ]);

        const ledger = openDispatchLedger(runner.dataDir);
        expect(
            await ledger.read('agt_1', { runId: 'run_1', seq: 0, toolCallId: 'toolu_1' })
        ).toMatchObject({ kind: 'invocation', outcome: 'offline', state: 'finished' });
        expect(
            await ledger.read('agt_1', { runId: 'run_1', seq: 0, toolCallId: 'toolu_3' })
        ).toMatchObject({ kind: 'agent-api', outcome: 'completed', state: 'finished' });
    });

    test('a start the Server resends after a reconnect reattaches the running run, and its open invocation still resolves', async () => {
        const server = serverStandIn();
        const runner = await attachRunner(server);
        await server.frame('runner-inventory');
        server.start();
        const run = await runner.host.started;
        const pending = run.tools.bash('toolu_1', { command: 'make build' }, live());
        await server.frame('invocation-request');

        server.disconnect();
        await server.frame('runner-inventory');
        server.start();
        server.answer({
            exitCode: 0,
            outcome: 'completed',
            output: { kind: 'text', text: 'built' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });

        expect(await pending).toEqual({
            content: [{ text: 'built', type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
        expect(await server.frame('ack')).toEqual({
            agentId: 'agt_1',
            runId: 'run_1',
            type: 'ack',
        });
        expect(runner.host.starts).toEqual(['run_1']);
    });

    test('an invocation the Server never answers resolves unknown at its timeout plus the grace and margin', async () => {
        const timers = manualClock();
        const server = serverStandIn();
        const runner = await attachRunner(server, { invocationClock: timers.clock });
        await server.frame('runner-inventory');
        server.start();
        const run = await runner.host.started;

        const pending = run.tools.bash('toolu_1', { command: 'make build', timeout: 1 }, live());

        expect(await server.frame('invocation-request')).toMatchObject({ timeoutMs: 1 });
        timers.advance(1 + invocationGraceMs + invocationRunnerMarginMs);
        expect(await pending).toEqual({
            content: [
                {
                    text: 'The machine lost this command before it reported a result. It may or may not have run; check its effects before running it again.',
                    type: 'text',
                },
            ],
            invocation: 'unknown',
            isError: true,
        });
        expect(
            await openDispatchLedger(runner.dataDir).read('agt_1', {
                runId: 'run_1',
                seq: 0,
                toolCallId: 'toolu_1',
            })
        ).toMatchObject({ kind: 'invocation', outcome: 'unknown', state: 'finished' });
    });

    test('stop cancels the run’s open invocation and stops the turn', async () => {
        const server = serverStandIn();
        const runner = await attachRunner(server);
        await server.frame('runner-inventory');
        server.start();
        const run = await runner.host.started;
        const pending = run.tools.bash('toolu_9', { command: 'sleep 30' }, live());
        await server.frame('invocation-request');

        server.send({ agentId: 'agt_1', runId: 'run_1', type: 'stop' });

        expect(await server.frame('invocation-cancel')).toEqual({
            agentId: 'agt_1',
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_9',
            type: 'invocation-cancel',
        });
        expect(await runner.host.stopped).toEqual({ agentId: 'agt_1', runId: 'run_1' });
        server.answer({
            outcome: 'cancelled',
            output: { kind: 'text', text: 'partial line' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_9',
        });
        expect(await pending).toEqual({
            content: [{ text: 'partial line\nCancelled before it finished.', type: 'text' }],
            invocation: 'cancelled',
            isError: true,
        });
    });

    test('server runtime settings reach the turn host in order, and an idle compaction report goes up', async () => {
        const server = serverStandIn();
        const runner = await attachRunner(server);
        await server.frame('runner-inventory');
        server.send({ idleCompactionServerIds: ['srv_1'], type: 'runner-runtime-settings' });
        server.send({ idleCompactionServerIds: [], type: 'runner-runtime-settings' });
        server.start();
        await runner.host.started;
        expect(runner.host.settings).toEqual([['srv_1'], []]);

        const report = {
            agentId: 'agt_1',
            compactionId: 'compaction-0f3a9c1e-runner',
            costUsd: null,
            endedAt: '2026-11-20T10:01:00.000Z',
            modelId: 'claude-opus-4-5',
            runtimeId: 'claude-agent-sdk',
            startedAt: '2026-11-20T10:00:00.000Z',
            tokenUsage: null,
            tokensAfter: 30_000,
            tokensBefore: 400_000,
            type: 'agent-idle-compaction',
        } as const;
        runner.link.send(report);
        expect(await server.frame('agent-idle-compaction')).toEqual(report);
    });

    test('restart, resets, and retire reach the turn host with the right scope, in order', async () => {
        const server = serverStandIn();
        const runner = await attachRunner(server);
        await server.frame('runner-inventory');
        server.send({ agentId: 'agt_1', type: 'agent-restart' });
        server.send({
            agentId: 'agt_1',
            kind: 'session',
            sessionGeneration: 2,
            type: 'agent-reset',
        });
        server.send({ agentId: 'agt_1', kind: 'full', sessionGeneration: 3, type: 'agent-reset' });
        server.send({ agentId: 'agt_2', type: 'agent-retire' });
        server.start();
        await runner.host.started;

        expect(runner.host.resets).toEqual([
            { agentId: 'agt_1', scope: 'restart' },
            { agentId: 'agt_1', scope: 'session', sessionGeneration: 2 },
            { agentId: 'agt_1', scope: 'full', sessionGeneration: 3 },
            { agentId: 'agt_2', scope: 'retire' },
        ]);
    });
});

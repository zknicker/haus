import { join } from 'node:path';
import { type AgentTurnSummary, agentPathSegment } from '@haus/api';
import type { RunnerConfig } from '../config.ts';
import type { DispatchLedger, RecoveredDispatch } from '../dispatch/ledger.ts';
import type { JournalUploads } from '../journal/journal-uploads.ts';
import type { RunJournal } from '../journal/run-journal.ts';
import { createTurnJournals } from '../journal/turn-journals.ts';
import {
    type ConnectionBook,
    connectionForRun,
    missingConnectionMessage,
} from '../model-connections/connection-book.ts';
import type { CapacityReader } from '../model-connections/connection-capacity.ts';
import { createConnectionStatus } from '../model-connections/connection-status.ts';
import type { RunnerLink, RunStart, TurnHost } from '../run-context.ts';
import { createHarnesses } from './harnesses.ts';
import { inboxStore } from './inbox-store.ts';
import { createRunActivity } from './run-activity.ts';
import { runRecords } from './run-records.ts';
import { type NoticeSink, type RunTurnResult, runTurn } from './run-turn.ts';
import type { RuntimeDriverFactory } from './runtime-driver.ts';
import { RunnerCrashedError, SessionFailureError } from './turn-failure.ts';
import { turnSummary } from './turn-summary.ts';
import { unknownToolCalls } from './unknown-tool-calls.ts';

interface ActiveRun {
    readonly controller: AbortController;
    readonly runId: string;
    sink: NoticeSink | null;
}

export function createTurnHost(input: {
    book: ConnectionBook;
    capacity?: CapacityReader;
    config: Pick<RunnerConfig, 'dataDir' | 'maxWarm'>;
    journal?: JournalUploads;
    ledger: DispatchLedger;
    link: RunnerLink;
    log?: (line: string) => void;
}) {
    const log = input.log ?? ((line: string) => process.stderr.write(`${line}\n`));
    const harnesses = createHarnesses({
        book: input.book,
        link: input.link,
        log,
        maxWarm: input.config.maxWarm,
    });
    const host = createTurnHostWith({
        book: input.book,
        ...(input.capacity ? { capacity: input.capacity } : {}),
        dataDir: input.config.dataDir,
        factory: harnesses.factory,
        ...(input.journal ? { journal: input.journal } : {}),
        ledger: input.ledger,
        link: input.link,
        log,
    });
    return { ...host, close: harnesses.close };
}

export function createTurnHostWith(input: {
    book: ConnectionBook;
    capacity?: CapacityReader;
    dataDir: string;
    factory: RuntimeDriverFactory;
    journal?: JournalUploads;
    ledger: DispatchLedger;
    link: RunnerLink;
    log: (line: string) => void;
}) {
    const status = createConnectionStatus(input.link);
    const active = new Map<string, ActiveRun>();
    const queues = new Map<string, Promise<unknown>>();
    const paths = (agentId: string) => {
        const agentDir = join(input.dataDir, 'agents', agentPathSegment(agentId));
        return { agentDir, runtimeDir: join(agentDir, 'runtime') };
    };
    const journals = createTurnJournals({
        agentDirOf: (agentId) => paths(agentId).agentDir,
        log: input.log,
        ...(input.journal ? { uploads: input.journal } : {}),
    });

    const execute = async (run: RunStart) => {
        const { start } = run;
        const { agentDir, runtimeDir } = paths(start.agentId);
        const records = runRecords(runtimeDir, start.runId);
        const marker = await records.marker();
        input.link.send({ agentId: start.agentId, runId: start.runId, type: 'ack' });
        if (marker?.status === 'settled') {
            await run.tools.settle();
            await input.ledger.settled(start.agentId, start.runId);
            input.link.send(marker.summary);
            return;
        }
        if (marker?.status === 'accepted') {
            await settleCrashed(run, records, runtimeDir);
            return;
        }
        const store = inboxStore(runtimeDir);
        await store.acceptRun(start);
        await records.accepted();
        const startedAt = new Date().toISOString();
        const current: ActiveRun = {
            controller: new AbortController(),
            runId: start.runId,
            sink: null,
        };
        active.set(start.agentId, current);
        const activity = createRunActivity({
            agentId: start.agentId,
            now: () => Date.now(),
            runId: start.runId,
            send: (frame) => input.link.send(frame),
        });
        const connection = connectionForRun(input.book, run.modelConnectionId, start.modelId);
        let journal: RunJournal | null = null;
        let result: RunTurnResult;
        try {
            journal = await journals.open(start.agentId, start.runId);
            if (!connection) {
                throw new SessionFailureError({
                    category: 'access',
                    severity: 'error',
                    title: missingConnectionMessage(start.modelId),
                    type: 'session-failure',
                });
            }
            result = await runTurn({
                activity,
                agentDir,
                authority: run.authority,
                connection,
                factory: input.factory,
                journal,
                link: input.link,
                log: input.log,
                reasoningEffort: run.reasoningEffort,
                records,
                registerNoticeSink: (sink) => {
                    current.sink = sink;
                    return () => {
                        current.sink = null;
                    };
                },
                runtimeDir,
                signal: current.controller.signal,
                start,
                store,
                tools: run.tools,
            });
        } catch (error) {
            result = { failure: error, status: 'failed', tokenUsage: null };
        } finally {
            if (active.get(start.agentId) === current) {
                active.delete(start.agentId);
            }
        }
        activity.close(result.status === 'completed' ? 'completed' : result.status);
        await journals.close(journal, start.runId, result);
        if (connection && status.afterTurn(connection, result) === 'failed') {
            void input.capacity?.afterAccessFailure(connection.id);
        }
        const visibility = await run.tools.settle();
        await store.consume([
            ...visibility.visibleMessages.map((message) => message.id),
            ...visibility.servedAutomationIds,
        ]);
        const visible = new Map(
            [...(await records.visible()), ...visibility.visibleMessages].map((message) => [
                message.id,
                message,
            ])
        );
        const summary = turnSummary({
            activity: activity.snapshot(),
            dispatched: await input.ledger.dispatchedIn(start.agentId, start.runId),
            endedAt: new Date().toISOString(),
            result,
            sendCount: visibility.sendCount,
            start,
            startedAt,
            visibleMessages: [...visible.values()],
        });
        await settle(start, records, summary);
    };

    const settle = async (
        start: RunStart['start'],
        records: ReturnType<typeof runRecords>,
        summary: AgentTurnSummary
    ) => {
        await records.settled(summary);
        await input.ledger.settled(start.agentId, start.runId);
        input.link.send(summary);
    };

    const settleCrashed = async (
        run: RunStart,
        records: ReturnType<typeof runRecords>,
        runtimeDir: string
    ) => {
        const { start } = run;
        await run.tools.settle();
        await journals.crashed(start.agentId, start.runId);
        const visible = await records.visible();
        await inboxStore(runtimeDir).consume(visible.map((message) => message.id));
        const at = new Date().toISOString();
        const summary = turnSummary({
            activity: { operations: [] },
            dispatched: await input.ledger.dispatchedIn(start.agentId, start.runId),
            endedAt: at,
            result: { failure: new RunnerCrashedError(), status: 'failed', tokenUsage: null },
            sendCount: 0,
            start,
            startedAt: at,
            visibleMessages: visible,
        });
        await settle(start, records, summary);
    };

    const recover = async (dispatches: readonly RecoveredDispatch[]) => {
        const byAgent = new Map<string, string[]>();
        for (const { agentId, key } of dispatches) {
            input.log(
                `Runner recovered dispatch ${key.runId}:${key.toolCallId}:${key.seq} for ${agentId} as unknown.`
            );
            byAgent.set(agentId, [...(byAgent.get(agentId) ?? []), key.toolCallId]);
        }
        for (const [agentId, toolCallIds] of byAgent) {
            await unknownToolCalls(paths(agentId).runtimeDir).add(toolCallIds);
        }
        await journals.recovered(dispatches);
    };

    const host: TurnHost = {
        async notice(notice) {
            const { runtimeDir } = paths(notice.agentId);
            const receipt = {
                runId: notice.runId,
                workIds: [
                    ...notice.inbox.map((item) => item.id),
                    ...(notice.taskAssignments?.ids ?? []),
                ],
            };
            const text = await inboxStore(runtimeDir).replace(notice, receipt);
            const run = active.get(notice.agentId);
            if (!(text && run?.sink && run.runId === notice.runId)) {
                return;
            }
            if (await run.sink(text)) {
                input.link.send({
                    agentId: notice.agentId,
                    runId: receipt.runId,
                    type: 'notice-ack',
                    workIds: receipt.workIds,
                });
            }
        },
        start(run) {
            const previous = queues.get(run.start.agentId) ?? Promise.resolve();
            const next = previous.then(() => execute(run));
            queues.set(
                run.start.agentId,
                next.catch(() => undefined)
            );
            return next;
        },
        stop(agentId, runId) {
            const run = active.get(agentId);
            if (run?.runId === runId) {
                run.controller.abort();
            }
            return Promise.resolve();
        },
    };
    return { ...host, recover };
}

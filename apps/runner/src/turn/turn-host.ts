import { join } from 'node:path';
import { type AgentTurnSummary, agentPathSegment, noticeReceipt } from '@haus/api';
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
import { agentQueues } from './agent-queues.ts';
import { agentSessions } from './agent-sessions.ts';
import { finishTurn } from './finish-turn.ts';
import { createHarnesses } from './harnesses.ts';
import { idleCompactionGate } from './idle-compaction-gate.ts';
import { inboxStore } from './inbox-store.ts';
import { recoverDispatches } from './recovered-dispatches.ts';
import { createRunActivity } from './run-activity.ts';
import { crashedRunSummary, skipReplacedRun } from './run-endings.ts';
import { runRecords } from './run-records.ts';
import { type NoticeSink, type RunTurnResult, runTurn } from './run-turn.ts';
import type { RuntimeDriverFactory } from './runtime-driver.ts';
import { SessionFailureError } from './turn-failure.ts';
import { startTurnTimings } from './turn-timings.ts';

interface ActiveRun {
    readonly controller: AbortController;
    readonly generation: number;
    readonly runId: string;
    sink: NoticeSink | null;
}

export function createTurnHost(input: {
    book: ConnectionBook;
    capacity?: CapacityReader;
    config: Pick<RunnerConfig, 'dataDir' | 'maxClaude' | 'maxWarm'>;
    journal?: JournalUploads;
    ledger: DispatchLedger;
    link: RunnerLink;
    log?: (line: string) => void;
}) {
    const log = input.log ?? ((line: string) => process.stderr.write(`${line}\n`));
    const harnesses = createHarnesses({
        agentBusy: (agentId) => host.busy(agentId),
        book: input.book,
        ...(input.capacity ? { capacity: input.capacity } : {}),
        ...(input.journal ? { journal: input.journal } : {}),
        link: input.link,
        log,
        maxClaude: input.config.maxClaude,
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
        release: harnesses.release,
        setIdleCompaction: harnesses.setIdleCompaction,
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
    release: (agentId: string) => unknown;
    setIdleCompaction?: (gate: (agentId: string) => boolean) => void;
}) {
    const status = createConnectionStatus(input.link);
    const active = new Map<string, ActiveRun>();
    const gate = idleCompactionGate();
    const { busy, enqueue } = agentQueues();
    const paths = (agentId: string) => {
        const agentDir = join(input.dataDir, 'agents', agentPathSegment(agentId));
        return { agentDir, runtimeDir: join(agentDir, 'runtime') };
    };
    const journals = createTurnJournals({
        agentDirOf: (agentId) => paths(agentId).agentDir,
        log: input.log,
        ...(input.journal ? { uploads: input.journal } : {}),
    });

    const sessions = agentSessions({
        agentDir: (agentId) => paths(agentId).agentDir,
        dataDir: input.dataDir,
        release: input.release,
    });

    const execute = async (run: RunStart, restartEpoch: number) => {
        const current: ActiveRun = {
            controller: new AbortController(),
            generation: run.start.sessionGeneration,
            runId: run.start.runId,
            sink: null,
        };
        active.set(run.start.agentId, current);
        try {
            await executeRun(run, current, restartEpoch);
        } finally {
            if (active.get(run.start.agentId) === current) {
                active.delete(run.start.agentId);
            }
        }
    };

    const executeRun = async (run: RunStart, current: ActiveRun, restartEpoch: number) => {
        const { start } = run;
        if (!(await sessions.enter(run, restartEpoch))) {
            await skipReplacedRun(run, input);
            return;
        }
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
        const timings = startTurnTimings();
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
                timings,
                tools: run.tools,
            });
        } catch (error) {
            result = { failure: error, status: 'failed', tokenUsage: null };
        }
        await finishTurn(
            { activity, connection, journal, records, result, run, startedAt, store, timings },
            {
                ...(input.capacity ? { capacity: input.capacity } : {}),
                journals,
                ledger: input.ledger,
                link: input.link,
                settle,
                status,
            }
        );
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
        await run.tools.settle();
        await journals.crashed(run.start.agentId, run.start.runId);
        const summary = await crashedRunSummary(run.start, records, runtimeDir, input.ledger);
        await settle(run.start, records, summary);
    };

    const recover = async (dispatches: readonly RecoveredDispatch[]) => {
        await recoverDispatches(dispatches, {
            log: input.log,
            runtimeDir: (agentId) => paths(agentId).runtimeDir,
        });
        await journals.recovered(dispatches);
    };

    const host: TurnHost & { busy(agentId: string): boolean } = {
        busy,
        runtimeSettings(settings) {
            gate.update(settings.idleCompactionServerIds);
            input.setIdleCompaction?.(gate.allows);
        },
        async notice(notice) {
            const { runtimeDir } = paths(notice.agentId);
            const receipt = noticeReceipt(notice);
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
        async resetAgent(agentId, reset) {
            sessions.announce(agentId, reset);
            const run = active.get(agentId);
            if (run && sessions.supersedes(reset, run.generation)) {
                run.controller.abort();
            }
            await enqueue(agentId, () => sessions.apply(agentId, reset));
        },
        start(run) {
            gate.started(run.start.agentId, run.serverId);
            const restartEpoch = sessions.restartEpoch(run.start.agentId);
            return enqueue(run.start.agentId, () => execute(run, restartEpoch));
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

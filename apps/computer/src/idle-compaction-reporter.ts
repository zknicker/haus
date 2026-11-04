import { randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';
import type { AgentIdleCompactionReport } from '@haus/api';
import { Effect } from 'effect';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { journalSinkFor } from './execution-journal-upload/attachment-journal-uploads.ts';
import {
    createComputerExecutionJournal,
    type ExecutionJournalSink,
} from './harness/execution-journal.ts';
import type { IdleCompactionResult } from './runtime/idle-compaction.ts';
import type { IdleCompactionHooks } from './runtime/idle-compaction-scheduler.ts';
import type { WarmIdentity } from './runtime/warm-pool.ts';

export interface IdleCompactionReporterDeps {
    /** A run holds or waits for the Agent, or Haus is resetting or retiring it. */
    agentBusy(agentId: string): boolean;
    /** `<dataRoot>/servers/<serverId>/agents`: an Agent's main session parks at its root here. */
    agentsDir: string;
    /** Test seam for the journal upload; the attached Server's uploader otherwise. */
    journalSink?: typeof journalSinkFor;
    runtime: DaemonRuntime;
    send(frame: AgentIdleCompactionReport): boolean;
    serverId: string;
}

/**
 * The daemon's side of idle compaction. A finished compaction gets its own execution journal
 * (the same `compaction` tool pair a compaction inside a turn writes, which Activity skips) and an
 * `agent-idle-compaction` report the Server records as a completed turn, so Usage counts its
 * tokens. Skips and failures go to telemetry only.
 */
export function createIdleCompactionReporter(
    deps: IdleCompactionReporterDeps
): IdleCompactionHooks {
    const agentOf = (key: string): string | null => {
        const agentId = basename(key);
        // A throwaway (heartbeat) session parks at `<agentRoot>#<session>`: never compacted.
        return dirname(key) === deps.agentsDir && !agentId.includes('#') ? agentId : null;
    };
    const log = (message: string, fields: Record<string, unknown>, level: 'info' | 'warning') =>
        void deps.runtime.runPromise(
            (level === 'info' ? Effect.logInfo(message) : Effect.logWarning(message)).pipe(
                Effect.annotateLogs(fields)
            )
        );
    return {
        busy: (key) => {
            const agentId = agentOf(key);
            return agentId === null || deps.agentBusy(agentId);
        },
        compactable: (key) => agentOf(key) !== null,
        failed: (key, error) =>
            log(
                'An idle compaction failed; the session resumes uncompacted.',
                {
                    agentId: agentOf(key),
                    error: error instanceof Error ? error.message : String(error),
                    event: 'runtime-idle-compaction-failed',
                },
                'warning'
            ),
        report: async (key, identity, result) => {
            const agentId = agentOf(key);
            if (!agentId) {
                return;
            }
            const report = idleCompactionReport(agentId, identity, result);
            try {
                await journalIdleCompaction({
                    agentId,
                    agentRoot: key,
                    report,
                    result,
                    serverId: deps.serverId,
                    sink: deps.journalSink ?? journalSinkFor,
                });
            } catch (error) {
                log(
                    'An idle compaction was not journaled.',
                    {
                        agentId,
                        error: error instanceof Error ? error.message : String(error),
                        event: 'runtime-idle-compaction-journal-failed',
                    },
                    'warning'
                );
            }
            const sent = deps.send(report);
            log(
                'A parked session compacted while idle.',
                {
                    agentId,
                    compactionId: report.compactionId,
                    costUsd: report.costUsd,
                    event: 'runtime-idle-compaction',
                    reported: sent,
                    tokensAfter: report.tokensAfter,
                    tokensBefore: report.tokensBefore,
                },
                'info'
            );
        },
        skipped: (key, reason) =>
            log(
                'An armed idle compaction did not run.',
                { agentId: agentOf(key), event: 'runtime-idle-compaction-skipped', reason },
                'info'
            ),
    };
}

/** The report frame for one compaction; the compaction id also names its journal. */
export function idleCompactionReport(
    agentId: string,
    identity: WarmIdentity,
    result: IdleCompactionResult
): AgentIdleCompactionReport {
    return {
        agentId,
        compactionId: `compaction-${randomUUID()}`,
        costUsd: result.costUsd,
        endedAt: result.endedAt.toISOString(),
        modelId: result.modelId,
        runtimeId: identity.runtimeId,
        startedAt: result.startedAt.toISOString(),
        tokenUsage: result.usage,
        tokensAfter: result.tokensAfter,
        tokensBefore: result.tokensBefore,
        type: 'agent-idle-compaction',
    };
}

/** One journal holding the `compaction` tool pair, exactly as a turn's compaction records it. */
async function journalIdleCompaction(input: {
    agentId: string;
    agentRoot: string;
    report: AgentIdleCompactionReport;
    result: IdleCompactionResult;
    serverId: string;
    sink: (input: {
        agentId: string;
        agentRoot: string;
        runId: string;
        serverId: string;
    }) => Promise<ExecutionJournalSink | undefined>;
}) {
    const { agentRoot, report, result } = input;
    const runId = report.compactionId;
    const journal = await createComputerExecutionJournal(
        { agentRoot, runId },
        await input.sink({ agentId: input.agentId, agentRoot, runId, serverId: input.serverId })
    );
    const toolCallId = `claude-compaction-${randomUUID()}`;
    await journal.recordToolCall({ input: {}, toolCallId, toolName: 'compaction' });
    await journal.recordToolResult({
        isError: false,
        output: {
            trigger: 'idle',
            ...(result.tokensBefore === null ? {} : { tokensBefore: result.tokensBefore }),
            ...(result.tokensAfter === null ? {} : { tokensAfter: result.tokensAfter }),
            ...(result.summary === null ? {} : { summary: result.summary }),
        },
        preliminary: false,
        toolCallId,
        toolName: 'compaction',
    });
    await journal.finish('completed');
}

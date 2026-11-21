import type { AgentIdleCompactionReport } from '@haus/api';
import { journalIdleCompaction } from '../journal/idle-compaction-journal.ts';
import type { JournalUploads } from '../journal/journal-uploads.ts';
import type { RunnerLink } from '../run-context.ts';
import type { HarnessContext } from '../turn/context-snapshot.ts';
import { resetReceiptsAfterCompaction } from '../turn/session-file.ts';
import { reportCompactedContext } from './idle-compaction-context.ts';
import type { IdleCompactionHooks } from './idle-compaction-scheduler.ts';
import type { IdleCompactionOwner, IdleCompactionResult } from './idle-compaction.ts';

export interface CompactedProcess {
    contextUsage(): Promise<HarnessContext>;
    readonly owner: IdleCompactionOwner | null;
}

export function createIdleCompactionReporter(deps: {
    agentBusy(agentId: string): boolean;
    link: RunnerLink;
    log: (line: string) => void;
    uploads?: JournalUploads;
}) {
    const hooks: IdleCompactionHooks<CompactedProcess> = {
        busy: (agentId) => deps.agentBusy(agentId),
        compacted: async (agentId, process) => {
            if (!process.owner) {
                return;
            }
            try {
                await resetReceiptsAfterCompaction(process.owner.agentDir);
            } catch (error) {
                deps.log(
                    `Runner could not reset ${agentId}'s delivery receipts after an idle compaction: ${describe(error)}`
                );
            }
            await reportCompactedContext({
                basis: process.owner.context,
                link: deps.link,
                log: deps.log,
                usage: () => process.contextUsage(),
            });
        },
        failed: (agentId, error) =>
            deps.log(
                `Runner idle compaction failed for ${agentId}; the session resumes uncompacted: ${describe(error)}`
            ),
        report: async (agentId, process, result) => {
            if (!process.owner) {
                return;
            }
            const report = idleCompactionReport(agentId, process.owner.runtimeId, result);
            await journalIdleCompaction({
                agentDir: process.owner.agentDir,
                agentId,
                compactionId: report.compactionId,
                result,
                ...(deps.uploads ? { uploads: deps.uploads } : {}),
            }).catch((error: unknown) =>
                deps.log(
                    `Runner could not journal ${report.compactionId} for ${agentId}: ${describe(error)}`
                )
            );
            deps.link.send(report);
            deps.log(
                `Runner compacted ${agentId} while idle (${report.compactionId}, ${report.tokensBefore} to ${report.tokensAfter} tokens).`
            );
        },
        skipped: (agentId, reason) =>
            deps.log(`Runner idle compaction for ${agentId} did not run: ${reason}.`),
    };
    return hooks;
}

export function idleCompactionReport(
    agentId: string,
    runtimeId: string,
    result: IdleCompactionResult
) {
    const report: AgentIdleCompactionReport = {
        agentId,
        compactionId: `compaction-${crypto.randomUUID()}`,
        costUsd: result.costUsd,
        endedAt: result.endedAt.toISOString(),
        modelId: result.modelId,
        runtimeId,
        startedAt: result.startedAt.toISOString(),
        tokenUsage: result.usage,
        tokensAfter: result.tokensAfter,
        tokensBefore: result.tokensBefore,
        type: 'agent-idle-compaction',
    };
    return report;
}

function describe(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

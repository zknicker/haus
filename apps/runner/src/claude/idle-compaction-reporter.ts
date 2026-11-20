import type { AgentIdleCompactionReport } from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import { resetReceiptsAfterCompaction } from '../turn/session-file.ts';
import type { IdleCompactionHooks } from './idle-compaction-scheduler.ts';
import type { IdleCompactionOwner, IdleCompactionResult } from './idle-compaction.ts';

export function createIdleCompactionReporter(deps: {
    agentBusy(agentId: string): boolean;
    link: RunnerLink;
    log: (line: string) => void;
}) {
    const hooks: IdleCompactionHooks<{ readonly owner: IdleCompactionOwner | null }> = {
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
        },
        failed: (agentId, error) =>
            deps.log(
                `Runner idle compaction failed for ${agentId}; the session resumes uncompacted: ${describe(error)}`
            ),
        report: (agentId, process, result) => {
            if (!process.owner) {
                return Promise.resolve();
            }
            const report = idleCompactionReport(agentId, process.owner.runtimeId, result);
            deps.link.send(report);
            deps.log(
                `Runner compacted ${agentId} while idle (${report.compactionId}, ${report.tokensBefore} to ${report.tokensAfter} tokens).`
            );
            return Promise.resolve();
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

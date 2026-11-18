import { type AgentIdleCompactionReport, agentIdleCompactionReportSchema } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { recordAgentTurnSummary } from './record-agent-turn.ts';

/** Records `frame` when it is an `agent-idle-compaction` report; returns whether it was one. */
export async function ingestAgentIdleCompaction(
    db: HausDatabase,
    computerId: string,
    frame: unknown
): Promise<boolean> {
    const report = agentIdleCompactionReportSchema.safeParse(frame);
    if (!report.success) {
        return false;
    }
    await recordAgentIdleCompaction(db, computerId, report.data);
    return true;
}

/**
 * Records an idle compaction as the Agent's own completed turn under its compaction id: it
 * settles no delivery (no run asked for it), but its tokens land in the turn ledger and the daily
 * usage rollup like any turn's, so Usage stays accurate. The same assigned-Computer guard and
 * run-keyed upsert apply, so a resent report changes nothing.
 */
export async function recordAgentIdleCompaction(
    db: HausDatabase,
    computerId: string,
    report: AgentIdleCompactionReport
): Promise<void> {
    await recordAgentTurnSummary(db, computerId, {
        activity: { operations: [] },
        agentId: report.agentId,
        endedAt: report.endedAt,
        messageCount: 0,
        modelId: report.modelId,
        outputProduced: false,
        runId: report.compactionId,
        runtimeId: report.runtimeId,
        startedAt: report.startedAt,
        status: 'completed',
        summary: idleCompactionSummary(report),
        tokenUsage: report.tokenUsage,
        type: 'turn',
        visibleMessages: [],
    });
}

/** "Compacted idle context: 812K → 41K tokens." */
export function idleCompactionSummary(
    report: Pick<AgentIdleCompactionReport, 'tokensAfter' | 'tokensBefore'>
): string {
    const { tokensAfter, tokensBefore } = report;
    if (tokensBefore === null || tokensAfter === null) {
        return 'Compacted idle context.';
    }
    return `Compacted idle context: ${compactTokens(tokensBefore)} → ${compactTokens(tokensAfter)} tokens.`;
}

function compactTokens(tokens: number): string {
    return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens);
}

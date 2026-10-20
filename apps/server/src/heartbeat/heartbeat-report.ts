import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { heartbeatReportDedupeKey } from '../agent-delivery/heartbeat-keys.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { HeartbeatRefusedError } from './heartbeat-errors.ts';
import { readRunSource } from './run-source.ts';

const reportingSources = new Set(['dream', 'heartbeat']);

/**
 * Queues the run's one report as a chatless `heartbeat_report` inbox item for the
 * Agent's main session. Only a heartbeat run (daytime or nightly) may report, and
 * `heartbeat-report:<runId>` makes a second report a refusal. The caller dispatches
 * after the commit when `queued` is true.
 */
export async function fileHeartbeatReport(
    db: HausDatabase,
    delivery: AgentDelivery,
    runner: ResolvedRunner,
    text: string
): Promise<{ queued: true }> {
    const source = await readRunSource(db, runner);
    if (!(source && reportingSources.has(source))) {
        throw new HeartbeatRefusedError(
            'HEARTBEAT_RUN_REQUIRED',
            'haus heartbeat report works only in a heartbeat run.'
        );
    }
    const dedupeKey = heartbeatReportDedupeKey(runner.runId);
    await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const [existing] = await tx
            .select({ id: agentInboxTable.id })
            .from(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.serverId, runner.serverId),
                    eq(agentInboxTable.agentId, runner.agentId),
                    eq(agentInboxTable.dedupeKey, dedupeKey)
                )
            )
            .limit(1);
        if (existing) {
            throw new HeartbeatRefusedError(
                'HEARTBEAT_REPORT_EXISTS',
                'This run already filed its heartbeat report.',
                409
            );
        }
        await delivery.enqueue(tx, {
            agentId: runner.agentId,
            chatId: null,
            content: text,
            dedupeKey,
            serverId: runner.serverId,
            source: 'heartbeat_report',
        });
    });
    return { queued: true };
}

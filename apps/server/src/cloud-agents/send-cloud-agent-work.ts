import { createHash } from 'node:crypto';
import type {
    AgentCloudAgentSendInput,
    AgentCloudAgentSendReceipt,
    ServerDurableEvent,
} from '@haus/api';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { emitWorkEvent } from './apply-cloud-agent-observation.ts';
import { resolveRunModel } from './cloud-agent-model.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { CloudAgentNotLaunchedError, CloudAgentWorkNotFoundError } from './errors.ts';
import { listComputerCloudAgentWork } from './list-computer-cloud-agent-work.ts';

export async function sendCloudAgentWork(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCloudAgentSendInput
): Promise<{ receipt: AgentCloudAgentSendReceipt; event: ServerDurableEvent | null }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const [row] = await tx
            .select({ work: cloudAgentWorkTable })
            .from(cloudAgentWorkTable)
            .innerJoin(
                agentsTable,
                and(
                    eq(agentsTable.serverId, cloudAgentWorkTable.serverId),
                    eq(agentsTable.id, cloudAgentWorkTable.agentId)
                )
            )
            .where(
                and(
                    eq(cloudAgentWorkTable.serverId, runner.serverId),
                    eq(cloudAgentWorkTable.id, input.workId),
                    eq(cloudAgentWorkTable.agentId, runner.agentId),
                    eq(cloudAgentWorkTable.computerId, runner.computerId),
                    eq(agentsTable.computerId, runner.computerId)
                )
            )
            .limit(1);
        if (!row) {
            throw new CloudAgentWorkNotFoundError();
        }
        if (!row.work.providerAgentId) {
            throw new CloudAgentNotLaunchedError();
        }
        const runId = `car_${createHash('sha256')
            .update(JSON.stringify([runner.serverId, input.workId, input.nonce]))
            .digest('base64url')
            .slice(0, 16)}`;
        const [existing] = await tx
            .select()
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, runner.serverId),
                    eq(cloudAgentRunsTable.id, runId)
                )
            )
            .limit(1);
        let event: ServerDurableEvent | null = null;
        if (!existing) {
            const model = await resolveRunModel(tx, {
                computerId: runner.computerId,
                serverId: runner.serverId,
            });
            await tx.insert(cloudAgentRunsTable).values({
                id: runId,
                modelFallbackFrom: model.fallbackFrom,
                modelId: model.id,
                serverId: runner.serverId,
                workId: input.workId,
                createdAt: sql`greatest(clock_timestamp(), (select max(created_at) + interval '1 millisecond' from cloud_agent_runs where server_id = ${runner.serverId} and work_id = ${input.workId}))`,
            });
            await tx
                .update(cloudAgentWorkTable)
                .set({
                    status: 'queued',
                    terminalAt: null,
                    startedAt: null,
                    cancelRequestedAt: null,
                    cancelRequestedByAgentId: null,
                    cancelRequestedByUserId: null,
                    activityAt: null,
                    activitySummary: null,
                    updatedAt: sql`clock_timestamp()`,
                })
                .where(
                    and(
                        eq(cloudAgentWorkTable.serverId, runner.serverId),
                        eq(cloudAgentWorkTable.id, input.workId)
                    )
                );
            event = await emitWorkEvent(tx, {
                chatId: row.work.chatId,
                messageId: row.work.messageId,
                serverId: runner.serverId,
                workId: input.workId,
            });
        }
        const predecessors = await listComputerCloudAgentWork(tx, {
            computerId: runner.computerId,
            serverId: runner.serverId,
            workId: input.workId,
        });
        const earlier = existing
            ? await tx
                  .select({ id: cloudAgentRunsTable.id })
                  .from(cloudAgentRunsTable)
                  .where(
                      and(
                          eq(cloudAgentRunsTable.serverId, runner.serverId),
                          eq(cloudAgentRunsTable.workId, input.workId),
                          lt(cloudAgentRunsTable.createdAt, existing.createdAt)
                      )
                  )
            : null;
        const earlierIds = earlier ? new Set(earlier.map((run) => run.id)) : null;
        const work = await findCloudAgentWork(tx, runner.serverId, input.workId);
        if (!work) {
            throw new CloudAgentWorkNotFoundError();
        }
        return {
            event,
            receipt: {
                work,
                runId,
                idempotent: Boolean(existing),
                predecessors: predecessors.filter(
                    (run) => run.runId !== runId && (!earlierIds || earlierIds.has(run.runId))
                ),
            },
        };
    });
}

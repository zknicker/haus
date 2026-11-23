import type { ComputerSetWorkersInput } from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { clearComputerDefaults } from '../projects/project-worker-defaults.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { withDispatch } from '../workers/dispatch-worker-turns.ts';
import { settleWorkerTurnAsFailed } from '../workers/settle-worker-turn.ts';
import { requireComputerSteward } from './computer-steward.ts';
import { ComputerSetupDeniedError } from './service.ts';

export async function setComputerWorkers(
    db: HausDatabase,
    agentDelivery: AgentDelivery,
    member: HausUser | null,
    input: ComputerSetWorkersInput,
    storage: ArtifactStorage | null
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const computer = await requireComputerSteward(tx, member, input);
        if (
            input.enabled &&
            !computer.workersEnabled &&
            computer.attachedByUserId !== computer.stewardUserId
        ) {
            throw new ComputerSetupDeniedError(
                'Only the person who attached this Computer can turn on "Workers can run here".'
            );
        }
        await tx
            .update(computersTable)
            .set({
                workersEnabled: input.enabled,
                ...(input.limit === undefined ? {} : { workerLimit: input.limit }),
            })
            .where(eq(computersTable.id, computer.id));
        const projectIds = input.enabled
            ? []
            : await clearComputerDefaults(tx, input.serverId, computer.id);
        const queued = input.enabled ? [] : await readQueuedTurns(tx, input.serverId, computer.id);
        const wakes: Array<{ agentId: string; serverId: string }> = [];
        for (const { turnId, worker } of queued) {
            const delivered = await settleWorkerTurnAsFailed(tx, agentDelivery, {
                reason: 'place-off',
                turnId,
                worker,
            });
            if (delivered) {
                wakes.push(delivered);
            }
        }
        const workers = await withDispatch(tx, storage, input.serverId, {
            events: [],
            frames: [],
            wakes,
            workerIds: [...new Set(queued.map(({ worker }) => worker.id))],
        });
        return { computerId: computer.id, projectIds, workers };
    });
}

async function readQueuedTurns(tx: HausDatabase, serverId: string, computerId: string) {
    return await tx
        .select({ turnId: workerTurnsTable.id, worker: workersTable })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, serverId),
                eq(workersTable.place, 'computer'),
                eq(workersTable.carrierComputerId, computerId),
                isNull(workerTurnsTable.dispatchedAt),
                isNull(workerTurnsTable.outcome)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
}

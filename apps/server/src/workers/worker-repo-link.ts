import { inboxWork } from '../agent-delivery/inbox-work.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { workersTable } from '../postgres/schema.ts';
import { settleWorkerTurnAsFailed } from './settle-worker-turn.ts';

type WorkerRow = typeof workersTable.$inferSelect;

export const repoUnlinkedDetail = 'repo-unlinked';

export async function refuseUnlinkedTurn(
    tx: HausDatabase,
    input: { turnId: string; worker: WorkerRow }
) {
    return await settleWorkerTurnAsFailed(tx, inboxWork, {
        detail: repoUnlinkedDetail,
        reason: 'launch-refused',
        turnId: input.turnId,
        worker: input.worker,
    });
}

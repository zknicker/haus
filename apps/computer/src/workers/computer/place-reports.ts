import type { RepoClonesFrame, WorkerHeldFrame } from '@haus/api';
import { heldWorkerWorktrees } from './checkout.ts';
import { listHausClones } from './repos.ts';
import type { ComputerPlaceContext } from './turn-finish.ts';
import type { ComputerTurnRef } from './turn-journal.ts';

interface Partition {
    dataRoot: string;
    serverId: string;
}

export async function sendRepoClones(context: ComputerPlaceContext, partition: Partition) {
    const clones = await listHausClones(partition.dataRoot, partition.serverId).catch(
        (cause: unknown) => {
            logPlaceFailure('worker.repo-clones', null, cause);
            return null;
        }
    );
    if (clones) {
        context.send({ clones, type: 'repo-clones' } satisfies RepoClonesFrame);
    }
}

export async function sendWorkerHeld(context: ComputerPlaceContext, partition: Partition) {
    const held = await heldWorkerWorktrees(
        partition.dataRoot,
        partition.serverId,
        await context.journal.heldWorkerIds()
    );
    context.send({ ...held, type: 'worker-held' } satisfies WorkerHeldFrame);
}

export function logPlaceFailure(operation: string, ref: ComputerTurnRef | null, cause: unknown) {
    console.error('Worker turn did not finish.', {
        cause: cause instanceof Error ? cause.message : String(cause),
        operation,
        turnId: ref?.turnId ?? null,
        workerId: ref?.workerId ?? null,
    });
}

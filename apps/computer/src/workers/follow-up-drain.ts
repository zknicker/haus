import type { WorkerFollowUpDrainFrame } from '@haus/api';
import type { WorkerTurnRef } from './provider.ts';
import type { WorkerHeldFollowUp } from './turn-record.ts';

export function followUpDrainFrame(ref: WorkerTurnRef, followUp: WorkerHeldFollowUp) {
    return {
        instructions: followUp.instructions,
        predecessorTurnIds: followUp.predecessors.map((predecessor) => predecessor.turnId),
        providerAgentId: followUp.providerAgentId,
        providerRunId: null,
        turnId: ref.turnId,
        type: 'worker-follow-up-drain',
        workerId: ref.workerId,
    } satisfies WorkerFollowUpDrainFrame;
}

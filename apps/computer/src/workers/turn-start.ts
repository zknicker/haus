import type { CloudAgentProvider as CloudAgentProviderId, WorkerTurnStartFrame } from '@haus/api';
import { workerLaunchTimeoutMs } from './launch-attempt.ts';
import { launchWorkerTurn } from './launch-turn.ts';
import {
    type CloudAgentProvider,
    type CloudAgentProviderObservation,
    cloudAgentModelSelectionOf,
    type WorkerTurnRef,
} from './provider.ts';
import type { WorkerTurnJournal } from './turn-journal.ts';
import type { WorkerTurnRecordInput } from './turn-record.ts';

export interface WorkerTurnHost {
    acknowledge(turnId: string): void;
    journal: WorkerTurnJournal;
    provider(id: CloudAgentProviderId): CloudAgentProvider;
    report(ref: WorkerTurnRef, observation: CloudAgentProviderObservation): void;
    runLaunch(operation: () => Promise<void>): Promise<void>;
    serverId: string;
    watch(ref: WorkerTurnRef): void;
}

export async function acceptWorkerTurn(frame: WorkerTurnStartFrame, host: WorkerTurnHost) {
    const ref: WorkerTurnRef = {
        provider: frame.place,
        providerAgentId: frame.providerAgentId,
        providerRunId: null,
        turnId: frame.turnId,
        workerId: frame.workerId,
    };
    const accepted = await host.journal.accept(host.serverId, ref, recordOf(frame));
    host.acknowledge(frame.turnId);
    host.watch(ref);
    if (!(accepted && frame.providerAgentId === null)) {
        return;
    }
    host.runLaunch(() =>
        launchWorkerTurn({
            frame,
            journal: host.journal,
            provider: host.provider(frame.place),
            ref,
            serverId: host.serverId,
            supervisor: host,
        })
    ).catch((cause: unknown) => {
        console.error('Worker launch did not finish.', {
            cause: cause instanceof Error ? cause.message : String(cause),
            operation: 'worker.launch',
            provider: ref.provider,
            turnId: ref.turnId,
            workerId: ref.workerId,
        });
    });
}

function recordOf(frame: WorkerTurnStartFrame) {
    if (frame.providerAgentId === null) {
        return {
            deadlineAt: new Date(Date.now() + workerLaunchTimeoutMs).toISOString(),
            phase: 'launching',
            workerId: frame.workerId,
        } satisfies WorkerTurnRecordInput;
    }
    return {
        input: frame.input,
        model: cloudAgentModelSelectionOf(frame.model),
        phase: 'sending',
        predecessorTurnIds: frame.predecessorTurnIds,
        providerAgentId: frame.providerAgentId,
        workerId: frame.workerId,
    } satisfies WorkerTurnRecordInput;
}

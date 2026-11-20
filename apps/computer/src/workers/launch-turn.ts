import type { WorkerLaunchRefusedErrorCode, WorkerTurnStartFrame } from '@haus/api';
import { launchWorker } from './launch-attempt.ts';
import {
    type CloudAgentProvider,
    cloudAgentModelSelectionOf,
    WorkerLaunchRejectedError,
    type WorkerLaunch,
    workerLaunchObservation,
    type WorkerTurnRef,
} from './provider.ts';
import { launchRejection } from './send-delivery.ts';
import type { WorkerTurnJournal } from './turn-journal.ts';
import type { WorkerSupervisor } from './work-runner.ts';

export interface AcceptedLaunch {
    frame: WorkerTurnStartFrame;
    journal: WorkerTurnJournal;
    provider: CloudAgentProvider;
    ref: WorkerTurnRef;
    serverId: string;
    supervisor: Pick<WorkerSupervisor, 'report' | 'watch'>;
}

export async function launchWorkerTurn(accepted: AcceptedLaunch) {
    const { frame, journal, provider, ref, serverId, supervisor } = accepted;
    let launch: WorkerLaunch;
    try {
        launch = await launchWorker(provider, {
            idempotencyKey: frame.turnId,
            instructions: frame.input,
            model: cloudAgentModelSelectionOf(frame.model),
            ref: frame.startingRef,
            repository: frame.repository,
            title: frame.title,
            workerId: frame.workerId,
        });
    } catch (cause) {
        await failLaunch(accepted, cause);
        return;
    }
    if (!(await journal.record(serverId, ref, launch))) {
        await provider.cancel({ ...ref, ...launch }, AbortSignal.timeout(15_000));
        return;
    }
    supervisor.report(ref, workerLaunchObservation(launch, new Date().toISOString()));
    supervisor.watch({
        ...ref,
        providerAgentId: launch.providerAgentId,
        providerRunId: launch.providerRunId,
    });
}

async function failLaunch(accepted: AcceptedLaunch, cause: unknown) {
    const { journal, ref, serverId } = accepted;
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
    const rejection =
        cause instanceof WorkerLaunchRejectedError
            ? launchRejection(cause)
            : {
                  errorCode: timedOut
                      ? ('launch-timeout' satisfies WorkerLaunchRefusedErrorCode)
                      : 'provider-launch-failed',
                  summary: timedOut
                      ? 'The Worker did not start within five minutes.'
                      : 'The Worker launch failed before the provider confirmed it started.',
              };
    console.error('Worker launch failed.', {
        cause: cause instanceof Error ? cause.message : String(cause),
        errorCode: rejection.errorCode,
        operation: 'worker.launch',
        provider: ref.provider,
        turnId: ref.turnId,
        workerId: ref.workerId,
    });
    await journal.reject(serverId, ref, rejection);
    const settled = await journal.read(serverId, ref);
    const failure =
        settled?.phase === 'rejected'
            ? { errorCode: settled.errorCode, summary: settled.summary ?? rejection.summary }
            : rejection;
    accepted.supervisor.report(ref, {
        ...(settled?.phase === 'cancelled'
            ? { summary: 'The Worker launch was stopped.' }
            : failure),
        observedAt: new Date().toISOString(),
        status: settled?.phase === 'cancelled' ? 'cancelled' : 'failed',
    });
}

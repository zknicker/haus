import type { AgentWorkerReceipt } from '@haus/api';
import { launchWorker } from './launch-attempt.ts';
import type { CloudLaunchJournal } from './launch-journal.ts';
import {
    type WorkerLaunch,
    WorkerLaunchRejectedError,
    type CloudAgentProvider,
    type WorkerTurnRef,
    workerLaunchObservation,
    cloudAgentModelSelectionOf,
} from './provider.ts';
import { launchRejection } from './send-delivery.ts';
import type { WorkerSupervisor } from './work-runner.ts';

export interface ClaimedLaunch {
    instructions: string;
    journal: CloudLaunchJournal;
    provider: CloudAgentProvider;
    receipt: AgentWorkerReceipt;
    ref: WorkerTurnRef;
    serverId: string;
    supervisor: Pick<WorkerSupervisor, 'report' | 'watch'>;
}

/**
 * The slow half of a launch, after Server recorded the work and this Computer
 * claimed its Run: the provider call, which for Claude includes cloning the
 * repository. It runs detached from `haus worker start`, so the Agent's
 * command never waits on it. Every outcome lands on the work: the provider's
 * address once it confirms, or a failed or cancelled Run the inbox reports.
 */
export async function launchClaimedWork(claimed: ClaimedLaunch): Promise<void> {
    const { journal, provider, receipt, ref, serverId, supervisor } = claimed;
    const run = receipt.worker.turns.find((candidate) => candidate.turnId === receipt.turnId);
    let launch: WorkerLaunch;
    try {
        launch = await launchWorker(provider, {
            idempotencyKey: receipt.turnId,
            instructions: claimed.instructions,
            // Server resolved the Server's chosen model, or its Auto fallback, onto the Run.
            model: cloudAgentModelSelectionOf(run?.model),
            ref: receipt.worker.startingRef,
            repository: receipt.worker.repository,
            title: receipt.worker.title,
            workerId: receipt.worker.id,
        });
    } catch (cause) {
        await failLaunch(claimed, cause);
        return;
    }
    // Store the address before reporting it. Reconnect can recover a lost socket report.
    if (!(await journal.record(serverId, ref, launch))) {
        // A cancel or deadline settled the Run while the provider launched; its watch reported that.
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

async function failLaunch(claimed: ClaimedLaunch, cause: unknown): Promise<void> {
    const { journal, ref, serverId } = claimed;
    const rejection =
        cause instanceof WorkerLaunchRejectedError
            ? launchRejection(cause)
            : {
                  errorCode:
                      cause instanceof DOMException && cause.name === 'TimeoutError'
                          ? 'launch-timeout'
                          : 'provider-launch-failed',
                  summary:
                      cause instanceof DOMException && cause.name === 'TimeoutError'
                          ? 'The Worker did not start within five minutes.'
                          : 'The Worker launch failed before the provider confirmed it started.',
              };
    // The summary Server sees stays generic; the provider's own words stay in this Computer's log.
    console.error('Worker launch failed.', {
        cause: cause instanceof Error ? cause.message : String(cause),
        errorCode: rejection.errorCode,
        operation: 'worker.launch',
        provider: ref.provider,
        turnId: ref.turnId,
        workerId: ref.workerId,
    });
    await journal.reject(serverId, ref, rejection);
    const stopped = await journal.read(serverId, ref);
    const failure =
        stopped?.phase === 'rejected'
            ? { errorCode: stopped.errorCode, summary: stopped.summary ?? rejection.summary }
            : rejection;
    claimed.supervisor.report(ref, {
        ...(stopped?.phase === 'cancelled'
            ? { summary: 'The Worker launch was stopped.' }
            : failure),
        observedAt: new Date().toISOString(),
        status: stopped?.phase === 'cancelled' ? 'cancelled' : 'failed',
    });
}

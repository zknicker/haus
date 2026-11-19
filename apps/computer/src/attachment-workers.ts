import type { DaemonRuntime } from './daemon-runtime.ts';
import {
    parseCloudAgentCapabilityRequest,
    runCloudAgentCapabilityRequest,
} from './workers/capability-requests.ts';
import {
    parseWorkerFollowUpDrainAck,
    parseWorkerReconcileCommand,
    parseWorkerStopCommand,
    parseWorkerTurnStart,
} from './workers/frames.ts';
import type { WorkerSupervisor } from './workers/work-runner.ts';

/** Adapts attachment frames to the daemon-owned Worker supervisor and provider capability. */
export function handleWorkerFrame(
    frame: unknown,
    options: {
        runtime: DaemonRuntime;
        dataRoot: string;
        workers?: WorkerSupervisor;
        track(operation: Promise<void>): Promise<void>;
        send(frame: unknown): boolean;
        refresh(): Promise<void>;
        onFailure(error: unknown): void;
    }
): boolean {
    const work = workerOperation(frame, options.workers);
    if (work) {
        void options.track((work() ?? Promise.resolve()).catch(options.onFailure));
        return true;
    }
    const capability = parseCloudAgentCapabilityRequest(frame);
    if (!capability) {
        return false;
    }
    void options.track(
        runCloudAgentCapabilityRequest(capability, options.runtime, options.dataRoot)
            .then(async (result) => {
                options.send(result);
                if (capability.operation.kind !== 'get') {
                    await options.refresh();
                }
            })
            .catch(options.onFailure)
    );
    return true;
}

function workerOperation(
    frame: unknown,
    workers: WorkerSupervisor | undefined
): (() => Promise<void> | undefined) | null {
    const start = parseWorkerTurnStart(frame);
    if (start) {
        return () => workers?.accept(start);
    }
    const drained = parseWorkerFollowUpDrainAck(frame);
    if (drained) {
        return () => workers?.forgetDrainedFollowUp(drained.turnId);
    }
    const stop = parseWorkerStopCommand(frame);
    if (stop) {
        return () => workers?.stop(stop);
    }
    const reconcile = parseWorkerReconcileCommand(frame);
    if (reconcile) {
        return () => workers?.reconcile(reconcile.workers);
    }
    return null;
}

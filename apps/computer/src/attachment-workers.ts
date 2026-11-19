import type { DaemonRuntime } from './daemon-runtime.ts';
import {
    parseCloudAgentCapabilityRequest,
    runCloudAgentCapabilityRequest,
} from './workers/capability-requests.ts';
import { parseWorkerStopCommand, parseWorkerReconcileCommand } from './workers/frames.ts';
import type { WorkerSupervisor } from './workers/work-runner.ts';

/** Adapts attachment frames to the daemon-owned Cloud Agent capability. */
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
    const cancel = parseWorkerStopCommand(frame);
    if (cancel) {
        void options.track(
            (options.workers?.cancel(cancel) ?? Promise.resolve()).catch(options.onFailure)
        );
        return true;
    }
    const reconcile = parseWorkerReconcileCommand(frame);
    if (reconcile) {
        void options.track(
            (options.workers?.reconcile(reconcile.workers) ?? Promise.resolve()).catch(
                options.onFailure
            )
        );
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

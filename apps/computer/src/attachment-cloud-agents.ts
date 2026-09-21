import {
    parseCloudAgentCapabilityRequest,
    runCloudAgentCapabilityRequest,
} from './cloud-agents/capability-requests.ts';
import {
    parseCloudAgentCancelCommand,
    parseCloudAgentReconcileCommand,
} from './cloud-agents/frames.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';

/** Adapts attachment frames to the daemon-owned Cloud Agent capability. */
export function handleCloudAgentFrame(
    frame: unknown,
    options: {
        runtime: DaemonRuntime;
        cloudAgents?: CloudAgentWorkSupervisor;
        track(operation: Promise<void>): Promise<void>;
        send(frame: unknown): boolean;
        refresh(): Promise<void>;
        onFailure(error: unknown): void;
    }
): boolean {
    const cancel = parseCloudAgentCancelCommand(frame);
    if (cancel) {
        void options.track(
            (options.cloudAgents?.cancel(cancel) ?? Promise.resolve()).catch(options.onFailure)
        );
        return true;
    }
    const reconcile = parseCloudAgentReconcileCommand(frame);
    if (reconcile) {
        void options.track(
            (options.cloudAgents?.reconcile(reconcile.work) ?? Promise.resolve()).catch(
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
        runCloudAgentCapabilityRequest(capability, options.runtime)
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

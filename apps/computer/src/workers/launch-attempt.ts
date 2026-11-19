import type { WorkerLaunch, CloudAgentProvider, WorkerStartInput } from './provider.ts';

export const workerLaunchTimeoutMs = 5 * 60_000;
const activeLaunches = new Map<string, AbortController>();

/** Bridges the daemon-owned launch deadline and cancellation to the bounded provider call. */
export async function launchWorker(
    provider: CloudAgentProvider,
    input: WorkerStartInput
): Promise<WorkerLaunch> {
    const controller = new AbortController();
    activeLaunches.set(input.idempotencyKey, controller);
    try {
        const launch = await provider.start(input, controller.signal);
        if (controller.signal.aborted) {
            await provider.cancel(
                {
                    ...launch,
                    provider: provider.provider,
                    runId: input.idempotencyKey,
                    workId: input.workId,
                },
                AbortSignal.timeout(15_000)
            );
            throw controller.signal.reason;
        }
        return launch;
    } finally {
        activeLaunches.delete(input.idempotencyKey);
    }
}

export function abortWorkerLaunch(runId: string): void {
    activeLaunches.get(runId)?.abort(new DOMException('Worker launch stopped.', 'AbortError'));
}

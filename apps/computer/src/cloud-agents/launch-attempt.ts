import type { CloudAgentLaunch, CloudAgentProvider, CloudAgentStartInput } from './provider.ts';

export const cloudAgentLaunchTimeoutMs = 5 * 60_000;
const activeLaunches = new Map<string, AbortController>();

/** Bridges the daemon-owned launch deadline and cancellation to the bounded provider call. */
export async function launchCloudAgent(
    provider: CloudAgentProvider,
    input: CloudAgentStartInput
): Promise<CloudAgentLaunch> {
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

export function abortCloudAgentLaunch(runId: string): void {
    activeLaunches.get(runId)?.abort(new DOMException('Cloud agent launch stopped.', 'AbortError'));
}

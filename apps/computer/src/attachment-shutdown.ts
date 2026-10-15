import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import type { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import {
    closeDaemonCoordination,
    closeDaemonRuntimeResources,
    type DaemonRuntime,
} from './daemon-runtime.ts';
import { replayPendingServerPurges } from './server-partition-purge.ts';
import {
    detachServerWorkspaces,
    reclaimStaleWorkspaces,
} from './workspace-volumes/computer-volumes.ts';
import type { WorkspaceDisk } from './workspace-volumes/disk-image.ts';
import { type DetachPacing, shutdownDetachPacing } from './workspace-volumes/volume-detach.ts';

let drain: (() => Promise<void>) | null = null;
const workspaceDetachDeadlineMs = 10_000;

export interface AttachmentPartition {
    dataRoot: string;
    serverId: string;
    /** Test seam; production uses the host disk and the 10s workspace detach deadline. */
    volumes?: { detachDeadlineMs: number; disk: WorkspaceDisk | null; pacing?: DetachPacing };
}

/**
 * Owns one attachment daemon's lifetime: finishes interrupted Server purges and reclaims
 * stale workspace mounts before it runs and, on exit or signal, drains work then detaches
 * the Server's workspace volumes within a deadline.
 */
export async function withAttachmentShutdown<T>(
    work: AttachmentDaemonWork,
    runtime: DaemonRuntime,
    partition: AttachmentPartition,
    run: () => Promise<T>
): Promise<T> {
    const remove = installAttachmentShutdown(() =>
        closeDaemonRuntimeResources(
            () => work.close(),
            async () => {
                disposeServerLaunchHosts(partition.serverId);
                await closeDaemonRuntimeResources(
                    // Sessions and sandbox processes are stopped; release this Server's volumes.
                    () => detachPartitionWorkspaces(partition),
                    () =>
                        closeDaemonRuntimeResources(
                            () =>
                                withShutdownDeadline(
                                    () => closeDaemonCoordination(runtime),
                                    3000,
                                    'Computer coordination shutdown timed out.'
                                ),
                            // Telemetry finalizers own their bounded flush deadlines.
                            () => runtime.dispose()
                        )
                );
            }
        )
    );
    try {
        await reclaimPartitionStorage(partition);
        return await run();
    } finally {
        await work
            .close()
            .then(() => detachPartitionWorkspaces(partition))
            .finally(remove);
    }
}

/** Never blocks attachment start: a failed sweep only leaves what it names. */
async function reclaimPartitionStorage(partition: AttachmentPartition) {
    const volumes = partitionVolumes(partition);
    await replayPendingServerPurges(volumes).catch((error: unknown) => {
        console.error(`Interrupted Server purge replay failed: ${errorMessage(error)}`);
    });
    await reclaimStaleWorkspaces(volumes).catch((error: unknown) => {
        console.error(`Stale workspace reclaim failed: ${errorMessage(error)}`);
    });
}

/**
 * Bounded and never throws, so it cannot hold the exit or replace run()'s result. A
 * volume still busy or unfinished at the deadline stays mounted and reopens next start.
 */
async function detachPartitionWorkspaces(partition: AttachmentPartition) {
    try {
        await withShutdownDeadline(
            () =>
                detachServerWorkspaces({
                    ...partitionVolumes(partition),
                    onBusy: 'fail',
                    pacing: partition.volumes?.pacing ?? shutdownDetachPacing,
                    serverId: partition.serverId,
                }).then(() => undefined),
            partition.volumes?.detachDeadlineMs ?? workspaceDetachDeadlineMs,
            'Workspace volume detach timed out at shutdown.'
        );
    } catch (error) {
        console.error(`Workspace volumes stay mounted until next start: ${errorMessage(error)}`);
    }
}

function partitionVolumes({ dataRoot, volumes }: AttachmentPartition) {
    return {
        dataRoot,
        ...(volumes ? { disk: volumes.disk } : {}),
        ...(volumes?.pacing ? { pacing: volumes.pacing } : {}),
    };
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export async function withShutdownDeadline(
    close: () => Promise<void>,
    timeoutMs = 20_000,
    detail = 'Computer shutdown timed out before all session state was saved.'
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            close(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(detail)), timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/** Update-triggered restarts and OS signals share the same awaited drain. */
export function installAttachmentShutdown(close: () => Promise<void>): () => void {
    let closing: Promise<void> | null = null;
    const shutdown = () => {
        closing ??= close();
        return closing;
    };
    drain = shutdown;
    const onSignal = () => {
        void shutdown().then(
            () => process.exit(0),
            (error: unknown) => {
                console.error(error);
                process.exit(1);
            }
        );
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    return () => {
        process.off('SIGTERM', onSignal);
        process.off('SIGINT', onSignal);
        if (drain === shutdown) {
            drain = null;
        }
    };
}

export async function drainAttachmentDaemon(): Promise<void> {
    await drain?.();
}

// Covers both work stages plus sandbox, coordination, and telemetry finalizers.
export async function stopAttachmentProcess(pid: number, timeoutMs = 60_000): Promise<void> {
    try {
        process.kill(pid, 'SIGTERM');
    } catch (error) {
        if (isMissingProcess(error)) {
            return;
        }
        throw error;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (isMissingProcess(error)) {
                return;
            }
            throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Computer daemon ${pid} did not finish shutdown; replacement was not started.`);
}

function isMissingProcess(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

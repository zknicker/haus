import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import type { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import {
    closeDaemonCoordination,
    closeDaemonRuntimeResources,
    type DaemonRuntime,
} from './daemon-runtime.ts';

let drain: (() => Promise<void>) | null = null;

export async function withAttachmentShutdown<T>(
    work: AttachmentDaemonWork,
    runtime: DaemonRuntime,
    serverId: string,
    run: () => Promise<T>
): Promise<T> {
    const remove = installAttachmentShutdown(() =>
        closeDaemonRuntimeResources(
            () => work.close(),
            async () => {
                disposeServerLaunchHosts(serverId);
                await withShutdownDeadline(
                    () =>
                        closeDaemonRuntimeResources(
                            () => closeDaemonCoordination(runtime),
                            () => runtime.dispose()
                        ),
                    3000
                );
            }
        )
    );
    try {
        return await run();
    } finally {
        await work.close().finally(remove);
    }
}

export async function withShutdownDeadline(
    close: () => Promise<void>,
    timeoutMs = 20_000
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            close(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new Error(
                                'Computer shutdown timed out before all session state was saved.'
                            )
                        ),
                    timeoutMs
                );
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

export async function stopAttachmentProcess(pid: number, timeoutMs = 30_000): Promise<void> {
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

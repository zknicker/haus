import { serverRuntimeSettingsCommandSchema } from '@haus/api';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { setIdleCompaction } from './runtime/runtime-context.ts';

/**
 * The Server's runtime settings, sent on every attach and every change (replace semantics).
 * Until the first arrives every setting is off. Returns whether `frame` was one.
 */
export function handleServerRuntimeSettingsFrame(frame: unknown, runtime: DaemonRuntime): boolean {
    const settings = serverRuntimeSettingsCommandSchema.safeParse(frame);
    if (!settings.success) {
        return false;
    }
    setIdleCompaction(runtime, settings.data.idleCompaction);
    return true;
}

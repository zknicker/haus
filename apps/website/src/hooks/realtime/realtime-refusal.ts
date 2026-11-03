import { type RealtimeRefusal, realtimeRefusalDataKey, realtimeRefusalSchema } from '@haus/api';

/**
 * How the App answers a stream that ended with an error
 * (specs/realtime-events.md, "Refusal classes"):
 *
 * - `membership_lost`: final for every stream of that Server; run the Server-loss path.
 * - `chat_missing`: the stream's Chat no longer exists; run the Chat-loss purge and stop.
 * - `role_required`: stop this one stream; clear nothing.
 * - `unauthorized`: the App session expired or was rejected; refresh it, then restart.
 * - `transient`: anything else, including `FORBIDDEN` or `NOT_FOUND` with no `hausRefusal`;
 *   restart with backoff.
 *
 * Only a coded `hausRefusal` is a refusal. Never infer one from a bare tRPC code.
 */
export type StreamEndClass = RealtimeRefusal | 'transient' | 'unauthorized';

export function classifyStreamError(error: unknown): StreamEndClass {
    const data = readErrorData(error);
    const refusal = realtimeRefusalSchema.safeParse(data?.[realtimeRefusalDataKey]);
    if (refusal.success) {
        return refusal.data;
    }
    return data?.code === 'UNAUTHORIZED' ? 'unauthorized' : 'transient';
}

function readErrorData(error: unknown): Record<string, unknown> | null {
    if (typeof error !== 'object' || error === null || !('data' in error)) {
        return null;
    }
    const { data } = error as { data: unknown };
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
}

import { TRPCError } from '@trpc/server';
import { RealtimeRefusalError } from './refusal.ts';
import type { RealtimeTopic } from './topic.ts';

export interface TopicStreamOptions<Event extends { serverId: string }, Viewer> {
    /**
     * Rechecks membership and role before each delivery and returns the viewer;
     * throws a coded `RealtimeRefusalError` when access ended.
     */
    access(): Promise<Viewer>;
    /** Per-event visibility (Chat access). False skips the event, never ends the stream. */
    deliver?: (viewer: Viewer, event: Event) => Promise<boolean>;
    /** The procedure path, for the failure log. */
    path: string;
    serverId: string;
    signal: AbortSignal | undefined;
    topic: RealtimeTopic<Event>;
    /** The subscriber, so reader-only events reach only their reader. */
    viewerId: string | null;
}

/**
 * The delivery loop behind every Server-rooted stream (specs/realtime-events.md,
 * "Subscription factory"). Filters by Server and audience, rechecks access per
 * event, and applies the stream's visibility rule. A refusal ends the stream
 * with its code; any other error ends only this stream, is logged, and
 * surfaces as `INTERNAL_SERVER_ERROR` so the App restarts it.
 */
export async function* streamTopic<Event extends { serverId: string }, Viewer>(
    options: TopicStreamOptions<Event, Viewer>
): AsyncGenerator<Event> {
    const { access, deliver, path, serverId, signal, topic, viewerId } = options;
    try {
        for await (const { audienceUserId, event } of topic.subscribe(signal)) {
            if (event.serverId !== serverId) {
                continue;
            }
            if (audienceUserId !== null && audienceUserId !== viewerId) {
                continue;
            }
            const viewer = await access();
            if (!deliver || (await deliver(viewer, event))) {
                yield event;
            }
        }
    } catch (error) {
        if (error instanceof RealtimeRefusalError) {
            throw error;
        }
        if (signal?.aborted) {
            return;
        }
        throw streamFailure(path, error);
    }
}

function streamFailure(path: string, error: unknown) {
    console.error('[haus] realtime stream failed', {
        code: error instanceof TRPCError ? error.code : 'INTERNAL_SERVER_ERROR',
        errorClass: error instanceof Error ? error.name : typeof error,
        path,
    });
    return new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The realtime stream failed.',
    });
}

import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { claudeControllerHeaders } from './native-auth.ts';

const sessionSchema = z.object({
    external_metadata: z.object({ pending_action: z.unknown().optional() }).passthrough().nullish(),
    id: z.string().regex(/^cse_[A-Za-z0-9]+$/u),
    last_event_at: z.string().nullish(),
    status: z.string(),
    worker_status: z.string(),
});
const pageSchema = z.object({
    data: z.array(
        z.object({ payload: z.record(z.string(), z.unknown()), sequence_num: z.coerce.string() })
    ),
    next_cursor: z.string().nullish(),
});

/** Claude's own reading of one hosted session: its lifecycle and what its worker is doing. */
export interface ClaudeSession {
    /** When the session last emitted anything, when Claude says. */
    lastEventAt: string | null;
    /** What the worker is blocked on while `workerStatus` is `requires_action`. */
    pendingAction: unknown;
    /** `active` or `archived`. */
    status: string;
    /** `running`, `idle`, or `requires_action`. */
    workerStatus: string;
}

/** One entry of the session's event log, in Claude Code's stream-json vocabulary. */
export interface ClaudeSessionEvent {
    payload: Record<string, unknown>;
    sequence: string;
}

export interface ClaudeController {
    /** Newest-first history, read back until `stop` matches an event or history ends. */
    events(
        sessionId: string,
        stop: (event: ClaudeSessionEvent) => boolean,
        signal?: AbortSignal
    ): Promise<ClaudeSessionEvent[]>;
    interrupt(sessionId: string, requestId: string, signal?: AbortSignal): Promise<void>;
    session(sessionId: string, signal?: AbortSignal): Promise<ClaudeSession>;
    stopTask(
        sessionId: string,
        input: { requestId: string; taskId: string },
        signal?: AbortSignal
    ): Promise<void>;
}

const pageLimit = 100;
const pagesRead = 20;

/**
 * Claude's session controller: the API claude.ai/code itself uses to read a
 * hosted session's state and event log and to stop its work. It is internal
 * and undocumented, so its whole surface stays inside this adapter.
 */
export function createClaudeController(): ClaudeController {
    return {
        async session(sessionId, signal) {
            const body = await request(sessionId, '', signal);
            // Claude has answered both bare and wrapped in `response_shape`.
            const session = sessionSchema.parse(
                (body as { response_shape?: unknown } | null)?.response_shape ?? body
            );
            return {
                lastEventAt: session.last_event_at ?? null,
                pendingAction: session.external_metadata?.pending_action ?? null,
                status: session.status,
                workerStatus: session.worker_status,
            };
        },
        async events(sessionId, stop, signal) {
            const collected: ClaudeSessionEvent[] = [];
            let cursor: string | null = null;
            for (let page = 0; page < pagesRead; page++) {
                const params = new URLSearchParams({
                    limit: String(pageLimit),
                    sort_order: 'desc',
                });
                if (cursor) {
                    params.set('cursor', cursor);
                }
                const body = pageSchema.parse(
                    await request(sessionId, `/events?${params}`, signal)
                );
                for (const event of body.data) {
                    const entry = { payload: event.payload, sequence: event.sequence_num };
                    collected.push(entry);
                    if (stop(entry)) {
                        return collected;
                    }
                }
                if (!body.next_cursor) {
                    return collected;
                }
                cursor = body.next_cursor;
            }
            return collected;
        },
        async interrupt(sessionId, requestId, signal) {
            await control(
                sessionId,
                requestId,
                { cancel_queued: true, subtype: 'interrupt' },
                signal
            );
        },
        async stopTask(sessionId, input, signal) {
            await control(
                sessionId,
                input.requestId,
                { subtype: 'stop_task', task_id: input.taskId },
                signal
            );
        },
    };
}

function control(
    sessionId: string,
    requestId: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
) {
    return request(sessionId, '/events', signal, {
        events: [
            {
                payload: {
                    request: body,
                    request_id: requestId,
                    type: 'control_request',
                    uuid: randomUUID(),
                },
            },
        ],
        session_id: sessionId,
    });
}

async function request(
    sessionId: string,
    suffix: string,
    signal?: AbortSignal,
    body?: unknown
): Promise<unknown> {
    const address = z
        .string()
        .regex(/^(?:session|cse)_[A-Za-z0-9]+$/u)
        .parse(sessionId);
    const timeout = AbortSignal.timeout(15_000);
    const response = await fetch(`https://api.anthropic.com/v1/code/sessions/${address}${suffix}`, {
        headers: await claudeControllerHeaders(signal),
        method: body === undefined ? 'GET' : 'POST',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        throw new Error(`Claude refused the session request (HTTP ${response.status}).`);
    }
    return response.json();
}

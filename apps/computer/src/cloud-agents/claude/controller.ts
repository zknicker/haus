import * as z from 'zod';
import { claudeControllerHeaders } from './controller-auth.ts';

const identity = z.string().min(1);
const eventSchema = z.object({ sequence_num: z.string().regex(/^\d+$/u), payload: z.unknown() });
const payloadSchema = z.object({ type: z.string(), uuid: identity }).passthrough();
const userSchema = z.object({
    type: z.literal('user'),
    uuid: identity,
    origin: z.object({ kind: z.string() }).passthrough().optional(),
    message: z.object({
        content: z.union([
            z.string(),
            z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
        ]),
    }),
});
const responseSchema = z.object({
    type: z.literal('control_response'),
    response: z.object({
        request_id: identity,
        subtype: z.enum(['success', 'error']),
        response: z
            .object({
                cancelled: z.array(z.unknown()).optional(),
                still_queued: z.array(z.unknown()).optional(),
            })
            .passthrough()
            .optional(),
    }),
});
const taskSchema = z.object({
    type: z.literal('system'),
    subtype: z.enum(['task_started', 'task_notification']),
    task_id: identity,
    status: z.string().optional(),
});

export interface ClaudeControllerEvent {
    promptId?: string;
    requestId?: string;
    sequence: string;
    stillQueued?: number;
    success?: boolean;
    task?: { id: string; terminal: boolean };
    uuid: string;
    workRun?: { workId: string; runId: string };
}
export interface ClaudeControllerSession {
    id: string;
    status: string;
}
export interface ClaudeController {
    events(id: string, boundary?: string, signal?: AbortSignal): Promise<ClaudeControllerEvent[]>;
    interrupt(
        id: string,
        input: { requestId: string; eventUuid: string },
        signal?: AbortSignal
    ): Promise<void>;
    session(id: string, signal?: AbortSignal): Promise<ClaudeControllerSession>;
    stopTask(
        id: string,
        input: { taskId: string; requestId: string; eventUuid: string },
        signal?: AbortSignal
    ): Promise<void>;
}

/** Internal native controller protocol; keep its undocumented surface inside this adapter. */
export function createClaudeController(): ClaudeController {
    return {
        async session(id, signal) {
            const body = await request(id, '', signal);
            const native = z
                .object({
                    response_shape: z.object({
                        id: z.string().regex(/^cse_[A-Za-z0-9]+$/u),
                        worker_status: identity,
                    }),
                })
                .parse(body).response_shape;
            return { id: native.id, status: native.worker_status };
        },
        async events(id, boundary, signal) {
            let cursor: string | null = null;
            const collected: ClaudeControllerEvent[] = [];
            for (let page = 0; page < 20; page++) {
                const params = new URLSearchParams({ limit: '100', sort_order: 'desc' });
                if (cursor) {
                    params.set('cursor', cursor);
                }
                const body = z
                    .object({
                        data: z.array(eventSchema),
                        next_cursor: z.string().nullable().optional(),
                    })
                    .parse(await request(id, `/events?${params}`, signal));
                for (const event of body.data) {
                    collected.push(parseClaudeControllerEvent(event));
                }
                if (
                    !body.next_cursor ||
                    (boundary &&
                        body.data.some((event) => BigInt(event.sequence_num) <= BigInt(boundary)))
                ) {
                    return collected;
                }
                cursor = body.next_cursor;
            }
            throw new Error(
                'Native Claude event history exceeded its bounded reconciliation window.'
            );
        },
        async stopTask(id, input, signal) {
            await request(id, '/events', signal, {
                session_id: id,
                events: [
                    {
                        payload: {
                            type: 'control_request',
                            uuid: input.eventUuid,
                            request_id: input.requestId,
                            request: { subtype: 'stop_task', task_id: input.taskId },
                        },
                    },
                ],
            });
        },
        async interrupt(id, input, signal) {
            await request(id, '/events', signal, {
                session_id: id,
                events: [
                    {
                        payload: {
                            type: 'control_request',
                            uuid: input.eventUuid,
                            request_id: input.requestId,
                            request: { subtype: 'interrupt', cancel_queued: true },
                        },
                    },
                ],
            });
        },
    };
}

async function request(
    id: string,
    suffix: string,
    signal?: AbortSignal,
    body?: unknown
): Promise<unknown> {
    const address = z
        .string()
        .regex(/^(?:session|cse)_[A-Za-z0-9]+$/u)
        .parse(id);
    const response = await fetch(`https://api.anthropic.com/v1/code/sessions/${address}${suffix}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: await claudeControllerHeaders(signal),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        throw new Error(`Native Claude controller refused the request (HTTP ${response.status}).`);
    }
    return response.json();
}

export function parseClaudeControllerEvent(input: unknown): ClaudeControllerEvent {
    const event = eventSchema.parse(input);
    const payload = payloadSchema.parse(event.payload);
    const base = { sequence: event.sequence_num, uuid: payload.uuid };
    if (payload.type === 'control_response') {
        const response = responseSchema.parse(payload).response;
        return {
            ...base,
            requestId: response.request_id,
            success: response.subtype === 'success',
            ...(response.response?.still_queued
                ? { stillQueued: response.response.still_queued.length }
                : {}),
        };
    }
    if (payload.type === 'user') {
        const user = userSchema.parse(payload);
        if (user.origin?.kind === 'task-notification') {
            return base;
        }
        const text =
            typeof user.message.content === 'string'
                ? user.message.content
                : user.message.content
                      .filter((block) => block.type === 'text')
                      .map((block) => block.text ?? '')
                      .join('');
        if (text.length > 0) {
            const tag = text.match(
                /(?:^|\n)HAUS_CLOUD_RUN=(caw_[A-Za-z0-9_-]+)\/(car_[A-Za-z0-9_-]+)(?:\r?\n|$)/u
            );
            return {
                ...base,
                promptId: user.uuid,
                ...(tag?.[1] && tag[2] ? { workRun: { workId: tag[1], runId: tag[2] } } : {}),
            };
        }
    }
    if (
        payload.type === 'system' &&
        ['task_started', 'task_notification'].includes(String(payload.subtype))
    ) {
        const task = taskSchema.parse(payload);
        return {
            ...base,
            task: {
                id: task.task_id,
                terminal:
                    task.subtype === 'task_notification' &&
                    ['stopped', 'completed', 'failed'].includes(task.status ?? ''),
            },
        };
    }
    return base;
}

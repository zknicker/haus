import * as z from 'zod';

/**
 * Agent API refusal codes for `haus worker` (specs/workers.md "The CLI").
 * Each rides an `AgentApiError` `code`, and its message says what to do, since
 * the Computer proxy forwards only the code and message. A refused start
 * writes nothing. `WORKER_TASK_REQUIRED` lives with the Task place refusals.
 *
 * - `WORKER_TASK_CLOSED`: the Task is done or canceled.
 * - `WORKER_PLACE_REQUIRED`: no `--on` and no ready default on the Agent's Computer; the message lists the ready places.
 * - `WORKER_PLACE_UNAVAILABLE`: no online Computer has that place ready.
 * - `WORKER_HISTORY_READ_ONLY`: the Worker predates Tasks and only reads.
 * - `WORKER_CLOSED`: the Worker's Task closed, so it takes no more turns.
 * - `WORKER_NOT_LIVE`: stop found no queued or working turn.
 * - `WORKER_STOP_DENIED`: only the delegating Agent stops its Workers.
 * - `WORKER_IDEMPOTENCY_CONFLICT`: the nonce already started a different Worker.
 */
export const workerRefusalCodes = [
    'WORKER_TASK_CLOSED',
    'WORKER_PLACE_REQUIRED',
    'WORKER_PLACE_UNAVAILABLE',
    'WORKER_HISTORY_READ_ONLY',
    'WORKER_CLOSED',
    'WORKER_NOT_LIVE',
    'WORKER_STOP_DENIED',
    'WORKER_IDEMPOTENCY_CONFLICT',
] as const;

export const workerRefusalCodeSchema = z.enum(workerRefusalCodes);

export type WorkerRefusalCode = z.infer<typeof workerRefusalCodeSchema>;

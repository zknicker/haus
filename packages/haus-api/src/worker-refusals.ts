import * as z from 'zod';

/**
 * Agent API refusal codes for `haus worker` (specs/workers.md "The CLI").
 * Each rides an `AgentApiError` `code`, and its message says what to do, since
 * the Computer proxy forwards only the code and message. A refused start
 * writes nothing. `WORKER_TASK_REQUIRED` lives with the Task place refusals.
 *
 * - `WORKER_TASK_CLOSED`: the Task is done or canceled.
 * - `WORKER_PLACE_REQUIRED`: no `--on` and no usable default; the message lists the usable places.
 * - `WORKER_PLACE_UNAVAILABLE`: the place is not usable now, such as an offline Computer or no ready carrier.
 * - `WORKER_PLACE_OFF`: the Computer's **Run Workers here** setting is Off.
 * - `WORKER_PLACE_NO_ACCESS`: the Computer's Agent access does not allow this Agent; the message links its Device page.
 * - `WORKER_PLACE_AMBIGUOUS`: two Computers share that name; the message lists their `computer:<id>` forms.
 * - `WORKER_RUNTIME_UNAVAILABLE`: the requested runtime, or every runtime, is not ready there.
 * - `WORKER_MODEL_UNAVAILABLE`: the runtime there cannot run that model, or reports none; the message lists the models it can.
 * - `WORKER_OPTION_CLOUD`: `--runtime` or `--model` on a cloud place.
 * - `WORKER_HISTORY_READ_ONLY`: the Worker predates Tasks and only reads.
 * - `WORKER_CLOSED`: the Worker's Task closed, so it takes no more turns or new reports.
 * - `WORKER_CARRIER_REMOVED`: the Worker's carrier Computer was removed, so it takes no more turns.
 * - `WORKER_NOT_LIVE`: stop found no queued or working turn.
 * - `WORKER_STOP_DENIED`: only the delegating Agent stops its Workers.
 * - `WORKER_IDEMPOTENCY_CONFLICT`: the nonce already started a different Worker.
 * - `WORKER_TURN_SETTLED`: `haus worker report` after its turn settled.
 * - `WORKER_PERSON_UNKNOWN`: `--person` is not a human member who can read the Task; the message lists its followers.
 */
export const workerRefusalCodes = [
    'WORKER_TASK_CLOSED',
    'WORKER_PLACE_REQUIRED',
    'WORKER_PLACE_UNAVAILABLE',
    'WORKER_PLACE_OFF',
    'WORKER_PLACE_NO_ACCESS',
    'WORKER_PLACE_AMBIGUOUS',
    'WORKER_RUNTIME_UNAVAILABLE',
    'WORKER_MODEL_UNAVAILABLE',
    'WORKER_OPTION_CLOUD',
    'WORKER_HISTORY_READ_ONLY',
    'WORKER_CLOSED',
    'WORKER_CARRIER_REMOVED',
    'WORKER_NOT_LIVE',
    'WORKER_STOP_DENIED',
    'WORKER_IDEMPOTENCY_CONFLICT',
    'WORKER_TURN_SETTLED',
    'WORKER_PERSON_UNKNOWN',
] as const;

export const workerRefusalCodeSchema = z.enum(workerRefusalCodes);

export type WorkerRefusalCode = z.infer<typeof workerRefusalCodeSchema>;

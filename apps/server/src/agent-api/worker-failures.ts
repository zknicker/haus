import { ChatArchivedError } from '../chats/chat-access.ts';
import { workerNoAccessText } from '../computer-access/access-refusal-text.ts';
import {
    WorkerAgentNotFoundError,
    WorkerCarrierRemovedError,
    WorkerClosedError,
    WorkerConflictError,
    WorkerHistoryReadOnlyError,
    WorkerNotFoundError,
    WorkerNotLiveError,
    WorkerPlaceRequiredError,
    WorkerOptionCloudError,
    WorkerPlaceUnavailableError,
    WorkerStopDeniedError,
    WorkerTaskClosedError,
    WorkerTaskRequiredError,
} from '../workers/errors.ts';
import {
    WorkerComputerUnavailableError,
    WorkerPersonUnknownError,
    WorkerPlaceAmbiguousError,
    WorkerPlaceNoAccessError,
    WorkerPlaceOffError,
    WorkerPlaceUnknownError,
    WorkerProjectDefaultUnusableError,
    WorkerModelUnavailableError,
    WorkerRuntimeUnavailableError,
    WorkerTurnSettledError,
} from '../workers/place-errors.ts';
import { sendAgentApiError } from './auth.ts';

const refusals = [
    [WorkerTaskRequiredError, 400, 'WORKER_TASK_REQUIRED'],
    [WorkerTaskClosedError, 409, 'WORKER_TASK_CLOSED'],
    [WorkerPlaceRequiredError, 400, 'WORKER_PLACE_REQUIRED'],
    [WorkerProjectDefaultUnusableError, 400, 'WORKER_PLACE_REQUIRED'],
    [WorkerPlaceUnavailableError, 409, 'WORKER_PLACE_UNAVAILABLE'],
    [WorkerPlaceUnknownError, 409, 'WORKER_PLACE_UNAVAILABLE'],
    [WorkerComputerUnavailableError, 409, 'WORKER_PLACE_UNAVAILABLE'],
    [WorkerPlaceOffError, 409, 'WORKER_PLACE_OFF'],
    [WorkerPlaceNoAccessError, 403, 'WORKER_PLACE_NO_ACCESS'],
    [WorkerPlaceAmbiguousError, 409, 'WORKER_PLACE_AMBIGUOUS'],
    [WorkerRuntimeUnavailableError, 409, 'WORKER_RUNTIME_UNAVAILABLE'],
    [WorkerModelUnavailableError, 409, 'WORKER_MODEL_UNAVAILABLE'],
    [WorkerTurnSettledError, 409, 'WORKER_TURN_SETTLED'],
    [WorkerPersonUnknownError, 400, 'WORKER_PERSON_UNKNOWN'],
    [WorkerOptionCloudError, 400, 'WORKER_OPTION_CLOUD'],
    [WorkerHistoryReadOnlyError, 409, 'WORKER_HISTORY_READ_ONLY'],
    [WorkerClosedError, 409, 'WORKER_CLOSED'],
    [WorkerCarrierRemovedError, 409, 'WORKER_CARRIER_REMOVED'],
    [WorkerNotLiveError, 409, 'WORKER_NOT_LIVE'],
    [WorkerStopDeniedError, 403, 'WORKER_STOP_DENIED'],
    [WorkerConflictError, 409, 'WORKER_IDEMPOTENCY_CONFLICT'],
    [WorkerNotFoundError, 404, 'WORKER_NOT_FOUND'],
    [WorkerAgentNotFoundError, 404, 'WORKER_FAILED'],
    [ChatArchivedError, 409, 'TARGET_READ_ONLY'],
] as const;

export function sendWorkerFailure(
    reply: Parameters<typeof sendAgentApiError>[0],
    cause: unknown,
    appOrigin: string | null
) {
    const refusal = refusals.find(([type]) => cause instanceof type);
    if (refusal && cause instanceof Error) {
        const message =
            cause instanceof WorkerPlaceNoAccessError
                ? workerNoAccessText(cause.computer, appOrigin)
                : cause.message;
        return sendAgentApiError(reply, refusal[1], refusal[2], message);
    }
    console.error('[haus] worker request failed', cause);
    return sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Server could not record the Worker.');
}

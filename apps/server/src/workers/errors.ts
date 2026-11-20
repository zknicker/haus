import { type WorkerPlace, formatWorkerPlace } from '@haus/api';

export class WorkerConflictError extends Error {
    constructor() {
        super('That start nonce already started a different Worker. Use a new nonce.');
        this.name = 'WorkerConflictError';
    }
}

export class WorkerAgentNotFoundError extends Error {
    constructor() {
        super('The delegating Agent no longer exists.');
        this.name = 'WorkerAgentNotFoundError';
    }
}

export class WorkerNotFoundError extends Error {
    constructor() {
        super('That Worker does not exist.');
        this.name = 'WorkerNotFoundError';
    }
}

export class WorkerNotLiveError extends Error {
    constructor() {
        super('That Worker has no queued or working turn to stop.');
        this.name = 'WorkerNotLiveError';
    }
}

export class WorkerStopDeniedError extends Error {
    constructor() {
        super('Only the Agent that started this Worker can stop it or send it a follow-up.');
        this.name = 'WorkerStopDeniedError';
    }
}

export class WorkerHistoryReadOnlyError extends Error {
    constructor() {
        super('That Worker is read-only history from before Tasks. Start a new Worker on a Task.');
        this.name = 'WorkerHistoryReadOnlyError';
    }
}

export class WorkerClosedError extends Error {
    constructor() {
        super('That Worker closed with its Task and takes no more turns. Start a new Worker.');
        this.name = 'WorkerClosedError';
    }
}

export class WorkerCarrierRemovedError extends Error {
    constructor() {
        super(
            'The Computer that carried this Worker was removed, and its provider login went with it, so the Worker takes no more turns. Start a new Worker on the Task.'
        );
        this.name = 'WorkerCarrierRemovedError';
    }
}

export class WorkerTaskRequiredError extends Error {
    constructor(
        message = 'A Worker needs a Task. Start a Task for this work first, then start the Worker on that Task by its key; the Worker reports there.'
    ) {
        super(message);
        this.name = 'WorkerTaskRequiredError';
    }
}

export class WorkerTaskClosedError extends Error {
    constructor(taskKey: string) {
        super(`Task ${taskKey} is closed. Reopen it, or start the Worker on an open Task.`);
        this.name = 'WorkerTaskClosedError';
    }
}

export class WorkerPlaceRequiredError extends Error {
    constructor(readyPlaces: readonly WorkerPlace[]) {
        super(
            readyPlaces.length > 0
                ? `Your Computer has no ready default place, so say where the Worker runs with --on. Ready places: ${readyPlaces.map(formatWorkerPlace).join(', ')}.`
                : 'Your Computer has no ready default place, and no place is ready: a Computer must connect Cursor or Claude first.'
        );
        this.name = 'WorkerPlaceRequiredError';
    }
}

export class WorkerPlaceUnavailableError extends Error {
    constructor(place: string) {
        super(
            `No online Computer has ${place} ready. Ask a person to connect it on a Computer, or pick another place.`
        );
        this.name = 'WorkerPlaceUnavailableError';
    }
}

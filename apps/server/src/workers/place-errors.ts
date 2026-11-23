import { type WorkerPlace, formatWorkerPlace } from '@haus/api';
import { workerNoAccessText } from '../computer-access/access-refusal-text.ts';
import type { ComputerFacts } from '../computer-access/computer-facts.ts';

export class WorkerPlaceNoAccessError extends Error {
    readonly computer: ComputerFacts;
    constructor(computer: ComputerFacts) {
        super(workerNoAccessText(computer, null));
        this.computer = computer;
        this.name = 'WorkerPlaceNoAccessError';
    }
}

export class WorkerPlaceOffError extends Error {
    constructor(name: string) {
        super(
            `Workers can't run on ${name}: its "Run Workers here" setting is Off. Ask the person who attached it to turn it on, or pick another place.`
        );
        this.name = 'WorkerPlaceOffError';
    }
}

export class WorkerPlaceUnknownError extends Error {
    constructor(place: string) {
        super(`No place is named ${place}. Run \`haus worker places\` for the places you can use.`);
        this.name = 'WorkerPlaceUnknownError';
    }
}

export class WorkerComputerUnavailableError extends Error {
    constructor(name: string) {
        super(`${name} is offline, so it can't take a Worker now. Pick another place.`);
        this.name = 'WorkerComputerUnavailableError';
    }
}

export class WorkerPlaceAmbiguousError extends Error {
    constructor(name: string, computerIds: readonly string[]) {
        super(
            `More than one Computer is named ${name}. Name one by id: ${computerIds.map((id) => `computer:${id}`).join(', ')}.`
        );
        this.name = 'WorkerPlaceAmbiguousError';
    }
}

export class WorkerProjectDefaultUnusableError extends Error {
    constructor(defaultPlace: WorkerPlace, usable: readonly WorkerPlace[]) {
        super(
            usable.length > 0
                ? `This Task's Project runs Workers on ${formatWorkerPlace(defaultPlace)}, which can't take one now. Say where the Worker runs with --on. Usable places: ${usable.map(formatWorkerPlace).join(', ')}.`
                : `This Task's Project runs Workers on ${formatWorkerPlace(defaultPlace)}, which can't take one now, and no other place is usable.`
        );
        this.name = 'WorkerProjectDefaultUnusableError';
    }
}

export class WorkerRuntimeUnavailableError extends Error {
    constructor(name: string, runtime: string | null) {
        super(
            runtime
                ? `${runtime} is not ready on ${name}. Drop --runtime, or ask a person to sign it in there.`
                : `No Worker runtime is ready on ${name}. Ask a person to sign Claude Code or Codex in there, or pick another place.`
        );
        this.name = 'WorkerRuntimeUnavailableError';
    }
}

export class WorkerModelUnavailableError extends Error {
    constructor(input: {
        models: readonly string[];
        name: string;
        requested: string | null;
        runtime: string;
    }) {
        const listed = input.models.slice(0, 12).join(', ');
        super(
            input.models.length === 0
                ? `${input.runtime} on ${input.name} reports no models it can run. Name one with --model, or ask a person to check its sign-in there.`
                : `${input.runtime} on ${input.name} cannot run ${input.requested}. It can run: ${listed}.`
        );
        this.name = 'WorkerModelUnavailableError';
    }
}

export class WorkerTurnSettledError extends Error {
    constructor() {
        super('This turn already settled, so it takes no more reports.');
        this.name = 'WorkerTurnSettledError';
    }
}

export class WorkerPersonUnknownError extends Error {
    constructor(handle: string, followers: readonly string[]) {
        super(
            followers.length > 0
                ? `@${handle} is not a person who can read this Task. Its followers: ${followers.map((follower) => `@${follower}`).join(', ')}.`
                : `@${handle} is not a person who can read this Task, and the Task has no human followers. Drop --person to ask your Agent.`
        );
        this.name = 'WorkerPersonUnknownError';
    }
}

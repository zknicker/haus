import { type WorkerPlace, formatWorkerPlace } from '@haus/api';

export class WorkerPlaceOffError extends Error {
    constructor(name: string) {
        super(
            `Workers can't run on ${name}: its "Workers can run here" switch is off. Ask the person who attached it, an Owner, or an Admin to turn it on, or pick another place.`
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

export class WorkerRepoNotLinkedError extends Error {
    constructor(repository: string, name: string) {
        super(
            `${repository} is not linked on ${name}. Ask the person who attached it, an Owner, or an Admin to link it in the Project's settings, or pick another place.`
        );
        this.name = 'WorkerRepoNotLinkedError';
    }
}

export class WorkerProjectReposError extends Error {
    constructor(repositories: readonly string[]) {
        super(
            repositories.length > 0
                ? `This Task's Project has several repos, so name one with --repo: ${repositories.join(', ')}.`
                : "This Task's Project has no repos yet. Name the repository with --repo <owner/name>."
        );
        this.name = 'WorkerProjectReposError';
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

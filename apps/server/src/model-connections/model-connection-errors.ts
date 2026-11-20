import { SecretsKeyMissingError } from '../secrets/sealed-secret.ts';

export class ModelConnectionsDeniedError extends Error {
    constructor(message = 'Only the Server Owner can manage model connections.') {
        super(message);
        this.name = 'ModelConnectionsDeniedError';
    }
}

export class ModelConnectionNotFoundError extends Error {
    constructor() {
        super('That model connection was not found on this Server.');
        this.name = 'ModelConnectionNotFoundError';
    }
}

export class ModelConnectionLabelTakenError extends Error {
    constructor(label: string) {
        super(`This provider already has a connection named "${label}".`);
        this.name = 'ModelConnectionLabelTakenError';
    }
}

export class ModelConnectionMismatchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ModelConnectionMismatchError';
    }
}

export class ModelSignInNotFoundError extends Error {
    constructor() {
        super('That sign-in was not found. It may have expired; start a new one.');
        this.name = 'ModelSignInNotFoundError';
    }
}

export class RunnerNotConnectedError extends Error {
    readonly reason = 'runner-not-connected' as const;

    constructor() {
        super('The runner is not connected, so sign-in cannot start. Try again once it is back.');
        this.name = 'RunnerNotConnectedError';
    }
}

export class WebSearchUnsupportedError extends Error {
    readonly reason = 'web-search-unsupported' as const;

    constructor() {
        super('Web search cannot be turned on for this provider.');
        this.name = 'WebSearchUnsupportedError';
    }
}

export function modelConnectionErrorData(error: { cause?: unknown }) {
    const { cause } = error;
    return {
        modelConnection:
            cause instanceof RunnerNotConnectedError || cause instanceof WebSearchUnsupportedError
                ? { code: cause.reason }
                : cause instanceof SecretsKeyMissingError
                  ? { code: 'secrets-key-missing' as const }
                  : undefined,
    };
}

import type { ProjectErrorCode } from '@haus/api';

const keyMessages: Record<ProjectErrorCode, (key: string) => string> = {
    PROJECT_KEY_FIXED: () => 'Tasks already carry this Project’s key, so it can no longer change.',
    TASK_KEY_TAKEN: (key) => `${key} is already another Project’s key or held by its Tasks.`,
};

export class ProjectKeyError extends Error {
    readonly code: ProjectErrorCode;

    constructor(code: ProjectErrorCode, key: string) {
        super(keyMessages[code](key));
        this.name = 'ProjectKeyError';
        this.code = code;
    }
}

export class ChannelNameTakenError extends Error {
    constructor() {
        super('A channel already uses that name.');
        this.name = 'ChannelNameTakenError';
    }
}

export class ProjectNotFoundError extends Error {
    constructor() {
        super('That Project does not exist on this Server.');
        this.name = 'ProjectNotFoundError';
    }
}

export function projectErrorData(error: { cause?: unknown }) {
    return {
        project: error.cause instanceof ProjectKeyError ? { code: error.cause.code } : undefined,
    };
}

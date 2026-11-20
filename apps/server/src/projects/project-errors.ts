import type { ProjectErrorCode } from '@haus/api';

export class ProjectRefusalError extends Error {
    readonly code: ProjectErrorCode;

    constructor(code: ProjectErrorCode, message: string) {
        super(message);
        this.name = 'ProjectRefusalError';
        this.code = code;
    }
}

const keyMessages = {
    PROJECT_KEY_FIXED: () => 'Tasks already carry this Project’s key, so it can no longer change.',
    TASK_KEY_TAKEN: (key: string) =>
        `${key} is already another Project’s key or held by its Tasks.`,
};

export class ProjectKeyError extends ProjectRefusalError {
    constructor(code: keyof typeof keyMessages, key: string) {
        super(code, keyMessages[code](key));
        this.name = 'ProjectKeyError';
    }
}

export class ProjectHasAgentsError extends ProjectRefusalError {
    constructor(handles: readonly string[]) {
        super(
            'PROJECT_HAS_AGENTS',
            `This Project is home to ${handles.map((handle) => `@${handle}`).join(', ')}. Move them to another Project first.`
        );
        this.name = 'ProjectHasAgentsError';
    }
}

export class HausProjectNameError extends ProjectRefusalError {
    constructor() {
        super('PROJECT_NAME_FIXED', 'The Haus project’s channel is always #all.');
        this.name = 'HausProjectNameError';
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
        project:
            error.cause instanceof ProjectRefusalError ? { code: error.cause.code } : undefined,
    };
}

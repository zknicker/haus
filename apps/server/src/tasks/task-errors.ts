/** A typed Task refusal the Agent API names by its code (ADR 0062). */
export class TaskRefusalError extends Error {
    constructor(
        readonly code: 'TASK_ARCHIVED' | 'TASK_START_NOT_CAPTAIN',
        message: string
    ) {
        super(message);
        this.name = 'TaskRefusalError';
    }
}

/** No Task with that id or key exists on the Server. */
export class TaskNotFoundError extends Error {
    constructor(message = 'No task exists with that id on this Server.') {
        super(message);
        this.name = 'TaskNotFoundError';
    }
}

/** A stale `expectedVersion`: someone changed the Task first. */
export class TaskConflictError extends Error {
    constructor(current: number, expected: number) {
        super(`The task changed (version ${current}, expected ${expected}). Reload and retry.`);
        this.name = 'TaskConflictError';
    }
}

/**
 * A write the Task rules refuse: an assignee who is not an active member or
 * Agent, an unknown label, an origin inside a Task, an unknown Project, or a
 * change to a chatless Task kept as history.
 */
export class TaskInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TaskInvariantError';
    }
}

/** An Agent starts Tasks only in its home Project (ADR 0055). */
export class TaskProjectNotHomeError extends Error {
    readonly nextAction: string;

    constructor(project: { channelName: string; homeAgentHandles: readonly string[] }) {
        const channel = `#${project.channelName}`;
        const agent = project.homeAgentHandles[0];
        super(
            `You start Tasks only in your Project, and ${channel} is another Project. Its Agent starts Tasks there.`
        );
        this.name = 'TaskProjectNotHomeError';
        this.nextAction = agent
            ? `@mention @${agent} in ${channel} with the request; it starts the Task.`
            : `@mention that Project's Agent in ${channel} with the request; it starts the Task.`;
    }
}

/** An archived Project's Tasks stay archived until the Project is restored (ADR 0062). */
export class TaskProjectArchivedError extends Error {
    constructor() {
        super(
            'This Task’s Project is archived, so the Task stays archived. Restore the Project first.'
        );
        this.name = 'TaskProjectArchivedError';
    }
}

export function requireTaskPlace<Task extends { chatId: string | null }>(
    task: Task
): asserts task is Task & { chatId: string } {
    if (task.chatId === null) {
        throw new TaskInvariantError(
            'This Task is from before Tasks were places and is kept as read-only history.'
        );
    }
}

export function requireTaskVersion(current: number, expected: number): void {
    if (current !== expected) {
        throw new TaskConflictError(current, expected);
    }
}

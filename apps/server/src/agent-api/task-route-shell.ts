import type { FastifyInstance, FastifyReply } from 'fastify';
import type * as z from 'zod';
import {
    BoardConflictError,
    BoardInvariantError,
    BoardNotFoundError,
} from '../boards/board-errors.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import { isHeartbeatRun } from '../heartbeat/run-source.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { TaskConflictError, TaskInvariantError, TaskNotFoundError } from '../tasks/task-errors.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';

/** An Agent's reference that names nothing on the Server: a handle, column, or label. */
export class AgentTaskInputError extends Error {}

type Action<Input> = (runner: ResolvedRunner, input: Input) => Promise<unknown>;

/** Each retry means another write landed, so this rides out a burst of Agents on one Task. */
export const implicitVersionAttempts = 8;

/** One board or Task read: authorize, validate the query, answer. */
export function agentTaskRead<Schema extends z.ZodType>(
    app: FastifyInstance,
    db: HausDatabase,
    route: { path: string; query: Schema },
    action: Action<z.output<Schema>>
) {
    app.get(route.path, async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendMissingToken(reply);
        }
        const parsed = route.query.safeParse(request.query);
        if (!parsed.success) {
            return sendInvalid(reply, parsed.error);
        }
        return await respond(reply, () => action(runner, parsed.data));
    });
}

/**
 * One board or Task write: authorize, validate the body, refuse a heartbeat run,
 * answer. A heartbeat is private work in a throwaway session whose main session
 * decides what anyone hears (ADR 0049), so it may read the boards but changes
 * nothing other people see; it reports what it found instead.
 */
export function agentTaskWrite<Schema extends z.ZodType>(
    app: FastifyInstance,
    db: HausDatabase,
    route: { body: Schema; path: string },
    action: Action<z.output<Schema>>
) {
    app.post(route.path, async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendMissingToken(reply);
        }
        const parsed = route.body.safeParse(request.body);
        if (!parsed.success) {
            return sendInvalid(reply, parsed.error);
        }
        if (await isHeartbeatRun(db, runner)) {
            return sendAgentApiError(
                reply,
                403,
                'REGULAR_TURN_REQUIRED',
                'Tasks and boards are read-only in a heartbeat run. Report what you found with haus heartbeat report.'
            );
        }
        return await respond(reply, () => action(runner, parsed.data));
    });
}

/**
 * Runs a versioned write. An explicit `expected` fails closed like the App's. Without
 * one the last write wins for Agents: a write that lost the race to the version it
 * just read reads again and retries, at most `implicitVersionAttempts` times.
 */
export async function withImplicitVersion<Result>(
    expected: number | undefined,
    readVersion: () => Promise<number>,
    write: (version: number) => Promise<Result>
): Promise<Result> {
    if (expected !== undefined) {
        return await write(expected);
    }
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await write(await readVersion());
        } catch (cause) {
            const lostRace =
                cause instanceof TaskConflictError || cause instanceof BoardConflictError;
            if (!lostRace || attempt >= implicitVersionAttempts) {
                throw cause;
            }
        }
    }
}

async function respond(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
        return await action();
    } catch (cause) {
        return sendAgentTaskError(reply, cause);
    }
}

function sendAgentTaskError(reply: FastifyReply, cause: unknown) {
    if (cause instanceof TaskNotFoundError) {
        return sendAgentApiError(reply, 404, 'TASK_NOT_FOUND', cause.message);
    }
    if (cause instanceof BoardNotFoundError) {
        return sendAgentApiError(reply, 404, 'BOARD_NOT_FOUND', cause.message);
    }
    if (cause instanceof TaskConflictError || cause instanceof BoardConflictError) {
        return sendAgentApiError(reply, 409, 'TASK_CONFLICT', cause.message, {
            nextAction: 'Read it again, then retry on the current state.',
        });
    }
    if (
        cause instanceof AgentTaskInputError ||
        cause instanceof BoardInvariantError ||
        cause instanceof TaskInvariantError
    ) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
    }
    return sendAgentReadError(reply, cause);
}

function sendMissingToken(reply: FastifyReply) {
    return sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');
}

function sendInvalid(reply: FastifyReply, error: z.ZodError) {
    const issues = error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.map(String).join('.') || 'request'}: ${issue.message}`);
    return sendAgentApiError(
        reply,
        400,
        'INVALID_ARG',
        `The request was invalid: ${issues.join('; ')}`
    );
}

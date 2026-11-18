import type { AgentTaskRefusalCode } from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type * as z from 'zod';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    TaskConflictError,
    TaskInvariantError,
    TaskNotFoundError,
    TaskOriginDmError,
} from '../tasks/task-errors.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';

export class AgentTaskInputError extends Error {}

type Action<Input> = (runner: ResolvedRunner, input: Input) => Promise<unknown>;

/** Each retry means another write landed, so this rides out a burst of Agents on one Task. */
export const implicitVersionAttempts = 8;

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
            const lostRace = cause instanceof TaskConflictError;
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
    if (cause instanceof TaskOriginDmError) {
        return sendAgentApiError(
            reply,
            400,
            'TASK_ORIGIN_DM' satisfies AgentTaskRefusalCode,
            cause.message
        );
    }
    if (cause instanceof TaskConflictError) {
        return sendAgentApiError(reply, 409, 'TASK_CONFLICT', cause.message, {
            nextAction: 'Read it again, then retry on the current state.',
        });
    }
    if (cause instanceof AgentTaskInputError || cause instanceof TaskInvariantError) {
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

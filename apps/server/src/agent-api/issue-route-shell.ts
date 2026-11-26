import type { AgentIssueRefusalCode } from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type * as z from 'zod';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import {
    IssueConflictError,
    IssueInvariantError,
    IssueNotFoundError,
    IssueParentCycleError,
    IssueParentProjectError,
    IssueProjectNotHomeError,
    IssueTakenError,
} from '../issues/issue-errors.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';

type Action<Input> = (runner: ResolvedRunner, input: Input) => Promise<unknown>;

const implicitVersionAttempts = 8;

export function agentIssueRead<Schema extends z.ZodType>(
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

export function agentIssueWrite<Schema extends z.ZodType>(
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

export async function withImplicitIssueVersion<Result>(
    expected: number | undefined,
    readVersion: () => Promise<number>,
    write: (version: number) => Promise<Result>
) {
    if (expected !== undefined) {
        return await write(expected);
    }
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await write(await readVersion());
        } catch (cause) {
            if (!(cause instanceof IssueConflictError) || attempt >= implicitVersionAttempts) {
                throw cause;
            }
        }
    }
}

async function respond(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
        return await action();
    } catch (cause) {
        return sendAgentIssueError(reply, cause);
    }
}

function sendAgentIssueError(reply: FastifyReply, cause: unknown) {
    if (cause instanceof IssueNotFoundError) {
        return sendAgentApiError(reply, 404, 'ISSUE_NOT_FOUND', cause.message);
    }
    if (cause instanceof IssueTakenError) {
        return sendAgentApiError(reply, 409, refusal('ISSUE_TAKEN'), cause.message, {
            nextAction: `Leave it with ${cause.holder}, or ask them before taking it.`,
        });
    }
    if (cause instanceof IssueProjectNotHomeError) {
        return sendAgentApiError(reply, 403, refusal('ISSUE_PROJECT_NOT_HOME'), cause.message, {
            nextAction: cause.nextAction,
        });
    }
    if (cause instanceof IssueParentProjectError) {
        return sendAgentApiError(reply, 400, refusal('ISSUE_PARENT_PROJECT'), cause.message);
    }
    if (cause instanceof IssueParentCycleError) {
        return sendAgentApiError(reply, 400, refusal('ISSUE_PARENT_CYCLE'), cause.message);
    }
    if (cause instanceof IssueConflictError) {
        return sendAgentApiError(reply, 409, 'ISSUE_CONFLICT', cause.message, {
            nextAction: 'Read it again, then retry on the current state.',
        });
    }
    if (cause instanceof IssueInvariantError) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
    }
    return sendAgentReadError(reply, cause);
}

function refusal(code: AgentIssueRefusalCode) {
    return code;
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

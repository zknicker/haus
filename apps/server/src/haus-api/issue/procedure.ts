import { TRPCError } from '@trpc/server';
import {
    IssueConflictError,
    IssueInvariantError,
    IssueNotFoundError,
    IssueParentCycleError,
    IssueParentProjectError,
    IssueTakenError,
} from '../../issues/issue-errors.ts';
import type { IssueWriteResult } from '../../issues/issue-write.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { memberProcedure } from '../server/procedure.ts';

export const issueProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    throw toIssueError(result.error.cause) ?? result.error;
});

export function commitIssueWrite(result: Pick<IssueWriteResult, 'events' | 'issue'>) {
    publishRealtime(result.events);
    return { issue: result.issue };
}

function toIssueError(cause: unknown) {
    if (cause instanceof IssueNotFoundError) {
        return new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof IssueConflictError || cause instanceof IssueTakenError) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (
        cause instanceof IssueInvariantError ||
        cause instanceof IssueParentProjectError ||
        cause instanceof IssueParentCycleError
    ) {
        return new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }
    return null;
}

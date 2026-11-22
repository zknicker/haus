import { TRPCError } from '@trpc/server';
import type { HausDatabase } from '../../postgres/connection.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import type { HausUser } from '../../users/haus-user.ts';
import {
    WorkerCarrierRemovedError,
    WorkerClosedError,
    WorkerHistoryReadOnlyError,
    WorkerNotFoundError,
    WorkerNotLiveError,
    WorkerQuestionClosedError,
} from '../../workers/errors.ts';
import { WorkerPlaceOffError } from '../../workers/place-errors.ts';
import type { HausContext } from '../context.ts';

export async function requireWorkerMember(
    ctx: { hausDb: HausDatabase; member: HausUser | null },
    serverId: string
) {
    await requireServerMembership(ctx.hausDb, ctx.member, serverId);
    if (!ctx.member) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sign in to act on this Worker.' });
    }
    return ctx.member;
}

export function workerSinks(
    ctx: Pick<HausContext, 'agentDelivery' | 'computerConnections' | 'postCommitWork'>
) {
    return {
        agentDelivery: ctx.agentDelivery,
        connections: ctx.computerConnections,
        postCommitWork: ctx.postCommitWork,
    };
}

export function toWorkerTrpcError(cause: unknown) {
    if (cause instanceof WorkerNotFoundError) {
        return new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (
        cause instanceof WorkerNotLiveError ||
        cause instanceof WorkerClosedError ||
        cause instanceof WorkerCarrierRemovedError ||
        cause instanceof WorkerQuestionClosedError ||
        cause instanceof WorkerPlaceOffError ||
        cause instanceof WorkerHistoryReadOnlyError
    ) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    return cause;
}

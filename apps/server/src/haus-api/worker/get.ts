import { workerGetInputSchema, workerSchema } from '@haus/api';
import { requireVisibleWorker } from '../../workers/worker-operations.ts';
import { memberProcedure } from '../server/procedure.ts';
import { requireWorkerMember, toWorkerTrpcError } from './worker-trpc.ts';

export const getWorkerProcedure = memberProcedure
    .input(workerGetInputSchema)
    .output(workerSchema)
    .query(async ({ ctx, input }) => {
        const member = await requireWorkerMember(ctx, input.serverId);
        try {
            return await requireVisibleWorker(ctx.hausDb, {
                serverId: input.serverId,
                viewer: { kind: 'user', userId: member.id },
                workerId: input.workerId,
            });
        } catch (cause) {
            throw toWorkerTrpcError(cause);
        }
    });

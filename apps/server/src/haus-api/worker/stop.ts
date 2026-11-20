import { workerSchema, workerStopInputSchema } from '@haus/api';
import { z } from 'zod';
import { commitWorkerEffects } from '../../workers/worker-effects.ts';
import { stopWorkerAsPerson } from '../../workers/worker-operations.ts';
import { memberProcedure } from '../server/procedure.ts';
import { requireWorkerMember, toWorkerTrpcError, workerSinks } from './worker-trpc.ts';

export const stopWorkerProcedure = memberProcedure
    .input(workerStopInputSchema)
    .output(z.object({ worker: workerSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        const member = await requireWorkerMember(ctx, input.serverId);
        try {
            const stopped = await stopWorkerAsPerson(
                ctx.hausDb,
                {
                    serverId: input.serverId,
                    userId: member.id,
                    workerId: input.workerId,
                },
                ctx.artifactStorage
            );
            await commitWorkerEffects(stopped.effects, workerSinks(ctx));
            return { worker: stopped.worker };
        } catch (cause) {
            throw toWorkerTrpcError(cause);
        }
    });

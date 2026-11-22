import { workerDismissQuestionInputSchema, workerSchema } from '@haus/api';
import { z } from 'zod';
import { commitWorkerEffects } from '../../workers/worker-effects.ts';
import { dismissWorkerQuestion } from '../../workers/worker-operations.ts';
import { memberProcedure } from '../server/procedure.ts';
import { requireWorkerMember, toWorkerTrpcError, workerSinks } from './worker-trpc.ts';

export const dismissWorkerQuestionProcedure = memberProcedure
    .input(workerDismissQuestionInputSchema)
    .output(z.object({ worker: workerSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        const member = await requireWorkerMember(ctx, input.serverId);
        try {
            const dismissed = await dismissWorkerQuestion(ctx.hausDb, {
                ...input,
                userId: member.id,
            });
            await commitWorkerEffects(dismissed.effects, workerSinks(ctx));
            return { worker: dismissed.worker };
        } catch (cause) {
            throw toWorkerTrpcError(cause);
        }
    });

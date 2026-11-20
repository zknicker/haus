import { idSchema, workerSchema, workerSendFollowUpInputSchema } from '@haus/api';
import { z } from 'zod';
import { sendPersonFollowUp } from '../../workers/send-person-follow-up.ts';
import { commitWorkerEffects } from '../../workers/worker-effects.ts';
import { memberProcedure } from '../server/procedure.ts';
import { requireWorkerMember, toWorkerTrpcError, workerSinks } from './worker-trpc.ts';

export const sendWorkerFollowUpProcedure = memberProcedure
    .input(workerSendFollowUpInputSchema)
    .output(z.object({ messageId: idSchema, worker: workerSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        const member = await requireWorkerMember(ctx, input.serverId);
        try {
            const sent = await sendPersonFollowUp(
                ctx.hausDb,
                member,
                input,
                ctx.agentDelivery,
                ctx.artifactStorage,
                ctx.messageRouter
            );
            await commitWorkerEffects(sent.effects, workerSinks(ctx));
            return { messageId: sent.messageId, worker: sent.worker };
        } catch (cause) {
            throw toWorkerTrpcError(cause);
        }
    });

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { computerIdSchema } from '../../computers/contracts.ts';
import {
    CoveSetupConflictError,
    CoveSetupError,
    createCove,
    sendPendingCoveApplication,
} from '../../onboarding/create-cove.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import { memberProcedure } from './procedure.ts';

const createCoveInputSchema = z
    .object({
        computerId: computerIdSchema,
        modelId: z.string().trim().min(1).max(128),
        runtimeId: z.string().trim().min(1).max(64),
        serverId: serverIdSchema,
    })
    .strict();

export const createCoveProcedure = memberProcedure
    .input(createCoveInputSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const result = await createCove(ctx.hausDb, ctx.member, input);
            await sendPendingCoveApplication(ctx.hausDb, ctx.computerConnections, input.computerId);
            agentUpdatedTopic.announce({ agentId: null, serverId: input.serverId });
            return result;
        } catch (cause) {
            if (cause instanceof CoveSetupConflictError) {
                throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
            }
            if (cause instanceof CoveSetupError) {
                // Not the precondition code: reserved for the protocol gate
                // in trpc.ts (the App's "update required" signal).
                throw new TRPCError({
                    cause,
                    code: 'UNPROCESSABLE_CONTENT',
                    message: cause.message,
                });
            }
            throw cause;
        }
    });

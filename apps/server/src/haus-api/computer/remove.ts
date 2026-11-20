import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { removeServerComputer } from '../../computers/remove-computer.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { computerUpdatedTopic, projectUpdatedTopic } from '../../realtime/topics.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import { commitWorkerEffects } from '../../workers/worker-effects.ts';
import { memberProcedure } from '../server/procedure.ts';

export const removeComputerProcedure = memberProcedure
    .input(
        z
            .object({
                computerId: z.string().min(1),
                confirmation: z.string().trim(),
                serverId: serverIdSchema,
            })
            .strict()
    )
    .mutation(async ({ ctx, input }) => {
        try {
            const removed = await removeServerComputer(
                ctx.hausDb,
                ctx.agentDelivery,
                ctx.member,
                input,
                ctx.artifactStorage
            );
            ctx.computerConnections.disconnectComputer(removed.computerId);
            computerUpdatedTopic.announce({
                computerId: input.computerId,
                serverId: input.serverId,
            });
            for (const projectId of removed.projectIds) {
                projectUpdatedTopic.announce({ projectId, serverId: input.serverId });
            }
            await commitWorkerEffects(removed.workers, {
                agentDelivery: ctx.agentDelivery,
                connections: ctx.computerConnections,
                postCommitWork: ctx.postCommitWork,
            });
            return { computerId: removed.computerId };
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw new TRPCError({
                cause,
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Computer could not be removed. Try again.',
            });
        }
    });

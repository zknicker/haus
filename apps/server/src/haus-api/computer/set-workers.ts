import { computerSetWorkersInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { setComputerWorkers } from '../../computers/set-computer-workers.ts';
import { computerUpdatedTopic, projectUpdatedTopic } from '../../realtime/topics.ts';
import { commitWorkerEffects } from '../../workers/worker-effects.ts';
import { memberProcedure } from '../server/procedure.ts';

export const setComputerWorkersProcedure = memberProcedure
    .input(computerSetWorkersInputSchema)
    .output(z.object({ computerId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const set = await setComputerWorkers(
                ctx.hausDb,
                ctx.agentDelivery,
                ctx.member,
                input,
                ctx.artifactStorage
            );
            computerUpdatedTopic.announce({ computerId: set.computerId, serverId: input.serverId });
            for (const projectId of set.projectIds) {
                projectUpdatedTopic.announce({ projectId, serverId: input.serverId });
            }
            await commitWorkerEffects(set.workers, {
                agentDelivery: ctx.agentDelivery,
                connections: ctx.computerConnections,
                postCommitWork: ctx.postCommitWork,
            });
            return { computerId: set.computerId };
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });

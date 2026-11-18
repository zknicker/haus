import { TRPCError } from '@trpc/server';
import { computerUpdateInputSchema } from '../../computers/contracts.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { startComputerUpdate } from '../../computers/update.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const startComputerUpdateProcedure = memberProcedure
    .input(computerUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const started = await startComputerUpdate({
                ...input,
                connections: ctx.computerConnections,
                db: ctx.hausDb,
                manifestUrl: ctx.computerReleaseManifestUrl,
                member: ctx.member,
            });
            computerUpdatedTopic.announce({
                computerId: input.computerId,
                serverId: input.serverId,
            });
            return started;
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });

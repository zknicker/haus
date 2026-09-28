import { TRPCError } from '@trpc/server';
import { computerUpdateInputSchema } from '../../computers/contracts.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { checkComputerUpdate } from '../../computers/update.ts';
import { memberProcedure } from '../server/procedure.ts';
import { emitServerUpdated } from '../server-events.ts';

export const checkComputerUpdateProcedure = memberProcedure
    .input(computerUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            // A check writes the Computer's update phase and offered version,
            // which is exactly what the Computer list renders.
            const checked = await checkComputerUpdate({
                ...input,
                connections: ctx.computerConnections,
                db: ctx.hausDb,
                manifestUrl: ctx.computerReleaseManifestUrl,
                member: ctx.member,
            });
            emitServerUpdated({ scope: 'computer', serverId: input.serverId });
            return checked;
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });

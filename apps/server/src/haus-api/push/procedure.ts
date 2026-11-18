import { TRPCError } from '@trpc/server';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Device registration belongs to the human, not to one Server. A signed-in
 * human with no Haus User yet has nothing to be pushed about.
 */
export const pushProcedure = memberProcedure.use(async ({ ctx, next }) => {
    if (!ctx.member) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Join or create a Haus server before registering for push.',
        });
    }
    return await next({ ctx: { ...ctx, member: ctx.member } });
});

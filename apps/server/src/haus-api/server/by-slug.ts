import { z } from 'zod';
import { serverSlugSchema } from '../../servers/contracts.ts';
import { openServerBySlug } from '../../servers/server-access.ts';
import { memberProcedure } from './procedure.ts';

export const serverBySlugProcedure = memberProcedure
    .input(z.object({ slug: serverSlugSchema }).strict())
    .query(async ({ ctx, input }) => ({
        ...(await openServerBySlug(ctx.hausDb, ctx.member, input.slug)),
        // Server-reported capability, so the App can gate the generate
        // affordance instead of offering a request that must refuse.
        avatarGenerationAvailable: ctx.avatarImageService.available,
    }));

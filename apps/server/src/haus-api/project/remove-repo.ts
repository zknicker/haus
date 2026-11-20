import { projectRemoveRepoInputSchema } from '@haus/api';
import { z } from 'zod';
import { removeProjectRepo } from '../../projects/project-repos.ts';
import { projectProcedure } from './procedure.ts';

export const removeProjectRepoProcedure = projectProcedure
    .input(projectRemoveRepoInputSchema)
    .output(z.object({ projectRepoId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => await removeProjectRepo(ctx.hausDb, ctx.member, input));

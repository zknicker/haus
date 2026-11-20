import { projectAddRepoInputSchema, workerRepositorySchema } from '@haus/api';
import { z } from 'zod';
import { addProjectRepo } from '../../projects/project-repos.ts';
import { projectProcedure } from './procedure.ts';

export const addProjectRepoProcedure = projectProcedure
    .input(projectAddRepoInputSchema)
    .output(z.object({ projectRepoId: z.string(), repository: workerRepositorySchema }).strict())
    .mutation(async ({ ctx, input }) => await addProjectRepo(ctx.hausDb, ctx.member, input));

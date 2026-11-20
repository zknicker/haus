import { projectLinkRepoInputSchema, projectUnlinkRepoInputSchema } from '@haus/api';
import { z } from 'zod';
import { linkProjectRepo, unlinkProjectRepo } from '../../projects/project-repos.ts';
import { projectProcedure } from './procedure.ts';

const linkResult = z.object({ computerId: z.string(), projectRepoId: z.string() }).strict();

export const linkProjectRepoProcedure = projectProcedure
    .input(projectLinkRepoInputSchema)
    .output(linkResult)
    .mutation(async ({ ctx, input }) => await linkProjectRepo(ctx.hausDb, ctx.member, input));

export const unlinkProjectRepoProcedure = projectProcedure
    .input(projectUnlinkRepoInputSchema)
    .output(linkResult)
    .mutation(async ({ ctx, input }) => await unlinkProjectRepo(ctx.hausDb, ctx.member, input));

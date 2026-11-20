import { projectListInputSchema, projectListSchema } from '@haus/api';
import { listProjects } from '../../projects/project-read.ts';
import { projectProcedure } from './procedure.ts';

export const listProjectsProcedure = projectProcedure
    .input(projectListInputSchema)
    .output(projectListSchema)
    .query(async ({ ctx, input }) => await listProjects(ctx.hausDb, ctx.member, input.serverId));

import { projectCreateInputSchema, projectMutationResultSchema } from '@haus/api';
import { createProject } from '../../projects/create-project.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { projectProcedure } from './procedure.ts';

export const createProjectProcedure = projectProcedure
    .input(projectCreateInputSchema)
    .output(projectMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { events, ...result } = await createProject(ctx.hausDb, ctx.member, input);
        publishRealtime(events);
        return result;
    });

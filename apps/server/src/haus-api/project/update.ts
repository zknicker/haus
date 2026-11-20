import { projectMutationResultSchema, projectUpdateInputSchema } from '@haus/api';
import { updateProject } from '../../projects/update-project.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { projectProcedure } from './procedure.ts';

export const updateProjectProcedure = projectProcedure
    .input(projectUpdateInputSchema)
    .output(projectMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { events, ...result } = await updateProject(ctx.hausDb, ctx.member, input);
        publishRealtime(events);
        return result;
    });

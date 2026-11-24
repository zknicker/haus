import { projectCreateInputSchema, projectMutationResultSchema } from '@haus/api';
import { createProject } from '../../projects/create-project.ts';
import { seedProjectRules } from '../../projects/project-rules.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { projectProcedure } from './procedure.ts';

export const createProjectProcedure = projectProcedure
    .input(projectCreateInputSchema)
    .output(projectMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { events, ...result } = await createProject(ctx.hausDb, ctx.member, input);
        publishRealtime(events);
        const storage = ctx.artifactStorage;
        if (storage && ctx.member) {
            const creator = { agentId: null, userId: ctx.member.id };
            await ctx.postCommitWork.run('project.seed-rules', () =>
                seedProjectRules(ctx.hausDb, storage, {
                    creator,
                    projectId: result.project.chatId,
                    serverId: input.serverId,
                })
            );
        }
        return result;
    });

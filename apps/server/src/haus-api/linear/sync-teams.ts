import { linearSyncTeamsInputSchema } from '@haus/api';
import { requireLinearAdmin, requireLinearWorkspace } from '../../linear/authority.ts';
import { LinearApiError } from '../../linear/linear-api.ts';
import { syncLinearTeams } from '../../linear/team-sync.ts';
import { linearAuthoring } from '../../triggers/linear-trigger-config.ts';
import { linearClock, linearProcedure } from './procedure.ts';

/**
 * Refresh teams: re-reads the workspace's team access from Linear now, for
 * when an admin changed it in Linear and the `PermissionChange` delivery has
 * not landed. The sync announces `linear.onUpdated` itself.
 */
export const linearSyncTeams = linearProcedure
    .input(linearSyncTeamsInputSchema)
    .mutation(async ({ ctx, input }) => {
        await requireLinearAdmin(ctx.hausDb, ctx.member, input.serverId);
        const workspace = await requireLinearWorkspace(ctx.hausDb, input);
        const outcome = await syncLinearTeams(
            {
                ...linearAuthoring(ctx.hausDb, ctx.linear),
                clock: linearClock,
                wake: (wakes) => void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, wakes),
            },
            { workspaceId: workspace.id }
        );
        if (outcome.failed > 0) {
            throw new LinearApiError('upstream', 'Linear team sync failed.');
        }
    });

import { linearCreateIdentityDraftInputSchema, linearIdentityDraftSchema } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import { holdsGrant, requireLinearAdmin, requireLinearWorkspace } from '../../linear/authority.ts';
import { LinearRefusedError } from '../../linear/linear-errors.ts';
import { createOpaqueId } from '../../postgres/opaque-id.ts';
import { agentsTable, linearIdentitiesTable } from '../../postgres/schema.ts';
import { lockServerRow } from '../../servers/server-lock.ts';
import { identityGuidedFlow } from './identity-view.ts';
import {
    announceLinearUpdated,
    linearClock,
    linearProcedure,
    requireLinearApp,
} from './procedure.ts';

/**
 * Starts the guided flow for one granted Agent. Idempotent: an Agent that
 * already has a live identity in this workspace gets that identity's values.
 */
export const linearCreateIdentityDraft = linearProcedure
    .input(linearCreateIdentityDraftInputSchema)
    .output(linearIdentityDraftSchema)
    .mutation(async ({ ctx, input }) => {
        const app = requireLinearApp(ctx.linear.app);
        const { created, draft } = await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            const userId = await requireLinearAdmin(tx, ctx.member, input.serverId);
            const workspace = await requireLinearWorkspace(tx, input);
            const [agent] = await tx
                .select({ avatarId: agentsTable.avatarId, displayName: agentsTable.displayName })
                .from(agentsTable)
                .where(
                    and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId))
                )
                .limit(1);
            if (!(agent && (await holdsGrant(tx, input)))) {
                throw new LinearRefusedError(
                    'BAD_REQUEST',
                    'linear_agent_not_granted',
                    'Grant this Agent the Linear connection before giving it a Linear identity.'
                );
            }
            const [existing] = await tx
                .select({ id: linearIdentitiesTable.id })
                .from(linearIdentitiesTable)
                .where(
                    and(
                        eq(linearIdentitiesTable.workspaceId, workspace.id),
                        eq(linearIdentitiesTable.agentId, input.agentId),
                        ne(linearIdentitiesTable.status, 'removed')
                    )
                )
                .limit(1);
            const identityId = existing?.id ?? createOpaqueId('lni');
            if (!existing) {
                const now = linearClock.now();
                await tx.insert(linearIdentitiesTable).values({
                    agentId: input.agentId,
                    createdAt: now,
                    createdByUserId: userId,
                    id: identityId,
                    organizationId: workspace.organizationId,
                    serverId: input.serverId,
                    status: 'draft',
                    updatedAt: now,
                    workspaceId: workspace.id,
                });
            }
            return {
                created: !existing,
                draft: identityGuidedFlow(app, workspace, { ...agent, identityId }),
            };
        });
        if (created) {
            announceLinearUpdated(input);
        }
        return draft;
    });

import { linearWorkspacesInputSchema, linearWorkspacesSchema } from '@haus/api';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { readTeamAccess } from '../../linear/team-access.ts';
import { linearCredentialsTable, linearWorkspacesTable } from '../../postgres/schema.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { linearClock, linearProcedure } from './procedure.ts';

/** The Server's bound Linear workspaces, with the workspace actor's teams and memberships. */
export const linearWorkspaces = linearProcedure
    .input(linearWorkspacesInputSchema)
    .output(linearWorkspacesSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const rows = await ctx.hausDb
            .select({ credentialId: linearCredentialsTable.id, workspace: linearWorkspacesTable })
            .from(linearWorkspacesTable)
            .leftJoin(
                linearCredentialsTable,
                and(
                    eq(linearCredentialsTable.workspaceId, linearWorkspacesTable.id),
                    isNull(linearCredentialsTable.identityId)
                )
            )
            .where(
                and(
                    eq(linearWorkspacesTable.serverId, input.serverId),
                    ne(linearWorkspacesTable.status, 'removed')
                )
            )
            .orderBy(asc(linearWorkspacesTable.createdAt));
        const now = linearClock.now();
        return await Promise.all(
            rows.map(async ({ credentialId, workspace }) => {
                const access = credentialId
                    ? await readTeamAccess(ctx.hausDb, credentialId, now)
                    : null;
                return {
                    connectionId: workspace.connectionId,
                    defaultAgentId: workspace.defaultAgentId,
                    id: workspace.id,
                    lastDeliveryAt: workspace.lastDeliveryAt?.toISOString() ?? null,
                    memberTeamIds: access?.memberTeamIds ?? [],
                    name: workspace.name,
                    organizationId: workspace.organizationId,
                    removedAt: null,
                    status: workspace.status,
                    teams: access?.teams ?? [],
                    teamsSyncedAt: workspace.teamsSyncedAt?.toISOString() ?? null,
                    urlKey: workspace.urlKey,
                };
            })
        );
    });

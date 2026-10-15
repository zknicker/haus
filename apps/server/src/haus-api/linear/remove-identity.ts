import { linearRemoveIdentityInputSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { requireLinearAdmin, requireLinearIdentity } from '../../linear/authority.ts';
import { removeLinearIdentity } from '../../linear/lifecycle.ts';
import { linearWorkspacesTable } from '../../postgres/schema.ts';
import { lockServerRow } from '../../servers/server-lock.ts';
import { announceLinearUpdated, linearClock, linearProcedure } from './procedure.ts';

/**
 * Removes an identity: its open delegated issues return to the Haus app, its
 * credential is revoked through the outbox, and its secrets are deleted.
 */
export const linearRemoveIdentity = linearProcedure
    .input(linearRemoveIdentityInputSchema)
    .mutation(async ({ ctx, input }) => {
        await requireLinearAdmin(ctx.hausDb, ctx.member, input.serverId);
        const identity = await requireLinearIdentity(ctx.hausDb, input);
        const [workspace] = await ctx.hausDb
            .select({ connectionId: linearWorkspacesTable.connectionId })
            .from(linearWorkspacesTable)
            .where(eq(linearWorkspacesTable.id, identity.workspaceId))
            .limit(1);
        await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireLinearAdmin(tx, ctx.member, input.serverId);
            await requireLinearIdentity(tx, input);
            await removeLinearIdentity(tx, identity.id, linearClock.now(), { handBack: true });
        });
        const connectionId = workspace?.connectionId ?? null;
        if (connectionId) {
            announceLinearUpdated({ connectionId, serverId: input.serverId });
        }
    });

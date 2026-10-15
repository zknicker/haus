import { linearRemoveIdentityInputSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { requireLinearAdmin, requireLinearIdentity } from '../../linear/authority.ts';
import { listDelegatedOpenIssueIds } from '../../linear/delegation.ts';
import { removeLinearIdentity } from '../../linear/lifecycle.ts';
import { LinearSignInRequiredError } from '../../linear/linear-errors.ts';
import type { LinearRuntime } from '../../linear/linear-runtime.ts';
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
        const connectionId = workspace?.connectionId ?? null;
        const handBack =
            connectionId && identity.appUserId
                ? await delegatedIssues(ctx.linear, connectionId, identity.appUserId)
                : [];
        await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireLinearAdmin(tx, ctx.member, input.serverId);
            await requireLinearIdentity(tx, input);
            await removeLinearIdentity(tx, identity.id, linearClock.now(), handBack);
        });
        if (connectionId) {
            announceLinearUpdated({ connectionId, serverId: input.serverId });
        }
    });

/** Linear has the delegations; a workspace that cannot read them hands nothing back. */
async function delegatedIssues(linear: LinearRuntime, connectionId: string, appUserId: string) {
    if (!(linear.app && linear.refresher)) {
        return [];
    }
    // A workspace needing sign-in cannot read or route issues; removal still proceeds.
    const token = await linear.refresher.connectionToken(connectionId).catch((cause: unknown) => {
        if (cause instanceof LinearSignInRequiredError) {
            return null;
        }
        throw cause;
    });
    return token ? await listDelegatedOpenIssueIds(linear.app.fetch, token, appUserId) : [];
}

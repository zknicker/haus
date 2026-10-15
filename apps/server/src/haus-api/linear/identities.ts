import { linearIdentitiesInputSchema, linearIdentitiesSchema } from '@haus/api';
import { requireLinearWorkspace } from '../../linear/authority.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { listLinearIdentities } from './identity-view.ts';
import { linearProcedure, requireLinearApp } from './procedure.ts';

/** The connection's Agent identities with their state and guided-flow values. */
export const linearIdentities = linearProcedure
    .input(linearIdentitiesInputSchema)
    .output(linearIdentitiesSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const workspace = await requireLinearWorkspace(ctx.hausDb, input);
        return await listLinearIdentities(ctx.hausDb, requireLinearApp(ctx.linear.app), workspace);
    });

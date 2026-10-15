import { linearAuthorizeResultSchema, linearStartIdentityInstallInputSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { requireLinearAdmin, requireLinearIdentity } from '../../linear/authority.ts';
import { LinearRefusedError } from '../../linear/linear-errors.ts';
import { startLinearAttempt } from '../../linear/oauth-attempts.ts';
import { linearCallbackUrl } from '../../linear/oauth-callback-route.ts';
import { linearIdentitySecretsTable, linearWorkspacesTable } from '../../postgres/schema.ts';
import { linearClock, linearProcedure, requireLinearApp } from './procedure.ts';

/** Installs an identity's own app with `actor=app` and PKCE; it needs saved credentials. */
export const linearStartIdentityInstall = linearProcedure
    .input(linearStartIdentityInstallInputSchema)
    .output(linearAuthorizeResultSchema)
    .mutation(async ({ ctx, input }) => {
        const app = requireLinearApp(ctx.linear.app);
        const userId = await requireLinearAdmin(ctx.hausDb, ctx.member, input.serverId);
        const identity = await requireLinearIdentity(ctx.hausDb, input);
        const [secret] = await ctx.hausDb
            .select({ identityId: linearIdentitySecretsTable.identityId })
            .from(linearIdentitySecretsTable)
            .where(eq(linearIdentitySecretsTable.identityId, identity.id))
            .limit(1);
        const [workspace] = await ctx.hausDb
            .select({ connectionId: linearWorkspacesTable.connectionId })
            .from(linearWorkspacesTable)
            .where(eq(linearWorkspacesTable.id, identity.workspaceId))
            .limit(1);
        if (!(identity.oauthClientId && secret && workspace?.connectionId)) {
            throw new LinearRefusedError(
                'BAD_REQUEST',
                'linear_identity_state',
                "Save the identity app's client id and webhook signing secret first."
            );
        }
        return await startLinearAttempt(ctx.hausDb, {
            clientId: identity.oauthClientId,
            now: linearClock.now(),
            redirectUri: linearCallbackUrl(app),
            serverId: input.serverId,
            target: {
                connectionId: workspace.connectionId,
                identityId: identity.id,
                purpose: 'identity_install',
            },
            userId,
        });
    });

import { linearAuthorizeResultSchema, linearStartInstallInputSchema } from '@haus/api';
import { requireLinearAdmin, requireLinearWorkspace } from '../../linear/authority.ts';
import { startLinearAttempt } from '../../linear/oauth-attempts.ts';
import { linearCallbackUrl } from '../../linear/oauth-callback-route.ts';
import { linearClock, linearProcedure, requireLinearApp } from './procedure.ts';

/**
 * Starts a Haus app install: a new workspace, or a reconnect of the given
 * connection. The attempt row binds this Server, connection, and user.
 */
export const linearStartInstall = linearProcedure
    .input(linearStartInstallInputSchema)
    .output(linearAuthorizeResultSchema)
    .mutation(async ({ ctx, input }) => {
        const app = requireLinearApp(ctx.linear.app);
        const userId = await requireLinearAdmin(ctx.hausDb, ctx.member, input.serverId);
        if (input.connectionId) {
            await requireLinearWorkspace(ctx.hausDb, {
                connectionId: input.connectionId,
                serverId: input.serverId,
            });
        }
        return await startLinearAttempt(ctx.hausDb, {
            clientId: app.clientId,
            now: linearClock.now(),
            redirectUri: linearCallbackUrl(app),
            serverId: input.serverId,
            target: input.connectionId
                ? { connectionId: input.connectionId, purpose: 'workspace_reconnect' }
                : { purpose: 'workspace_install' },
            userId,
        });
    });

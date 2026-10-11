import {
    mcpBearerTokenUpdateSchema,
    mcpConnectionCreateSchema,
    mcpConnectionInputSchema,
    mcpConnectionListInputSchema,
    mcpConnectionListSchema,
    mcpConnectionSchema,
    mcpGrantInputSchema,
    mcpGrantSchema,
    mcpHeadersUpdateSchema,
    mcpOAuthStartResultSchema,
    mcpOAuthStartSchema,
    mcpPresetAccountCreateSchema,
    mcpPresetIconCatalogSchema,
    skoolConnectSchema,
} from '@haus/api';
import { TRPCError } from '@trpc/server';
import { mcpUpdatedTopic } from '../../realtime/topics.ts';
import { deleteMcpConnection } from '../../server-mcp/delete-connection.ts';
import { McpDeniedError } from '../../server-mcp/errors.ts';
import {
    createMcpPresetAccount,
    replaceMcpPresetToken,
    resolveMcpPresetIcons,
} from '../../server-mcp/presets.ts';
import {
    createMcpConnection,
    disconnectMcpConnection,
    refreshMcpConnection,
    replaceMcpHeaders,
    startMcpOAuth,
} from '../../server-mcp/service.ts';
import { connectSkool } from '../../server-mcp/skool.ts';
import { listMcpConnections, setMcpGrant } from '../../server-mcp/state.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';
import { createRouter } from '../trpc.ts';
import { amazonProduct, amazonProductDetail } from './amazon-products.ts';
import { onMcpUpdatedProcedure } from './on-updated.ts';

const guarded = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (!result.ok && result.error.cause instanceof McpDeniedError) {
        throw new TRPCError({
            cause: result.error.cause,
            code: 'FORBIDDEN',
            message: result.error.cause.message,
        });
    }
    return result;
});

export const mcpRouter = createRouter({
    connectSkool: guarded
        .input(skoolConnectSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                connectSkool(ctx.hausDb, ctx.mcpRuntime, ctx.mcpIconResolver, ctx.member, input)
            )
        ),
    amazonProduct,
    amazonProductDetail,
    add: guarded
        .input(mcpConnectionCreateSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                createMcpConnection(
                    ctx.hausDb,
                    ctx.mcpRuntime,
                    ctx.mcpIconResolver,
                    ctx.member,
                    input
                )
            )
        ),
    addPresetAccount: guarded
        .input(mcpPresetAccountCreateSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                createMcpPresetAccount(
                    ctx.hausDb,
                    ctx.mcpRuntime,
                    ctx.mcpIconResolver,
                    ctx.member,
                    input
                )
            )
        ),
    delete: guarded
        .input(mcpConnectionInputSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                deleteMcpConnection(ctx.hausDb, ctx.mcpRuntime, ctx.member, input, (wakes) => {
                    void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, wakes);
                })
            )
        ),
    disconnect: guarded
        .input(mcpConnectionInputSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                disconnectMcpConnection(ctx.hausDb, ctx.mcpRuntime, ctx.member, input)
            )
        ),
    onUpdated: onMcpUpdatedProcedure,
    list: guarded
        .input(mcpConnectionListInputSchema)
        .output(mcpConnectionListSchema)
        .query(({ ctx, input }) =>
            listMcpConnections(ctx.hausDb, ctx.mcpIconResolver, ctx.member, input.serverId)
        ),
    presetIcons: guarded
        .input(mcpConnectionListInputSchema)
        .output(mcpPresetIconCatalogSchema)
        .query(async ({ ctx, input }) => {
            await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
            return await resolveMcpPresetIcons(ctx.mcpIconResolver);
        }),
    refresh: guarded
        .input(mcpConnectionInputSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                refreshMcpConnection(
                    ctx.hausDb,
                    ctx.mcpRuntime,
                    ctx.mcpIconResolver,
                    ctx.member,
                    input
                )
            )
        ),
    replaceHeaders: guarded
        .input(mcpHeadersUpdateSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                replaceMcpHeaders(
                    ctx.hausDb,
                    ctx.mcpRuntime,
                    ctx.mcpIconResolver,
                    ctx.member,
                    input
                )
            )
        ),
    replacePresetToken: guarded
        .input(mcpBearerTokenUpdateSchema)
        .output(mcpConnectionSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                replaceMcpPresetToken(
                    ctx.hausDb,
                    ctx.mcpRuntime,
                    ctx.mcpIconResolver,
                    ctx.member,
                    input
                )
            )
        ),
    setGrant: guarded
        .input(mcpGrantInputSchema)
        .output(mcpGrantSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () => setMcpGrant(ctx.hausDb, ctx.member, input))
        ),
    startOAuth: guarded
        .input(mcpOAuthStartSchema)
        .output(mcpOAuthStartResultSchema)
        .mutation(({ ctx, input }) =>
            withMcpUpdate(input.serverId, () =>
                startMcpOAuth(ctx.hausDb, ctx.mcpRuntime, ctx.mcpOAuthRelay, ctx.member, input)
            )
        ),
});

async function withMcpUpdate<Result>(serverId: string, operation: () => Promise<Result>) {
    const result = await operation();
    mcpUpdatedTopic.announce({ serverId });
    return result;
}

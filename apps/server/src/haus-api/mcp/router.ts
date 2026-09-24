import {
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
} from '@haus/api';
import { TRPCError } from '@trpc/server';
import { McpDeniedError } from '../../server-mcp/errors.ts';
import { createMcpPresetAccount } from '../../server-mcp/presets.ts';
import {
    createMcpConnection,
    deleteMcpConnection,
    disconnectMcpConnection,
    refreshMcpConnection,
    replaceMcpHeaders,
    startMcpOAuth,
} from '../../server-mcp/service.ts';
import { listMcpConnections, setMcpGrant } from '../../server-mcp/state.ts';
import { memberProcedure } from '../server/procedure.ts';
import { emitServerUpdated } from '../server-events.ts';
import { createRouter } from '../trpc.ts';
import { amazonProductDetail, amazonProducts } from './amazon-products.ts';

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
    amazonProducts,
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
                deleteMcpConnection(ctx.hausDb, ctx.mcpRuntime, ctx.member, input)
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
    list: guarded
        .input(mcpConnectionListInputSchema)
        .output(mcpConnectionListSchema)
        .query(({ ctx, input }) => listMcpConnections(ctx.hausDb, ctx.member, input.serverId)),
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
    emitServerUpdated({ scope: 'mcp', serverId });
    return result;
}

import type { BrowserRequest } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { BrowserDeniedError, requestBrowser } from '../../server-browser/browser.ts';
import type { HausUser } from '../../users/haus-user.ts';
import type { HausContext } from '../context.ts';
import { memberProcedure } from '../server/procedure.ts';
import { createRouter } from '../trpc.ts';
import {
    browserGetInputSchema,
    browserSaveInputSchema,
    browserSettingsOutputSchema,
} from './contracts.ts';

export const browserRouter = createRouter({
    get: memberProcedure
        .input(browserGetInputSchema)
        .output(browserSettingsOutputSchema)
        .query(async ({ ctx, input }) => {
            const result = await relay(ctx, input, { kind: 'get' });
            if (result.kind !== 'settings') {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
            }
            return result.value;
        }),
    save: memberProcedure
        .input(browserSaveInputSchema)
        .output(browserSettingsOutputSchema)
        .mutation(async ({ ctx, input }) => {
            const result = await relay(ctx, input, { input: input.settings, kind: 'save' });
            if (result.kind !== 'settings') {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
            }
            return result.value;
        }),
});

async function relay(
    ctx: HausContext & { member: HausUser | null },
    input: { computerId: string; serverId: string },
    operation: BrowserRequest['operation']
) {
    try {
        return await requestBrowser(ctx.hausDb, ctx.computerConnections, ctx.member, {
            ...input,
            operation,
        });
    } catch (cause) {
        if (cause instanceof BrowserDeniedError) {
            throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
        }
        throw cause;
    }
}

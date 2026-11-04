import {
    serverSettingsGetInputSchema,
    serverSettingsSchema,
    serverSettingsSetIdleCompactionInputSchema,
} from '@haus/api';
import { TRPCError } from '@trpc/server';
import { serverUpdatedTopic } from '../../realtime/topics.ts';
import {
    readServerRuntimeSettingsCommand,
    readServerSettings,
    ServerSettingsDeniedError,
    setServerIdleCompaction,
} from '../../servers/server-settings.ts';
import { memberProcedure } from './procedure.ts';

/** Any member reads the Server's settings. */
export const serverSettingsProcedure = memberProcedure
    .input(serverSettingsGetInputSchema)
    .output(serverSettingsSchema)
    .query(({ ctx, input }) => readServerSettings(ctx.hausDb, ctx.member, input.serverId));

/**
 * An Owner turns idle compaction on or off. Every attached Computer of the Server gets the new
 * runtime settings at once; one that is offline gets them when it attaches.
 */
export const setServerIdleCompactionProcedure = memberProcedure
    .input(serverSettingsSetIdleCompactionInputSchema)
    .output(serverSettingsSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const settings = await setServerIdleCompaction(ctx.hausDb, ctx.member, input);
            await ctx.computerConnections.runtimeSettings.changed(input.serverId, () =>
                readServerRuntimeSettingsCommand(ctx.hausDb, input.serverId)
            );
            serverUpdatedTopic.announce({ serverId: input.serverId });
            return settings;
        } catch (cause) {
            if (cause instanceof ServerSettingsDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });

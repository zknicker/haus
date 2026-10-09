import { cloudAgentSettingsSchema, cloudAgentSettingsSetModelInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    CloudAgentModelParamUnofferedError,
    CloudAgentModelUnlistedError,
    CloudAgentSettingsDeniedError,
    setCloudAgentModel,
} from '../../cloud-agents/cloud-agent-model.ts';
import { cloudAgentSettingsUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * An Owner or Admin saves the Server's Cloud Agent model: Auto, or one
 * listed model with offered effort and fast choices.
 */
export const setCloudAgentModelProcedure = memberProcedure
    .input(cloudAgentSettingsSetModelInputSchema)
    .output(cloudAgentSettingsSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const settings = await setCloudAgentModel(ctx.hausDb, ctx.member, input);
            cloudAgentSettingsUpdatedTopic.announce({ serverId: input.serverId });
            return settings;
        } catch (cause) {
            if (cause instanceof CloudAgentSettingsDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            if (
                cause instanceof CloudAgentModelUnlistedError ||
                cause instanceof CloudAgentModelParamUnofferedError
            ) {
                throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
            }
            throw cause;
        }
    });

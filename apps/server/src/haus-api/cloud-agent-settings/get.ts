import { cloudAgentSettingsGetInputSchema, cloudAgentSettingsSchema } from '@haus/api';
import { readCloudAgentSettings } from '../../cloud-agents/cloud-agent-model.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Any member reads the Server's Cloud Agent model and the freshest catalog. */
export const getCloudAgentSettingsProcedure = memberProcedure
    .input(cloudAgentSettingsGetInputSchema)
    .output(cloudAgentSettingsSchema)
    .query(({ ctx, input }) => readCloudAgentSettings(ctx.hausDb, ctx.member, input.serverId));

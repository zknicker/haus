import { createRouter } from '../trpc.ts';
import { getCloudAgentSettingsProcedure } from './get.ts';
import { setCloudAgentModelProcedure } from './set-model.ts';

/**
 * Server-wide Cloud Agent settings a human chooses. The model applies to every
 * launch on this Server; Agents read nothing here and cannot override it.
 */
export const cloudAgentSettingsRouter = createRouter({
    get: getCloudAgentSettingsProcedure,
    setModel: setCloudAgentModelProcedure,
});

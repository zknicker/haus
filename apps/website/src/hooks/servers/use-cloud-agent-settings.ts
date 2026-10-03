import type { CloudAgentModelSetting, CloudAgentSettings } from '@haus/api';
import { isCloudAgentModelListed } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The Server's Cloud Agent settings. Server events refresh it: `server` scope
 * when someone saves a model, `computer` scope when a Computer reports a new
 * catalog (`createServerUpdateHandler`).
 */
export function useCloudAgentSettings(serverId: string) {
    return hausTrpc.cloudAgentSettings.get.useQuery({ serverId }, queryPolicy.syncedSnapshot);
}

/**
 * Saves the Server's model. The pick shows at once; the Server's answer then
 * replaces it, and a refusal restores what was there.
 */
export function useSetCloudAgentModel(serverId: string) {
    const utils = hausTrpc.useUtils();
    const input = { serverId };

    return hausTrpc.cloudAgentSettings.setModel.useMutation({
        onMutate: async ({ model }) => {
            await utils.cloudAgentSettings.get.cancel(input);
            const previous = utils.cloudAgentSettings.get.getData(input);
            utils.cloudAgentSettings.get.setData(input, (settings) =>
                settings ? withModel(settings, model) : settings
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.cloudAgentSettings.get.setData(input, context.previous);
            }
            void utils.cloudAgentSettings.get.invalidate(input);
        },
        onSuccess: (settings) => {
            utils.cloudAgentSettings.get.setData(input, settings);
        },
    });
}

function withModel(settings: CloudAgentSettings, model: CloudAgentModelSetting) {
    return {
        ...settings,
        model,
        savedModelUnavailable:
            model.kind === 'model' && !isCloudAgentModelListed(model.id, settings.catalog),
    };
}

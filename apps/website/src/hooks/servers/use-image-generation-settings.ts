import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The Owner's image provider status: connected or not, and the curated
 * models each key unlocks. Never carries a key. Only an Owner may read it, so
 * callers gate on role before mounting.
 */
export function useImageGenerationSettings(serverId: string) {
    return hausTrpc.imageGenerationSettings.get.useQuery({ serverId }, queryPolicy.syncedSnapshot);
}

/** Adds or replaces a provider's key; the status read refreshes from the Server's answer. */
export function useSetImageGenerationKey(serverId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.imageGenerationSettings.setKey.useMutation({
        onSuccess: () => utils.imageGenerationSettings.get.invalidate({ serverId }),
    });
}

export function useRemoveImageGenerationKey(serverId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.imageGenerationSettings.removeKey.useMutation({
        onSuccess: () => utils.imageGenerationSettings.get.invalidate({ serverId }),
    });
}

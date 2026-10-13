import { useState } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { parseOnePasswordItemsReply } from '../../lib/desktop-onepassword.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';

export interface ComputerSecretsTarget {
    computerId: string;
    serverId: string;
}

/** Whether this window can reach the local 1Password CLI (desktop App only). */
export function canUseOnePassword() {
    return Boolean(getDesktopBridge()?.onePasswordVaults);
}

/**
 * Refresh items: desktop main lists the connected vault's items again (approved
 * in 1Password) and Server relays the new list to the Computer. No token and
 * no new service account. The Computer's re-report announces the change; the
 * invalidation here is only the acknowledgement fallback.
 */
export function useComputerSecretsRefresh(target: ComputerSecretsTarget) {
    const utils = hausTrpc.useUtils();
    const [isListing, setIsListing] = useState(false);
    const mutation = hausTrpc.computerSecrets.refreshItems.useMutation({
        onSuccess: () => {
            void utils.computer.list.invalidate({ serverId: target.serverId });
        },
        // The Computer may reinstall its Varlock runtime; never hold a batch.
        trpc: { context: { skipBatch: true } },
    });

    const refresh = async (connection: { account: string; vaultId: string }) => {
        const bridge = getDesktopBridge();
        if (!bridge?.onePasswordItems) {
            throw new Error('Open Haus for Mac to refresh 1Password items.');
        }
        setIsListing(true);
        try {
            const reply = parseOnePasswordItemsReply(await bridge.onePasswordItems(connection));
            if (reply.status !== 'ok') {
                throw new Error(reply.message);
            }
            return await mutation.mutateAsync({
                ...target,
                items: reply.items,
                vaultId: connection.vaultId,
            });
        } finally {
            setIsListing(false);
        }
    };

    return { isPending: isListing || mutation.isPending, refresh };
}

export function useComputerSecretsDisconnect(target: ComputerSecretsTarget) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.computerSecrets.disconnect.useMutation({
        onSuccess: () => {
            void utils.computer.list.invalidate({ serverId: target.serverId });
        },
    });
}

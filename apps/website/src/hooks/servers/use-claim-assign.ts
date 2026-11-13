import { hausTrpc } from '../../lib/haus-server.tsx';
import { replaceClaim } from './claim-cache.ts';

export function useClaimAssign() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.claim.assign.useMutation({
        onSuccess: ({ claim }, input) => {
            utils.claim.list.setData({ serverId: input.serverId }, (items) =>
                replaceClaim(items, claim)
            );
            utils.claim.list.setData({ chatId: claim.chatId, serverId: input.serverId }, (items) =>
                replaceClaim(items, claim)
            );
        },
    });
}

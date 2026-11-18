import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

export function useClaimRelease() {
    const assign = hausTrpc.claim.assign.useMutation({
        onError: (error) => toast.danger(`Could not release the claim: ${error.message}`),
    });
    return {
        isPending: assign.isPending,
        release: (input: { messageId: string; serverId: string; version: number }) =>
            assign.mutate({
                assignee: null,
                expectedVersion: input.version,
                messageId: input.messageId,
                serverId: input.serverId,
            }),
    };
}

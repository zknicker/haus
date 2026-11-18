import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/** Runs the Server-owned transient preview operation for one editable Agent. */
export function useAgentAvatarGeneration(serverId: string, agentId: string) {
    const mutation = hausTrpc.avatar.generate.useMutation();
    const generate = React.useCallback(
        (concept: string) => mutation.mutateAsync({ agentId, concept, serverId }),
        [agentId, mutation.mutateAsync, serverId]
    );

    return { ...mutation, generate };
}

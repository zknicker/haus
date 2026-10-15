import type { ArtifactUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `artifact.onUpdated`: a file in Files was published, moved, deleted, or lost a revision. Every
 * folder listing and the creator directory refresh, so an open Files folder fills in while Agents
 * push; a named file also refreshes its own metadata and version history, and a null id (a folder
 * move) refreshes every file's. Revision-keyed reads (download, text, thumbnail) are immutable and
 * never refresh.
 */
export function useArtifactUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('artifact.onUpdated', serverId, () => {
        if (serverId) {
            applyArtifactUpdate(coalescer, { artifactId: null, serverId });
        }
    });

    const { reset } = hausTrpc.artifact.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyArtifactUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyArtifactUpdate(
    coalescer: TargetedReadCoalescer,
    { artifactId, serverId }: ArtifactUpdatedEvent
) {
    const file = artifactId ? { artifact_id: artifactId, serverId } : { serverId };
    const invalidate = (queryKey: ReturnType<typeof getQueryKey>) =>
        coalescer.invalidate({ queryKey });
    invalidate(getQueryKey(hausTrpc.artifact.list, { serverId }));
    invalidate(getQueryKey(hausTrpc.artifact.creators, { serverId }));
    invalidate(getQueryKey(hausTrpc.artifact.get, file));
    invalidate(getQueryKey(hausTrpc.artifact.versions, file));
}

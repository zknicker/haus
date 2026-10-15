import type { ArtifactUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** At most one folder-listing refresh per window while an Agent pushes a burst of files. */
export const artifactListingRefreshMs = 300;

/**
 * `artifact.onUpdated`: a file in Files was published, moved, deleted, or lost a revision. Every
 * folder listing and the creator directory refresh, so an open Files folder fills in while Agents
 * push; a named file also refreshes its own metadata and version history, and a null id (a folder
 * move or a retention sweep) refreshes every file's. Revision-keyed reads (download, text,
 * thumbnail) are immutable and never refresh.
 *
 * Listings refresh at once on the first event, then at most once per
 * `artifactListingRefreshMs` with a trailing refresh, so fifty sequential pushes cost a handful
 * of listing refetches instead of fifty. Per-file reads stay immediate; recovery after a start
 * refreshes everything at once.
 */
export function useArtifactUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const [listings] = React.useState(createListingRefresh);
    React.useEffect(() => () => listings.dispose(), [listings]);
    const stream = useSubscriptionRestart('artifact.onUpdated', serverId, () => {
        if (serverId) {
            invalidateListings(coalescer, serverId);
            invalidateFiles(coalescer, { artifactId: null, serverId });
        }
    });

    const { reset } = hausTrpc.artifact.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                listings.request(event.serverId, () =>
                    invalidateListings(coalescer, event.serverId)
                );
                invalidateFiles(coalescer, event);
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

/**
 * A leading and trailing throttle per Server: the first request runs now and opens a window; a
 * request inside the window runs once when it closes, which opens the next window. A window with
 * no request closes for good, so the timer never outlives a burst.
 */
export function createListingRefresh(windowMs = artifactListingRefreshMs) {
    const windows = new Map<
        string,
        { pending: (() => void) | null; timer: ReturnType<typeof setTimeout> }
    >();
    const open = (serverId: string) => {
        const timer = setTimeout(() => {
            const pending = windows.get(serverId)?.pending;
            windows.delete(serverId);
            if (pending) {
                pending();
                open(serverId);
            }
        }, windowMs);
        windows.set(serverId, { pending: null, timer });
    };
    return {
        dispose() {
            for (const { timer } of windows.values()) {
                clearTimeout(timer);
            }
            windows.clear();
        },
        request(serverId: string, refresh: () => void) {
            const current = windows.get(serverId);
            if (current) {
                current.pending = refresh;
                return;
            }
            refresh();
            open(serverId);
        },
    };
}

function invalidateListings(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.artifact.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.artifact.creators, { serverId }) });
}

function invalidateFiles(
    coalescer: TargetedReadCoalescer,
    { artifactId, serverId }: ArtifactUpdatedEvent
) {
    const file = artifactId ? { artifact_id: artifactId, serverId } : { serverId };
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.artifact.get, file) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.artifact.versions, file) });
}

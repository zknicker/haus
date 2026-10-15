import type { ArtifactRecord } from '@haus/api';
import * as React from 'react';
import { useArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useViewShown } from '../../hooks/desktop-tabs/view-shown.ts';
import type { ArtifactViewerContext } from './library-params.ts';
import { librarySortOrder, useArtifactLibrarySort } from './library-sort.ts';

export interface ViewerSteps {
    next: ArtifactRecord | null;
    previous: ArtifactRecord | null;
}

/**
 * Previous and next for a file opened from the library: its neighbors in the
 * same folder view (filters, search, and the viewer's sort), read through the
 * library's own cached query. Reaching the last loaded file loads the next
 * page. A file opened from anywhere else has no neighbors.
 */
export function useViewerSteps(
    serverId: string,
    artifactId: string,
    context: ArtifactViewerContext | null
): ViewerSteps {
    const sort = useArtifactLibrarySort();
    const library = useArtifactLibrary(
        serverId,
        {
            creator: context?.creator ?? null,
            folder: context?.folder ?? '',
            kind: context?.kind ?? 'all',
            query: context?.query ?? '',
            sort: librarySortOrder(sort),
        },
        { enabled: context !== null }
    );
    const files = context ? (library.artifacts ?? []) : [];
    const index = files.findIndex((file) => file.artifact_id === artifactId);
    const atEnd = index >= 0 && index === files.length - 1;
    const { hasMore, isFetchingMore, loadMore } = library;
    React.useEffect(() => {
        if (atEnd && hasMore && !isFetchingMore) {
            loadMore();
        }
    }, [atEnd, hasMore, isFetchingMore, loadMore]);
    return {
        next: index >= 0 ? (files[index + 1] ?? null) : null,
        previous: index > 0 ? (files[index - 1] ?? null) : null,
    };
}

/**
 * ← and → step while the viewer is on screen and the keys are not someone
 * else's: a text field, or a dialog (the zoom viewer steps on its own).
 */
export function useViewerStepKeys(steps: { onNext?: () => void; onPrevious?: () => void }) {
    const shown = useViewShown();
    const step = React.useEffectEvent((event: KeyboardEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (
            event.defaultPrevented ||
            event.altKey ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            !shown.isShown() ||
            target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
        ) {
            return;
        }
        const run =
            event.key === 'ArrowLeft'
                ? steps.onPrevious
                : event.key === 'ArrowRight'
                  ? steps.onNext
                  : undefined;
        if (run) {
            event.preventDefault();
            run();
        }
    });
    React.useEffect(() => {
        window.addEventListener('keydown', step);
        return () => window.removeEventListener('keydown', step);
    }, []);
}

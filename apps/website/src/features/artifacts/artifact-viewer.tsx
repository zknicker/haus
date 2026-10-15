import { artifactPathParent } from '@haus/api';
import * as React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import type { BandCrumb } from '../shell/band-trail.ts';
import { PageBand } from '../shell/page-band.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { ArtifactInspector } from './artifact-inspector.tsx';
import { ArtifactPreview } from './artifact-preview.tsx';
import { ArtifactViewerHeader } from './artifact-viewer-header.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { rememberLibraryItem } from './library-focus.ts';
import {
    type ArtifactViewerContext,
    artifactViewerHref,
    libraryHref,
    parseViewerContext,
} from './library-params.ts';
import { useArtifactActions } from './use-artifact-actions.tsx';
import { useViewerStepKeys, useViewerSteps } from './use-viewer-steps.ts';

/**
 * One shared file. The band shows where it lives in the drive, each folder a
 * way back into the library; the heading and the tab keep its title. Below:
 * a calm header, the preview, and details with revision history beside it
 * (below it in a narrow pane). `?revision=` pins a revision; without it the
 * page follows the current one. Opened from the library, the URL carries that
 * folder view (`?in=`), and previous/next (buttons, ← →, and the zoom
 * viewer's arrows) step through its files in place.
 */
export function ArtifactViewer({
    artifactId,
    serverId,
    slug,
}: {
    artifactId: string;
    serverId: string;
    slug: string;
}) {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const pinnedRevisionId = params.get('revision') ?? undefined;
    const context = React.useMemo(() => parseViewerContext(params), [params]);
    const query = useArtifact(serverId, artifactId, pinnedRevisionId);
    const artifact = query.data?.artifact;
    const { actions, dialogs } = useArtifactActions({ serverId, slug, surface: 'viewer' });
    const steps = useViewerSteps(serverId, artifactId, context);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    useRevisionsAnchor(scrollRef, artifact !== undefined);
    const stepTo = (next: { artifact_id: string } | null, zoomed: boolean) =>
        next && context
            ? () => {
                  // Back from the viewer lands on the file it stepped to.
                  rememberLibraryItem(context.folder, next.artifact_id);
                  navigate(artifactViewerHref(slug, next.artifact_id, context), {
                      replace: true,
                      state: zoomed ? { zoomed: true } : null,
                  });
              }
            : undefined;
    const stepper = (zoomed: boolean) =>
        context
            ? { onNext: stepTo(steps.next, zoomed), onPrevious: stepTo(steps.previous, zoomed) }
            : null;
    useViewerStepKeys(stepper(false) ?? {});

    return (
        <ArtifactActionsContext value={actions}>
            <PageBand>
                <PageBand.Trail
                    crumbs={artifact ? artifactViewerCrumbs(slug, artifact.path) : []}
                    current={artifact?.filename ?? ''}
                />
            </PageBand>
            <div
                className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
                ref={scrollRef}
            >
                <PageColumn className="@container">
                    {query.error ? (
                        <p role="alert">{query.error.message}</p>
                    ) : artifact ? (
                        <>
                            <ArtifactViewerHeader
                                artifact={artifact}
                                latestHref={artifactViewerHref(slug, artifactId, context)}
                                pinned={pinnedRevisionId !== undefined}
                                serverId={serverId}
                                stepper={stepper(false)}
                            />
                            <div className="grid min-w-0 @4xl:grid-cols-[minmax(0,1fr)_18rem] items-start gap-8">
                                <ArtifactPreview
                                    artifact={artifact}
                                    key={artifact.revision_id}
                                    serverId={serverId}
                                    startZoomed={isZoomedEntry(location.state)}
                                    stepper={stepper(true)}
                                />
                                <ArtifactInspector
                                    artifact={artifact}
                                    revisionHref={(revisionId) =>
                                        revisionHrefFor(slug, artifactId, context, revisionId)
                                    }
                                    serverId={serverId}
                                />
                            </div>
                        </>
                    ) : (
                        <section aria-busy="true" aria-label="Loading file" className="min-h-32" />
                    )}
                </PageColumn>
            </div>
            {dialogs}
        </ArtifactActionsContext>
    );
}

function isZoomedEntry(state: unknown): boolean {
    return (
        typeof state === 'object' && state !== null && 'zoomed' in state && state.zoomed === true
    );
}

function revisionHrefFor(
    slug: string,
    artifactId: string,
    context: ArtifactViewerContext | null,
    revisionId: string
) {
    const href = artifactViewerHref(slug, artifactId, context);
    return `${href}${href.includes('?') ? '&' : '?'}revision=${encodeURIComponent(revisionId)}`;
}

/**
 * Version history (a file menu action) lands on `#revisions`: once the file
 * is on screen, its Revisions scroll into view.
 */
function useRevisionsAnchor(page: React.RefObject<HTMLElement | null>, ready: boolean) {
    const { hash } = useLocation();
    React.useEffect(() => {
        if (ready && hash === '#revisions') {
            // Scoped to this page: kept desktop tabs may hold other viewers.
            page.current?.querySelector('#revisions')?.scrollIntoView({ block: 'start' });
        }
    }, [hash, page, ready]);
}

/** Artifacts, then each folder above the file, every one opening that place in the library. */
function artifactViewerCrumbs(slug: string, path: string): BandCrumb[] {
    const root = { creator: null, folder: '', kind: 'all' } as const;
    return [
        { href: libraryHref(slug, root), label: 'Files' },
        ...artifactFolderCrumbs(artifactPathParent(path)).map((crumb) => ({
            href: libraryHref(slug, { ...root, folder: crumb.path }),
            label: crumb.label,
        })),
    ];
}

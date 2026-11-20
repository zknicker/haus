import { artifactPathKey, artifactPathParent } from '@haus/api';
import * as React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import type { BandCrumb } from '../shell/band-trail.ts';
import { PageBand } from '../shell/page-band.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { parseRevisionView, type RevisionView, revisionViewHref } from './artifact-compare-url.ts';
import { ArtifactCompare } from './artifact-compare.tsx';
import { ArtifactInspector } from './artifact-inspector.tsx';
import { ArtifactPreview } from './artifact-preview.tsx';
import { useArtifactTextDraftBase } from './artifact-text-drafts.ts';
import { artifactTextEditable } from './artifact-text-edit.ts';
import { ArtifactTextEditor } from './artifact-text-editor.tsx';
import { artifactTextRenderer } from './artifact-text.ts';
import { ArtifactViewerHeader } from './artifact-viewer-header.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { driveFolderLabel, driveRootLabel } from './drive-places.ts';
import { rememberLibraryItem } from './library-focus.ts';
import { artifactViewerHref, libraryHref, parseViewerContext } from './library-params.ts';
import { useArtifactActions } from './use-artifact-actions.tsx';
import { useViewerStepKeys, useViewerSteps } from './use-viewer-steps.ts';

/**
 * One shared file. The band shows where it lives in the Drive, each folder a
 * way back into the library; the heading and the tab keep its title. Below:
 * a calm header, the preview, and details with History beside it (below it
 * in a narrow pane). `?revision=` pins a revision; without it the page
 * follows the current one. `?compare=` puts a text file's preview in
 * Compare mode, from that revision to the one on screen. Edit swaps a
 * current text file's preview and details for a plain-text editor, and
 * holds previous/next until it closes; an unsaved draft reopens it on the
 * draft's own base. Opened from the
 * library, the URL carries that folder view (`?in=`), and previous/next
 * (buttons, ← →, and the zoom viewer's arrows) step through its files in
 * place.
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
    const view = parseRevisionView(params);
    const pinnedRevisionId = view.revision ?? undefined;
    const context = React.useMemo(() => parseViewerContext(params), [params]);
    const query = useArtifact(serverId, artifactId, pinnedRevisionId);
    const artifact = query.data?.artifact;
    const agents = useAgentAppearances(serverId);
    const viewHref = (next: RevisionView) =>
        revisionViewHref(artifactViewerHref(slug, artifactId, context), next);
    const compareFrom = artifact && artifactTextRenderer(artifact) ? view.compare : null;
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
    const [editing, setEditing] = React.useState<EditTarget | null>(null);
    const pinned = pinnedRevisionId !== undefined;
    const draftBase = useArtifactTextDraftBase(artifact ? { path: artifact.path, serverId } : null);
    const editRevisionId = pinned
        ? null
        : editing?.artifactId === artifactId
          ? editing.revisionId
          : draftBase;
    const stepper = (zoomed: boolean) =>
        context && !editRevisionId
            ? { onNext: stepTo(steps.next, zoomed), onPrevious: stepTo(steps.previous, zoomed) }
            : null;
    useViewerStepKeys(stepper(false) ?? {});
    const onEdit =
        artifact && !editRevisionId && artifactTextEditable(artifact, { pinned })
            ? () => setEditing({ artifactId, revisionId: artifact.revision_id })
            : null;

    return (
        <ArtifactActionsContext value={actions}>
            <PageBand>
                <PageBand.Trail
                    crumbs={artifact ? artifactViewerCrumbs(slug, artifact.path, agents) : []}
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
                                onEdit={onEdit}
                                pinned={pinned}
                                serverId={serverId}
                                stepper={stepper(false)}
                            />
                            {editRevisionId ? (
                                <ArtifactTextEditor
                                    artifact={artifact}
                                    onClose={() => setEditing(null)}
                                    revisionId={editRevisionId}
                                    serverId={serverId}
                                />
                            ) : (
                                <div className="grid min-w-0 items-start gap-8 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
                                    {compareFrom ? (
                                        <ArtifactCompare
                                            artifact={artifact}
                                            fromRevisionId={compareFrom}
                                            onView={(next, options) =>
                                                navigate(viewHref(next), options)
                                            }
                                            serverId={serverId}
                                        />
                                    ) : (
                                        <ArtifactPreview
                                            artifact={artifact}
                                            key={artifact.revision_id}
                                            serverId={serverId}
                                            startZoomed={isZoomedEntry(location.state)}
                                            stepper={stepper(true)}
                                        />
                                    )}
                                    <ArtifactInspector
                                        artifact={artifact}
                                        serverId={serverId}
                                        slug={slug}
                                        viewHref={viewHref}
                                    />
                                </div>
                            )}
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

/** The revision an edit started from, kept while live updates move the head. */
interface EditTarget {
    artifactId: string;
    revisionId: string;
}

function isZoomedEntry(state: unknown): boolean {
    return (
        typeof state === 'object' && state !== null && 'zoomed' in state && state.zoomed === true
    );
}

/**
 * History (a file menu action) lands on `#revisions`: once the file
 * is on screen, its History scrolls into view.
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

/**
 * Drive, then each folder above the file, every one opening that place in
 * the library. An Agent's folder reads as the Agent's name.
 */
function artifactViewerCrumbs(
    slug: string,
    path: string,
    agents: readonly { displayName: string; handle: string }[]
): BandCrumb[] {
    const root = { creator: null, folder: '', kind: 'all' } as const;
    const agentName = (handle: string) =>
        agents.find((agent) => artifactPathKey(agent.handle) === artifactPathKey(handle))
            ?.displayName;
    return [
        { href: libraryHref(slug, root), label: driveRootLabel },
        ...artifactFolderCrumbs(artifactPathParent(path)).map((crumb) => ({
            href: libraryHref(slug, { ...root, folder: crumb.path }),
            label: driveFolderLabel(crumb.path, agentName),
        })),
    ];
}

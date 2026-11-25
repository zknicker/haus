import { artifactPathParent } from '@haus/api';
import * as React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { PageBand } from '../shell/page-band.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { parseRevisionView, type RevisionView, revisionViewHref } from './artifact-compare-url.ts';
import { ArtifactFilePane } from './artifact-file-pane.tsx';
import { ArtifactInfoPanel, useArtifactInfoPanel } from './artifact-info-panel.tsx';
import { pinnedBehindHead } from './artifact-pinned-revision.ts';
import { artifactTextRenderer } from './artifact-text.ts';
import { artifactFolderTone } from './drive-folders.ts';
import { driveAgentName } from './drive-places.ts';
import { driveTreeRoot } from './drive-tree-model.ts';
import { workspaceBandTrail, workspacePathCrumbs } from './drive-workspace-trail.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import { rememberLibraryItem } from './library-focus.ts';
import { artifactViewerHref, parseViewerContext } from './library-params.ts';
import { useArtifactActions } from './use-artifact-actions.tsx';
import { useViewerStepKeys, useViewerSteps } from './use-viewer-steps.ts';

/**
 * One shared file, the right side of its area's workspace. The band stops at
 * the area; the file pane opens on a slim path row (crumbs, then View source,
 * History, Copy, Save, ⋯) over the file: text and Markdown as a document you
 * edit in place, anything else as its preview. `?revision=` pins a read-only
 * revision; `?compare=` puts a text file in Compare mode. `#revisions` or
 * `#details` open the side panel on History or Details. Opened from the
 * library, the URL carries that folder view (`?in=`), and previous/next
 * (← →, and the buttons while the tree is hidden) step through its files.
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
    const head = useArtifact(serverId, artifactId);
    const artifact = query.data?.artifact;
    const agentName = driveAgentName(useAgentAppearances(serverId));
    const info = useArtifactInfoPanel();
    const viewHref = (next: RevisionView) =>
        revisionViewHref(artifactViewerHref(slug, artifactId, context), next);
    const { actions, dialogs } = useArtifactActions({
        onShowHistory: () => info.open('revisions'),
        serverId,
        slug,
        surface: 'viewer',
    });
    const steps = useViewerSteps(serverId, artifactId, context);
    const stepTo = (next: { artifact_id: string } | null, zoomed: boolean) =>
        next && context
            ? () => {
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
    const root = artifact ? driveTreeRoot(artifact.path) : null;
    const trail = root === null ? null : workspaceBandTrail(slug, root, agentName);

    return (
        <ArtifactActionsContext value={actions}>
            <PageBand>
                <PageBand.Trail crumbs={trail?.crumbs ?? []} current={trail?.current ?? ''} />
            </PageBand>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {query.error ? (
                    <p className="p-6" role="alert">
                        {query.error.message}
                    </p>
                ) : artifact && root !== null ? (
                    <ArtifactFilePane
                        artifact={artifact}
                        serverId={serverId}
                        view={{
                            compareFrom: artifactTextRenderer(artifact) ? view.compare : null,
                            crumbs: workspacePathCrumbs(
                                slug,
                                root,
                                artifactPathParent(artifact.path)
                            ),
                            glyph: <ArtifactFolderIcon size={14} tone={artifactFolderTone(root)} />,
                            info,
                            latestHref: pinnedBehindHead(
                                pinnedRevisionId,
                                head.data?.artifact.revision_id
                            )
                                ? artifactViewerHref(slug, artifactId, context)
                                : null,
                            onCompareView: (next, options) =>
                                navigate(`${viewHref(next)}${location.hash}`, options),
                            pinnedRevisionId,
                            startEditing: entryFlag(location.state, 'editing'),
                            startZoomed: entryFlag(location.state, 'zoomed'),
                            stepper: stepper(false),
                            zoomStepper: stepper(true),
                        }}
                    />
                ) : (
                    <section aria-busy="true" aria-label="Loading file" className="min-h-32" />
                )}
            </div>
            {artifact && info.section ? (
                <ArtifactInfoPanel
                    artifact={artifact}
                    onClose={info.close}
                    onSection={info.open}
                    section={info.section}
                    serverId={serverId}
                    slug={slug}
                    viewHref={viewHref}
                />
            ) : null}
            {dialogs}
        </ArtifactActionsContext>
    );
}

function entryFlag(state: unknown, flag: 'editing' | 'zoomed') {
    return (
        typeof state === 'object' &&
        state !== null &&
        flag in state &&
        Reflect.get(state, flag) === true
    );
}

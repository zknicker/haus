import { useSearchParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { ArtifactInspector } from './artifact-inspector.tsx';
import { ArtifactPreview } from './artifact-preview.tsx';
import { ArtifactViewerHeader } from './artifact-viewer-header.tsx';
import { ArtifactsTopbar } from './artifacts-topbar.tsx';

/**
 * One shared file: a calm header, the preview, and details with revision
 * history beside it (below it in a narrow pane). `?revision=` pins a revision;
 * without it the page follows the current one.
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
    const pinnedRevisionId = params.get('revision') ?? undefined;
    const query = useArtifact(serverId, artifactId, pinnedRevisionId);
    const artifact = query.data?.artifact;

    return (
        <>
            <PageTopbar>
                <ArtifactsTopbar current={artifact?.title ?? ''} slug={slug} />
            </PageTopbar>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <PageColumn className="@container">
                    {query.error ? (
                        <p role="alert">{query.error.message}</p>
                    ) : artifact ? (
                        <>
                            <ArtifactViewerHeader
                                artifact={artifact}
                                pinned={pinnedRevisionId !== undefined}
                                serverId={serverId}
                                slug={slug}
                            />
                            <div className="grid min-w-0 @4xl:grid-cols-[minmax(0,1fr)_18rem] items-start gap-8">
                                <ArtifactPreview
                                    artifact={artifact}
                                    key={artifact.revision_id}
                                    serverId={serverId}
                                />
                                <ArtifactInspector
                                    artifact={artifact}
                                    serverId={serverId}
                                    slug={slug}
                                />
                            </div>
                        </>
                    ) : (
                        <section
                            aria-busy="true"
                            aria-label="Loading artifact"
                            className="min-h-32"
                        />
                    )}
                </PageColumn>
            </div>
        </>
    );
}

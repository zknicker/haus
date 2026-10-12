import { Button } from '@heroui/react';
import { Resizable } from '@heroui-pro/react/resizable';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifacts.ts';
import { SectionHeader } from '../shell/section-header.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { artifactPath } from './artifact-format.ts';
import { ArtifactInspector } from './artifact-inspector.tsx';
import { ArtifactPreview } from './artifact-preview.tsx';
import { ArtifactRefreshButton } from './artifact-toolbar.tsx';

export function SharedArtifactContent({
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
    const revisionId = params.get('revision') ?? undefined;
    const query = useArtifact(serverId, artifactId, revisionId);
    if (query.error) {
        return <p role="alert">{query.error.message}</p>;
    }
    if (!query.data) {
        return <section aria-label="Loading artifact" className="min-h-32" />;
    }
    const artifact = query.data.artifact;
    return (
        <section aria-label="Artifact viewer" className="flex min-h-0 flex-1 flex-col">
            <PageTopbar>
                <SectionHeader
                    description={`Revision ${artifact.revision_number}${revisionId ? ' · Fixed revision' : ' · Latest'}`}
                    meta={
                        <div className="flex min-w-0 items-center gap-2">
                            <Button
                                aria-label="All artifacts"
                                isIconOnly
                                onPress={() => navigate(`/s/${slug}/artifacts`)}
                                size="sm"
                                variant="ghost"
                            >
                                <ChevronLeft aria-hidden="true" size={16} />
                            </Button>
                            <h1 className="truncate font-semibold text-sm">{artifact.title}</h1>
                        </div>
                    }
                >
                    {revisionId ? (
                        <Link
                            className="shrink-0 text-accent text-xs"
                            to={artifactPath(slug, artifactId)}
                        >
                            Open latest
                        </Link>
                    ) : null}
                    <ArtifactRefreshButton onRefresh={() => query.refetch()} />
                </SectionHeader>
            </PageTopbar>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <ArtifactViewerLayout
                    inspector={
                        <ArtifactInspector
                            artifact={artifact}
                            key={artifact.artifact_id}
                            serverId={serverId}
                            slug={slug}
                        />
                    }
                    preview={
                        <ArtifactPreview
                            artifact={artifact}
                            key={artifact.revision_id}
                            serverId={serverId}
                        />
                    }
                />
            </div>
        </section>
    );
}
function ArtifactViewerLayout({
    preview,
    inspector,
}: {
    preview: ReactNode;
    inspector: ReactNode;
}) {
    const wide = useSyncExternalStore(subscribeWidth, wideViewport, () => false);
    if (!wide) {
        return (
            <div className="flex flex-col gap-4">
                <div className="h-[60vh] min-h-80">{preview}</div>
                {inspector}
            </div>
        );
    }
    return (
        <div className="h-full min-h-0">
            <Resizable autoSaveId="haus-artifact-inspector" orientation="horizontal">
                <Resizable.Panel minSize="300px">{preview}</Resizable.Panel>
                <Resizable.Handle />
                <Resizable.Panel
                    defaultSize="300px"
                    groupResizeBehavior="preserve-pixel-size"
                    maxSize="420px"
                    minSize="260px"
                >
                    {inspector}
                </Resizable.Panel>
            </Resizable>
        </div>
    );
}
function subscribeWidth(notify: () => void) {
    const query = window.matchMedia('(min-width: 1024px)');
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
}
function wideViewport() {
    return window.matchMedia('(min-width: 1024px)').matches;
}

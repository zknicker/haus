import type { ArtifactRecord } from '@haus/api';
import { useArtifactCompareTexts } from '../../hooks/artifacts/use-artifact-compare-texts.ts';
import { useArtifactVersions } from '../../hooks/artifacts/use-artifact-versions.ts';
import { ArtifactCompareBar } from './artifact-compare-bar.tsx';
import type { RevisionView } from './artifact-compare-url.ts';
import { ArtifactDiff } from './artifact-diff.tsx';

export function ArtifactCompare({
    artifact,
    fromRevisionId,
    onView,
    serverId,
}: {
    artifact: ArtifactRecord;
    fromRevisionId: string;
    onView: (view: RevisionView, options: { replace: boolean }) => void;
    serverId: string;
}) {
    const { versions } = useArtifactVersions(serverId, artifact.artifact_id);
    const currentId = versions?.[0]?.revision_id;
    const toRevisionId = artifact.revision_id;
    const texts = useArtifactCompareTexts(
        serverId,
        artifact.artifact_id,
        {
            revisionId: fromRevisionId,
            sizeBytes: versions?.find((version) => version.revision_id === fromRevisionId)
                ?.size_bytes,
        },
        { revisionId: toRevisionId, sizeBytes: artifact.size_bytes }
    );
    const pinned = (revisionId: string) => (revisionId === currentId ? null : revisionId);
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <ArtifactCompareBar
                fromRevisionId={fromRevisionId}
                onDone={() => onView({ compare: null, revision: null }, { replace: false })}
                onFromChange={(revisionId) =>
                    onView(
                        { compare: revisionId, revision: pinned(toRevisionId) },
                        { replace: true }
                    )
                }
                onToChange={(revisionId) =>
                    onView(
                        { compare: fromRevisionId, revision: pinned(revisionId) },
                        { replace: true }
                    )
                }
                serverId={serverId}
                toRevisionId={toRevisionId}
                versions={versions ?? []}
            />
            {texts.status === 'ready' && texts.from !== texts.to ? (
                <section aria-label="Changes" className="artifact-preview artifact-preview--text">
                    <div className="h-full overflow-y-auto">
                        <ArtifactDiff
                            filename={artifact.filename}
                            from={texts.from}
                            fromRevisionId={fromRevisionId}
                            to={texts.to}
                            toRevisionId={toRevisionId}
                        />
                    </div>
                </section>
            ) : (
                <section
                    aria-busy={texts.status === 'loading'}
                    aria-label="Changes"
                    className="artifact-preview"
                >
                    {texts.status === 'failed' ? (
                        <p className="text-muted text-sm" role="alert">
                            {texts.message}
                        </p>
                    ) : texts.status === 'ready' ? (
                        <p className="text-muted text-sm">No changes</p>
                    ) : null}
                </section>
            )}
        </div>
    );
}

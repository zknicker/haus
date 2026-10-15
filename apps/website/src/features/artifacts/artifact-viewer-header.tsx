import type { ArtifactMetadata, ArtifactPublicLink } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useArtifactPublicLink } from '../../hooks/artifacts/use-artifact-public-link.ts';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { artifactKindLabel, artifactPath, artifactTimeLabel } from './artifact-format.ts';
import { copyArtifactLink } from './artifact-link.ts';
import { PublicLinkChip } from './artifact-public-link-mark.tsx';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';
import { usePublicLinkActions } from './use-public-link-actions.ts';

/** Who made the file and when it last changed, with its actions behind one ⋮ button. */
export function ArtifactViewerHeader({
    artifact,
    pinned,
    serverId,
    slug,
}: {
    artifact: ArtifactMetadata;
    pinned: boolean;
    serverId: string;
    slug: string;
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const now = useRelativeNow(60_000);
    const kind = artifactFileKind(artifact);
    const publicLink = useArtifactPublicLink(serverId, artifact.artifact_id);
    return (
        <header className="flex items-center gap-4">
            <ArtifactFileIcon kind={kind} size={48} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h1 className="truncate font-semibold text-2xl text-foreground tracking-tight">
                    {artifact.title}
                </h1>
                <p className="truncate text-muted text-sm">
                    {artifactKindLabel(kind)} · {directory.name(artifact.creator)} ·{' '}
                    {pinned ? `Revision ${artifact.revision_number}, ` : 'Updated '}
                    {artifactTimeLabel(artifact.updated_at, now)}
                    {pinned ? (
                        <>
                            {' · '}
                            <Link
                                className="text-accent"
                                to={artifactPath(slug, artifact.artifact_id)}
                            >
                                Open latest
                            </Link>
                        </>
                    ) : null}
                </p>
            </div>
            {publicLink ? <PublicLinkChip /> : null}
            <ArtifactViewerMenu artifact={artifact} publicLink={publicLink} serverId={serverId} />
        </header>
    );
}

function ArtifactViewerMenu({
    artifact,
    publicLink,
    serverId,
}: {
    artifact: ArtifactMetadata;
    publicLink: ArtifactPublicLink | null;
    serverId: string;
}) {
    const { saveFile } = useArtifactSave(serverId);
    const publicLinks = usePublicLinkActions(serverId);
    return (
        <Dropdown>
            <Button aria-label="File actions" isIconOnly variant="ghost">
                <Icon icon={MoreVerticalIcon} size={18} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    <Dropdown.Item
                        id="download"
                        onAction={() =>
                            void saveFile({
                                artifactId: artifact.artifact_id,
                                revisionId: artifact.revision_id,
                            })
                        }
                        textValue="Download"
                    >
                        <Label>Download</Label>
                    </Dropdown.Item>
                    <Dropdown.Item
                        id="copy"
                        onAction={() => void copyArtifactLink(artifact.stable_url)}
                        textValue="Copy link"
                    >
                        <Label>Copy link</Label>
                    </Dropdown.Item>
                    <Dropdown.Item
                        id="copy-revision"
                        onAction={() =>
                            void copyArtifactLink(artifact.version_url, 'Revision link copied')
                        }
                        textValue="Copy link to this revision"
                    >
                        <Label>Copy link to this revision</Label>
                    </Dropdown.Item>
                    <Dropdown.Item
                        id="copy-public"
                        onAction={() => void publicLinks.copy(artifact.artifact_id)}
                        textValue="Copy public link"
                    >
                        <Label>Copy public link</Label>
                    </Dropdown.Item>
                    {publicLink?.can_disable ? (
                        <Dropdown.Item
                            id="disable-public"
                            onAction={() => void publicLinks.disable(artifact.artifact_id)}
                            textValue="Disable public link"
                        >
                            <Label>Disable public link</Label>
                        </Dropdown.Item>
                    ) : null}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

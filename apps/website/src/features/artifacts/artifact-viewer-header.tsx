import type { ArtifactMetadata, ArtifactPublicLink } from '@haus/api';
import { Button, Dropdown } from '@heroui/react';
import { MoreVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useArtifactPublicLink } from '../../hooks/artifacts/use-artifact-public-link.ts';
import { artifactActionItems } from './artifact-action-items.tsx';
import type { FileActionId } from './artifact-actions.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { artifactKindLabel, artifactPath, artifactTimeLabel } from './artifact-format.ts';
import { PublicLinkChip } from './artifact-public-link-mark.tsx';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

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
            <ArtifactViewerMenu artifact={artifact} publicLink={publicLink} />
        </header>
    );
}

/** The viewer's ⋮ menu: the library's file actions for its own surface. */
function ArtifactViewerMenu({
    artifact,
    publicLink,
}: {
    artifact: ArtifactMetadata;
    publicLink: ArtifactPublicLink | null;
}) {
    const actions = useArtifactActionsContext();
    return (
        <Dropdown>
            <Button aria-label="File actions" isIconOnly variant="ghost">
                <Icon icon={MoreVerticalIcon} size={18} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="File actions"
                    onAction={(key) => actions.runFile(key as FileActionId, artifact)}
                >
                    {artifactActionItems(actions.fileActions(artifact, publicLink))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

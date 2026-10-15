import type { ArtifactPublicLink, ArtifactRecord } from '@haus/api';
import { Button, Dropdown } from '@heroui/react';
import {
    ArrowLeft01Icon,
    ArrowRight01Icon,
    MoreVerticalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useArtifactPublicLink } from '../../hooks/artifacts/use-artifact-public-link.ts';
import { artifactActionItems } from './artifact-action-items.tsx';
import type { FileActionId } from './artifact-actions.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { artifactKindLabel, artifactTimeLabel } from './artifact-format.ts';
import { PublicLinkChip } from './artifact-public-link-mark.tsx';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/** Stepping through the folder the file was opened from; a missing side has nothing there. */
export interface ViewerStepper {
    onNext?: () => void;
    onPrevious?: () => void;
}

/**
 * The file's title, kind, who published this revision (their mark and name)
 * and when, with previous/next through its folder and its actions behind one
 * ⋮ button.
 */
export function ArtifactViewerHeader({
    artifact,
    latestHref,
    pinned,
    serverId,
    stepper,
}: {
    artifact: ArtifactRecord;
    latestHref: string;
    pinned: boolean;
    serverId: string;
    stepper: ViewerStepper | null;
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const now = useRelativeNow(60_000);
    const kind = artifactFileKind(artifact);
    const publicLink = useArtifactPublicLink(serverId, artifact.artifact_id);
    const author = directory.avatar(artifact.author);
    return (
        <header className="artifact-viewer-header flex items-center gap-4">
            <ArtifactFileIcon kind={kind} size={48} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h1 className="truncate font-semibold text-2xl text-foreground tracking-tight">
                    {artifact.title}
                </h1>
                <p className="flex min-w-0 items-center gap-1.5 text-muted text-sm">
                    <span className="shrink-0">{artifactKindLabel(kind)} ·</span>
                    <EntityAvatar name={author.name} size={16} src={author.src} />
                    <span className="truncate">
                        {directory.name(artifact.author)} ·{' '}
                        {pinned ? `Revision ${artifact.revision_number}, ` : 'Updated '}
                        {artifactTimeLabel(artifact.updated_at, now)}
                        {pinned ? (
                            <>
                                {' · '}
                                <Link className="text-accent" to={latestHref}>
                                    Open latest
                                </Link>
                            </>
                        ) : null}
                    </span>
                </p>
            </div>
            {publicLink ? <PublicLinkChip /> : null}
            {stepper ? <ViewerSteps stepper={stepper} /> : null}
            <ArtifactViewerMenu artifact={artifact} publicLink={publicLink} />
        </header>
    );
}

/** Previous and next file; ← and → do the same. */
function ViewerSteps({ stepper }: { stepper: ViewerStepper }) {
    return (
        <div className="flex items-center">
            <Button
                aria-label="Previous file"
                isDisabled={!stepper.onPrevious}
                isIconOnly
                onPress={stepper.onPrevious}
                variant="ghost"
            >
                <Icon icon={ArrowLeft01Icon} size={18} />
            </Button>
            <Button
                aria-label="Next file"
                isDisabled={!stepper.onNext}
                isIconOnly
                onPress={stepper.onNext}
                variant="ghost"
            >
                <Icon icon={ArrowRight01Icon} size={18} />
            </Button>
        </div>
    );
}

/** The viewer's ⋮ menu: the library's file actions for its own surface. */
function ArtifactViewerMenu({
    artifact,
    publicLink,
}: {
    artifact: ArtifactRecord;
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

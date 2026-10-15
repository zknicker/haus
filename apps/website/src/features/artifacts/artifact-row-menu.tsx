import type { ArtifactPublicLink } from '@haus/api';
import { Button, Dropdown } from '@heroui/react';
import { MoreVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { artifactActionItems } from './artifact-action-items.tsx';
import type { FileActionId } from './artifact-actions.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import type { ActionFile } from './use-artifact-actions.tsx';

/** A library file's actions behind its ⋮ button: the same list its right-click menu shows. */
export function ArtifactRowMenu({
    artifact,
    publicLink,
}: {
    artifact: ActionFile;
    publicLink: ArtifactPublicLink | null;
}) {
    const actions = useArtifactActionsContext();
    return (
        <Dropdown>
            <Button
                aria-label={`Actions for ${artifact.filename}`}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon icon={MoreVerticalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label={`Actions for ${artifact.filename}`}
                    onAction={(key) => actions.runFile(key as FileActionId, artifact)}
                >
                    {artifactActionItems(actions.fileActions(artifact, publicLink))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

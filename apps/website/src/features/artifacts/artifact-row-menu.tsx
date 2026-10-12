import type { ArtifactMetadata } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { copyArtifactLink } from './artifact-link.ts';

/** A library file's rare actions, behind its ⋮ button. */
export function ArtifactRowMenu({
    artifact,
    onOpen,
    serverId,
}: {
    artifact: Pick<ArtifactMetadata, 'artifact_id' | 'revision_id' | 'stable_url' | 'title'>;
    onOpen: () => void;
    serverId: string;
}) {
    const { saveFile } = useArtifactSave(serverId);
    return (
        <Dropdown>
            <Button
                aria-label={`Actions for ${artifact.title}`}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon icon={MoreVerticalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    <Dropdown.Item id="open" onAction={onOpen} textValue="Open">
                        <Label>Open</Label>
                    </Dropdown.Item>
                    <Dropdown.Item
                        id="copy"
                        onAction={() => void copyArtifactLink(artifact.stable_url)}
                        textValue="Copy link"
                    >
                        <Label>Copy link</Label>
                    </Dropdown.Item>
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
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

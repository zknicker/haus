import type { ArtifactMetadata, ArtifactPublicLink } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreVerticalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { copyArtifactLink } from './artifact-link.ts';
import { ArtifactRenameDialog } from './artifact-rename-dialog.tsx';
import { usePublicLinkActions } from './use-public-link-actions.ts';

/** A library file's rare actions, behind its ⋮ button. */
export function ArtifactRowMenu({
    artifact,
    onOpen,
    publicLink,
    serverId,
}: {
    artifact: Pick<
        ArtifactMetadata,
        'artifact_id' | 'filename' | 'path' | 'revision_id' | 'stable_url'
    >;
    onOpen: () => void;
    publicLink: ArtifactPublicLink | null;
    serverId: string;
}) {
    const { saveFile } = useArtifactSave(serverId);
    const publicLinks = usePublicLinkActions(serverId);
    const [renaming, setRenaming] = useState(false);
    return (
        <>
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
                    <Dropdown.Menu>
                        <Dropdown.Item id="open" {...opensPlace} onAction={onOpen} textValue="Open">
                            <Label>Open</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                            id="rename"
                            onAction={() => setRenaming(true)}
                            textValue="Rename"
                        >
                            <Label>Rename</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                            id="copy"
                            onAction={() => void copyArtifactLink(artifact.stable_url)}
                            textValue="Copy link"
                        >
                            <Label>Copy link</Label>
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
            <ArtifactRenameDialog
                onClose={() => setRenaming(false)}
                serverId={serverId}
                target={
                    renaming
                        ? { kind: 'file', path: artifact.path, revisionId: artifact.revision_id }
                        : null
                }
            />
        </>
    );
}

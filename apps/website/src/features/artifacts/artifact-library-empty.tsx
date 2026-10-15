import { Button } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { FolderLibraryIcon, Upload04Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/**
 * Shown only for a real zero. A filtered zero points at the filters; an
 * empty drive or folder offers the upload that would fill it.
 */
export function ArtifactLibraryEmpty({
    atRoot,
    filtered,
    onUpload,
}: {
    atRoot: boolean;
    filtered: boolean;
    onUpload: () => void;
}) {
    const title = filtered ? 'No matching files' : atRoot ? 'No files yet' : 'No files here';
    const description = filtered
        ? 'Try another file type, creator, or search.'
        : atRoot
          ? 'Files Agents and members publish to this Server appear here. Drop files anywhere to upload.'
          : 'Drop files here or upload them into this folder.';
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={FolderLibraryIcon} />
                </EmptyState.Media>
                <EmptyState.Title>{title}</EmptyState.Title>
                <EmptyState.Description>{description}</EmptyState.Description>
            </EmptyState.Header>
            {filtered ? null : (
                <EmptyState.Content>
                    <Button onPress={onUpload} size="sm" variant="secondary">
                        <Icon aria-hidden="true" icon={Upload04Icon} size={16} />
                        Upload files
                    </Button>
                </EmptyState.Content>
            )}
        </EmptyState>
    );
}

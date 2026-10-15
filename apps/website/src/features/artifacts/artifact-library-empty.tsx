import { artifactPathParent } from '@haus/api';
import { Button } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import {
    FolderLibraryIcon,
    FolderOpenIcon,
    Upload04Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/**
 * Shown only for a real zero. A filtered zero points at the filters; an
 * empty drive offers the upload that would fill it. Folders exist only while
 * a file sits in them, so an unfiltered zero below the root is a folder that
 * is not there (a stale link, or its last file moved away): it says so and
 * offers the way back up.
 */
export function ArtifactLibraryEmpty({
    filtered,
    folder,
    onOpenFolder,
    onUpload,
}: {
    filtered: boolean;
    folder: string;
    onOpenFolder: (path: string) => void;
    onUpload: () => void;
}) {
    if (folder !== '' && !filtered) {
        return <MissingFolder folder={folder} onOpenFolder={onOpenFolder} />;
    }
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={FolderLibraryIcon} />
                </EmptyState.Media>
                <EmptyState.Title>
                    {filtered ? 'No matching files' : 'No files yet'}
                </EmptyState.Title>
                <EmptyState.Description>
                    {filtered
                        ? 'Try another file type, creator, or search.'
                        : 'Files Agents and members publish to this Server appear here. Drop files anywhere to upload.'}
                </EmptyState.Description>
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

function MissingFolder({
    folder,
    onOpenFolder,
}: {
    folder: string;
    onOpenFolder: (path: string) => void;
}) {
    const parent = artifactPathParent(folder);
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={FolderOpenIcon} />
                </EmptyState.Media>
                <EmptyState.Title>Folder not found</EmptyState.Title>
                <EmptyState.Description>
                    Nothing lives in “{folder}”. It may have been moved or renamed, or its last file
                    deleted.
                </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content className="flex-row gap-2">
                {parent ? (
                    <Button onPress={() => onOpenFolder(parent)} size="sm" variant="secondary">
                        Open enclosing folder
                    </Button>
                ) : null}
                <Button onPress={() => onOpenFolder('')} size="sm" variant="secondary">
                    Go to Files
                </Button>
            </EmptyState.Content>
        </EmptyState>
    );
}

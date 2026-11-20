import { artifactPathParent } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import {
    FolderLibraryIcon,
    FolderOpenIcon,
    Upload04Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    driveAcceptsFiles,
    driveFolderIsFixed,
    drivePlace,
    driveRootLabel,
} from './drive-places.ts';

/**
 * Shown only for a real zero. A filtered zero points at the filters. An empty
 * shelf says what fills it, and an empty area offers the upload that would.
 * Any other folder exists only while a file sits in it, so an unfiltered zero
 * there is a folder that is not there (a stale link, or its last file moved
 * away): it says so and offers the way back up.
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
    const place = drivePlace(folder);
    if (filtered) {
        return (
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={FolderLibraryIcon} />
                    </EmptyState.Media>
                    <EmptyState.Title>No matching files</EmptyState.Title>
                    <EmptyState.Description>
                        Try another file type, creator, or search.
                    </EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        );
    }
    if (place.kind === 'shelf') {
        return (
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={FolderLibraryIcon} />
                    </EmptyState.Media>
                    <EmptyState.Title>
                        {place.shelf === 'projects' ? 'No projects yet' : 'No Captains yet'}
                    </EmptyState.Title>
                    <EmptyState.Description>
                        {place.shelf === 'projects'
                            ? 'Project folders arrive with Projects.'
                            : 'Each Captain gets a folder here.'}
                    </EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        );
    }
    if (folder !== '' && !driveFolderIsFixed(folder)) {
        return <MissingFolder folder={folder} onOpenFolder={onOpenFolder} />;
    }
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={FolderLibraryIcon} />
                </EmptyState.Media>
                <EmptyState.Title>No files yet</EmptyState.Title>
                {driveAcceptsFiles(folder) ? (
                    <EmptyState.Description>Drop files anywhere to upload.</EmptyState.Description>
                ) : null}
            </EmptyState.Header>
            {driveAcceptsFiles(folder) ? (
                <EmptyState.Content>
                    <Button onPress={onUpload} size="sm" variant="secondary">
                        <Icon aria-hidden="true" icon={Upload04Icon} size={16} />
                        Upload files
                    </Button>
                </EmptyState.Content>
            ) : null}
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
                    Go to {driveRootLabel}
                </Button>
            </EmptyState.Content>
        </EmptyState>
    );
}

import { type ArtifactMetadata, artifactPathKey, artifactPathParent } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import {
    FileAddIcon,
    FolderLibraryIcon,
    FolderOpenIcon,
    NoteEditIcon,
    Upload04Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { HausMascot } from '../../components/haus-mascot.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useAddAreaRules } from '../../hooks/artifacts/use-add-area-rules.ts';
import {
    driveAcceptsFiles,
    driveFolderIsFixed,
    drivePlace,
    driveRootLabel,
} from './drive-places.ts';

/**
 * Shown only for a real zero. A filtered zero points at the filters. An empty
 * shelf says what fills it. An empty area sits the mascot over the page's
 * middle, as Capy does, and offers what would fill it: its instructions
 * (`AGENTS.md`, at the area's root) and an upload.
 * Any other folder exists only while a file sits in it, so an unfiltered zero
 * there is a folder that is not there (a stale link, or its last file moved
 * away): it says so and offers the way back up.
 */
export function ArtifactLibraryEmpty({
    filtered,
    folder,
    folderName,
    newFile,
    onOpenFile,
    onOpenFolder,
    onUpload,
    serverId,
}: {
    filtered: boolean;
    folder: string;
    folderName: string;
    newFile?: { isPending: boolean; run: () => void };
    onOpenFile: (artifact: ArtifactMetadata) => void;
    onOpenFolder: (path: string) => void;
    onUpload: () => void;
    serverId: string;
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
        <EmptyArea
            folder={folder}
            folderName={folderName}
            newFile={newFile}
            onOpenFile={onOpenFile}
            onUpload={onUpload}
            serverId={serverId}
        />
    );
}

function EmptyArea({
    folder,
    folderName,
    newFile,
    onOpenFile,
    onUpload,
    serverId,
}: {
    folder: string;
    folderName: string;
    newFile?: { isPending: boolean; run: () => void };
    onOpenFile: (artifact: ArtifactMetadata) => void;
    onUpload: () => void;
    serverId: string;
}) {
    const addRules = useAddAreaRules(serverId, onOpenFile);
    const place = drivePlace(folder);
    const areaRoot =
        place.kind === 'area' && artifactPathKey(place.folder) === artifactPathKey(place.area.root);
    const uploads = driveAcceptsFiles(folder);
    return (
        <EmptyState className="library-empty">
            <EmptyState.Header>
                <EmptyState.Media>
                    <HausMascot aria-hidden="true" className="library-empty__mascot" size={88} />
                </EmptyState.Media>
                <EmptyState.Title>No files yet</EmptyState.Title>
                {uploads ? (
                    <EmptyState.Description>
                        {areaRoot
                            ? 'Add instructions by hand, or drop files anywhere to upload.'
                            : 'Drop files anywhere to upload.'}
                    </EmptyState.Description>
                ) : null}
            </EmptyState.Header>
            {uploads ? (
                <EmptyState.Content className="flex-row gap-2">
                    {areaRoot ? (
                        <Button
                            isPending={addRules.isPending}
                            onPress={() => addRules.mutate({ folder, title: folderName })}
                            size="sm"
                            variant="outline"
                        >
                            <Icon aria-hidden="true" icon={NoteEditIcon} size={16} />
                            Add instructions
                        </Button>
                    ) : null}
                    {newFile ? (
                        <Button
                            isPending={newFile.isPending}
                            onPress={newFile.run}
                            size="sm"
                            variant="outline"
                        >
                            <Icon aria-hidden="true" icon={FileAddIcon} size={16} />
                            New file
                        </Button>
                    ) : null}
                    <Button onPress={onUpload} size="sm" variant="outline">
                        <Icon aria-hidden="true" icon={Upload04Icon} size={16} />
                        Upload
                    </Button>
                </EmptyState.Content>
            ) : null}
            {addRules.error ? <p role="alert">{addRules.error.message}</p> : null}
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
                    <Button onPress={() => onOpenFolder(parent)} size="sm" variant="outline">
                        Open enclosing folder
                    </Button>
                ) : null}
                <Button onPress={() => onOpenFolder('')} size="sm" variant="outline">
                    Go to {driveRootLabel}
                </Button>
            </EmptyState.Content>
        </EmptyState>
    );
}
